'use server';

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { callAzureOpenAI } from '@/lib/azure-openai';
import {
  modelNames,
  PortfolioAssetTypeEnum,
  PortfolioCurrencyEnum,
  PortfolioEntrySourceEnum,
  PortfolioTransactionTypeEnum,
  type AIModel,
  type PortfolioAsset,
} from '@/lib/types';

const ParsedPortfolioEntrySchema = z.discriminatedUnion('entryKind', [
  z.object({
    entryKind: z.literal('transaction'),
    assetName: z.string().describe("Name of the fund, stock, crypto, or instrument."),
    assetType: PortfolioAssetTypeEnum.default('other'),
    type: PortfolioTransactionTypeEnum,
    date: z.string().describe("YYYY-MM-DD. Use today's date if no date is visible or mentioned."),
    amount: z.number().gt(0).describe("Total transaction amount. Required."),
    quantity: z.number().gt(0).nullish(),
    pricePerUnit: z.number().gt(0).nullish(),
    charges: z.number().min(0).nullish(),
    taxes: z.number().min(0).nullish(),
    currency: PortfolioCurrencyEnum.default('INR'),
    notes: z.string().nullish(),
    source: PortfolioEntrySourceEnum.default('ai_text'),
  }),
  z.object({
    entryKind: z.literal('valuation'),
    assetName: z.string().describe("Name of the fund, stock, crypto, or instrument."),
    assetType: PortfolioAssetTypeEnum.default('other'),
    date: z.string().describe("YYYY-MM-DD. Use today's date if no date is visible or mentioned."),
    totalValue: z.number().gt(0).describe("Current total value of this holding. Required."),
    quantity: z.number().gt(0).nullish(),
    pricePerUnit: z.number().gt(0).nullish(),
    currency: PortfolioCurrencyEnum.default('INR'),
    notes: z.string().nullish(),
    source: PortfolioEntrySourceEnum.default('ai_text'),
  }),
]);

const ParsePortfolioEntryOutputSchema = z.object({
  entries: z.array(ParsedPortfolioEntrySchema).describe("One or more portfolio entries parsed from the input."),
  summary: z.string().nullish().describe("Short human-readable summary of what was parsed."),
  needsReview: z.boolean().default(true),
});

const ParsePortfolioEntryInputSchema = z.object({
  text: z.string().optional(),
  receiptImageUri: z.string().optional().describe("A screenshot as a data URI. Named receiptImageUri so the shared Azure vision helper attaches it."),
  today: z.string(),
  existingAssets: z.array(z.object({
    id: z.string(),
    name: z.string(),
    assetType: PortfolioAssetTypeEnum,
    currency: PortfolioCurrencyEnum,
  })),
  preferredAssetId: z.string().optional(),
  preferredAssetName: z.string().optional(),
  model: z.enum(modelNames).optional(),
});

export type ParsedPortfolioEntry = z.infer<typeof ParsedPortfolioEntrySchema>;
export type ParsePortfolioEntryOutput = z.infer<typeof ParsePortfolioEntryOutputSchema>;

export async function parsePortfolioEntryWithAI(input: {
  text?: string;
  imageDataUri?: string;
  existingAssets: Pick<PortfolioAsset, 'id' | 'name' | 'assetType' | 'currency'>[];
  preferredAssetId?: string;
  preferredAssetName?: string;
  model?: AIModel;
}): Promise<ParsePortfolioEntryOutput> {
  const today = new Date().toISOString().slice(0, 10);
  const modelToUse = input.model || 'gemini-3-flash-preview';
  const flowInput = {
    text: input.text,
    receiptImageUri: input.imageDataUri,
    today,
    existingAssets: input.existingAssets,
    preferredAssetId: input.preferredAssetId,
    preferredAssetName: input.preferredAssetName,
    model: modelToUse,
  };

  if (modelToUse === 'gpt-5.2-chat') {
    return callAzureOpenAI(promptTemplate, flowInput, ParsePortfolioEntryOutputSchema);
  }

  const result = await parsePortfolioEntryFlow(flowInput);
  return result;
}

const parsePortfolioEntryFlow = ai.defineFlow(
  {
    name: 'parsePortfolioEntryFlow',
    inputSchema: ParsePortfolioEntryInputSchema,
    outputSchema: ParsePortfolioEntryOutputSchema,
  },
  async (input) => {
    const model = input.model || 'gemini-3-flash-preview';
    const prompt = ai.definePrompt({
      name: 'parsePortfolioEntryPrompt',
      input: { schema: ParsePortfolioEntryInputSchema.omit({ model: true }) },
      output: { schema: ParsePortfolioEntryOutputSchema },
      config: { temperature: 0.1, maxOutputTokens: 1400 },
      prompt: promptTemplate,
    });
    const { output } = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }), 3, 2000);
    if (!output) throw new Error("Portfolio parser returned no output.");
    return output;
  }
);

const promptTemplate = `You are parsing portfolio/investment records for an Indian personal-finance app.

The user may provide plain text OR an app screenshot. Extract only clearly present investment information.

TODAY: {{today}}
PREFERRED ASSET: {{preferredAssetName}}

USER TEXT:
"{{text}}"

EXISTING ASSETS:
\`\`\`json
{{{json existingAssets}}}
\`\`\`

SCREENSHOT:
{{media url=receiptImageUri}}

Return JSON with:
{
  "entries": [...],
  "summary": "...",
  "needsReview": true
}

ENTRY TYPES:
1. transaction:
   - Use for buy, sell, dividend, interest, or fee.
   - Required fields: entryKind="transaction", assetName, assetType, type, date, amount.
   - quantity, pricePerUnit, charges, taxes are optional. Do not invent them.
2. valuation:
   - Use when the user says current value/current NAV/current market value/current holding value.
   - Required fields: entryKind="valuation", assetName, assetType, date, totalValue.
   - quantity and pricePerUnit are optional. Do not invent them.

ASSET TYPE:
- mutual_fund: mutual funds, SIPs, NAV, AMC schemes.
- indian_equity: NSE/BSE/Indian stocks.
- us_equity: US stocks/ETFs such as Apple, Tesla, VOO, QQQ.
- crypto: BTC, ETH, crypto exchange holdings.
- gold: gold, SGB, digital gold.
- fd_rd: fixed deposit, recurring deposit.
- other: anything else.

CURRENCY:
- Default INR.
- Use USD only when the input clearly says dollars, $, US stock amount in USD, or dollar brokerage context.

DATE:
- Output YYYY-MM-DD.
- If not visible/mentioned, use {{today}}.

AMOUNTS:
- Strip ₹, Rs, INR, commas.
- Convert k=1000, lakh/lac/L=100000, cr/crore=10000000.
- "Bought Parag Parikh for 10k" means transaction buy amount 10000.
- "Current value of BTC is 3.2L" means valuation totalValue 320000.

ASSET NAME:
- Prefer the existing asset name if the input clearly refers to one.
- If PREFERRED ASSET is present and the input is vague ("current value is 50k", "sold 10k"), use the preferred asset.
- Do not output entries where the asset name or amount is genuinely missing.

NOTES:
- Keep short. Include useful context such as screenshot row label, broker, folio note, or uncertainty.

OUTPUT JSON ONLY.`;

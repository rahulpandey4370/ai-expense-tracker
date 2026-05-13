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

// Flat output schema (no discriminated union). Gemini structured output is unreliable
// with discriminated unions, so we let the model fill all fields and validate kind by
// the presence of `type` (transaction) vs `totalValue` (valuation).
const ParsedPortfolioEntrySchema = z.object({
  entryKind: z.enum(['transaction', 'valuation']).describe("'transaction' for buy/sell/dividend/interest/fee. 'valuation' when the user is reporting a current value/NAV."),
  assetName: z.string().describe("Name of the fund, stock, crypto, or instrument."),
  assetType: PortfolioAssetTypeEnum.default('other'),
  type: PortfolioTransactionTypeEnum.nullish().describe("Only for entryKind='transaction'. One of buy, sell, dividend, interest, fee."),
  date: z.string().describe("YYYY-MM-DD. Use today's date if no date is visible or mentioned."),
  amount: z.number().nullish().describe("Only for entryKind='transaction'. Total transaction amount."),
  totalValue: z.number().nullish().describe("Only for entryKind='valuation'. Current total value of this holding."),
  quantity: z.number().nullish(),
  pricePerUnit: z.number().nullish(),
  charges: z.number().nullish(),
  taxes: z.number().nullish(),
  currency: PortfolioCurrencyEnum.default('INR'),
  notes: z.string().nullish(),
  source: PortfolioEntrySourceEnum.default('ai_text'),
});

const ParsePortfolioEntryOutputSchema = z.object({
  entries: z.array(ParsedPortfolioEntrySchema).describe("One or more portfolio entries parsed from the input."),
  summary: z.string().nullish().describe("Short human-readable summary of what was parsed."),
  needsReview: z.boolean().default(true),
});

const ParsePortfolioEntryInputSchema = z.object({
  text: z.string().default(''),
  receiptImageUri: z.string().optional().describe("A screenshot as a data URI. Named receiptImageUri so the shared Azure vision helper attaches it."),
  today: z.string(),
  existingAssets: z.array(z.object({
    id: z.string(),
    name: z.string(),
    assetType: PortfolioAssetTypeEnum,
    currency: PortfolioCurrencyEnum,
  })),
  preferredAssetName: z.string().default(''),
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
    text: (input.text || '').trim(),
    receiptImageUri: input.imageDataUri,
    today,
    existingAssets: input.existingAssets,
    preferredAssetName: input.preferredAssetName || '',
    model: modelToUse,
  };

  try {
    if (modelToUse === 'gpt-5.2-chat') {
      return await callAzureOpenAI(promptTemplate, flowInput, ParsePortfolioEntryOutputSchema);
    }
    return await parsePortfolioEntryFlow(flowInput);
  } catch (err: any) {
    console.error('[parse-portfolio-entry] AI failure:', err);
    throw new Error(`Could not parse portfolio entry: ${err?.message || 'unknown AI error'}`);
  }
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
PREFERRED ASSET (use this name if input is vague): {{preferredAssetName}}

USER TEXT:
"{{text}}"

EXISTING ASSETS:
\`\`\`json
{{{json existingAssets}}}
\`\`\`

SCREENSHOT:
{{media url=receiptImageUri}}

Return JSON with this exact shape:
{
  "entries": [
    {
      "entryKind": "transaction" | "valuation",
      "assetName": "string",
      "assetType": "mutual_fund|indian_equity|us_equity|crypto|gold|fd_rd|other",
      "type": "buy|sell|dividend|interest|fee",   // required when entryKind=transaction, otherwise null
      "date": "YYYY-MM-DD",
      "amount": number | null,        // for transactions
      "totalValue": number | null,    // for valuations
      "quantity": number | null,
      "pricePerUnit": number | null,
      "charges": number | null,
      "taxes": number | null,
      "currency": "INR" | "USD",
      "notes": "short context",
      "source": "ai_text"
    }
  ],
  "summary": "what you parsed",
  "needsReview": true
}

ENTRY TYPES:
- transaction: a buy, sell, dividend, interest, or fee. Required: entryKind="transaction", assetName, type, date, amount.
- valuation: when the user reports a current value/NAV/holding value. Required: entryKind="valuation", assetName, date, totalValue.

For transactions set amount; leave totalValue null.
For valuations set totalValue; leave amount and type null.

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
- "Bought Parag Parikh for 10k" -> transaction buy amount=10000.
- "Current value of BTC is 3.2L" -> valuation totalValue=320000.

ASSET NAME:
- Prefer an existing asset name if the input clearly refers to it (case/spacing insensitive).
- If PREFERRED ASSET is non-empty and the input is vague ("current value is 50k", "sold 10k"), use the preferred asset.
- Skip entries where the asset name OR amount/totalValue is genuinely missing.

NOTES:
- Keep short. Include useful context such as screenshot row label, broker, folio note, or uncertainty.

If the input is empty or contains no investment data, return {"entries": [], "summary": "no investment data found", "needsReview": false}.

OUTPUT JSON ONLY.`;

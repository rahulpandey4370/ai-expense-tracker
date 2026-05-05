'use server';
/**
 * Parses a one-line natural-language instruction into either:
 *   - a new SavingsAllocation draft (intent='add'), OR
 *   - an update to an existing one (intent='update' + existingId).
 *
 * The caller passes the current list so the AI can disambiguate by name /
 * location (e.g. "update emergency fund to ₹60k" → match existing record).
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { callAzureOpenAI } from '@/lib/azure-openai';
import type { AIModel, SavingsAllocation } from '@/lib/types';

const ParsedSavingsActionSchema = z.object({
  intent: z.enum(['add', 'update']).describe("'add' for a new record, 'update' to modify an existing one."),
  existingId: z.string().nullish().describe("If intent is 'update', the id of the existing record from the supplied list. Null otherwise."),
  record: z.object({
    name: z.string().nullish().describe("Short label, e.g. 'Emergency Fund'. Required for 'add'. For 'update', include only fields the user changed; null otherwise."),
    location: z.string().nullish().describe("Where the money sits (e.g. 'HDFC Savings A/c'). Required for 'add'."),
    category: z.enum(['savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other']).nullish().describe("Type bucket. Required for 'add'."),
    amount: z.number().nullish().describe("INR amount. Required for 'add'."),
    asOfDate: z.string().nullish().describe("YYYY-MM-DD; the as-of date. Default to today on 'add' if missing."),
    notes: z.string().nullish().describe("Free-form notes; null if none."),
  }),
  unmatched: z.boolean().nullish().describe("True if intent is 'update' but you couldn't confidently match an existing record."),
  reasoning: z.string().nullish().describe("One short line explaining the choice."),
});
export type ParsedSavingsAction = z.infer<typeof ParsedSavingsActionSchema>;

export async function parseSavingsAllocationFromText(input: {
  naturalLanguageText: string;
  existing: Array<Pick<SavingsAllocation, 'id' | 'name' | 'location' | 'category' | 'amount'>>;
  todayYmd: string;
  model?: AIModel;
}): Promise<ParsedSavingsAction> {
  const modelToUse = input.model || 'gemini-3-flash-preview';

  const promptInput = {
    text: input.naturalLanguageText,
    existing: input.existing,
    today: input.todayYmd,
  };

  if (modelToUse === 'gpt-5.2-chat') {
    return await callAzureOpenAI(promptTemplate, promptInput, ParsedSavingsActionSchema);
  }

  const prompt = ai.definePrompt({
    name: 'parseSavingsAllocationPrompt',
    output: { schema: ParsedSavingsActionSchema },
    config: { temperature: 0.1, maxOutputTokens: 500 },
    prompt: promptTemplate,
  });
  const { output } = await retryableAIGeneration(() => prompt(promptInput as any, { model: googleAI.model(modelToUse) }));
  if (!output) throw new Error("Savings parser returned no output.");
  return output;
}

const promptTemplate = `You are parsing a single instruction about an Indian user's CASH SAVINGS allocation (currency: INR ₹). Output ONE structured action.

USER INPUT:
"{{text}}"

EXISTING ALLOCATIONS (id, name, location, category, amount):
\`\`\`json
{{{json existing}}}
\`\`\`

TODAY'S DATE (YYYY-MM-DD): {{today}}

DECISION RULES:
1. If the input introduces a brand-new place/balance (e.g. "I have 50k in HDFC savings tagged emergency fund"), set intent="add".
2. If the input refers to an existing record (mentions an existing name/bank/fund or uses verbs like "update", "change", "increase to", "now has"), set intent="update".
3. For 'update': pick the EXACT id from the existing list whose name/location best matches the user's reference. If no good match, set unmatched=true and existingId=null.
4. For 'add', ALL of name, location, category, amount must be present. If any are missing, infer reasonable defaults from the text (name can mirror location if no explicit label).

FIELD RULES:
- amount: numeric INR. Strip ₹/Rs/INR/commas. Convert "k"=×1000, "lakh"/"L"=×100000, "cr"/"crore"=×10000000. Use null if not mentioned in an update.
- category: one of {savings_account, liquid_fund, fd, rd, cash, other}.
   * savings_account → bank savings/current accounts (HDFC, ICICI, SBI savings, Kotak 811 etc.)
   * liquid_fund → liquid mutual funds (Quant Liquid, ICICI Prudential Liquid, Axis Liquid, etc.)
   * fd → fixed deposits / term deposits
   * rd → recurring deposits
   * cash → physical cash, wallets
   * other → anything else (e.g. arbitrage funds, sweep accounts)
- name: short label, capitalised, 1–4 words. Mirror location if the user didn't tag it.
- location: free-form but specific. Include bank name/AMC/instrument.
- asOfDate: a YYYY-MM-DD date. Default to {{today}} if the user didn't mention one.
- notes: only if the user said something extra worth keeping; otherwise null.

OUTPUT FOR UPDATES:
- Only set fields the user actually changed (e.g. just amount for "update emergency fund to 60k"). Leave the rest null.

OUTPUT JSON ONLY.
`;

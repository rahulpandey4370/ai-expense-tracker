'use server';
/**
 * Parses a one-line natural-language instruction into either:
 *   - a new SavingsAllocation draft (intent='add'), OR
 *   - an update to an existing one (intent='update' + existingId), OR
 *   - a split from an existing one into a new record (intent='split').
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
  intent: z.enum(['add', 'update', 'split']).describe("'add' for a new record, 'update' to modify an existing one, 'split' to move part of an existing record into a new record."),
  existingId: z.string().nullish().describe("If intent is 'update' or 'split', the id of the existing source record from the supplied list. Null otherwise."),
  record: z.object({
    name: z.string().nullish().describe("Short label, e.g. 'Emergency Fund'. Required for 'add'. For 'update', include only fields the user changed; null otherwise."),
    location: z.string().nullish().describe("Where the money sits (e.g. 'HDFC Savings A/c'). Required for 'add'."),
    category: z.enum(['savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other']).nullish().describe("Type bucket. Required for 'add'."),
    amount: z.number().nullish().describe("INR amount. Required for 'add'."),
    asOfDate: z.string().nullish().describe("YYYY-MM-DD; the as-of date. Default to today on 'add' if missing."),
    notes: z.string().nullish().describe("Free-form notes; null if none."),
  }),
  split: z.object({
    amount: z.number().nullish().describe("Amount to subtract from the existing source record and place into the new record."),
    newRecord: z.object({
      name: z.string().nullish().describe("Short label for the newly separated record."),
      location: z.string().nullish().describe("Where the separated amount now sits."),
      category: z.enum(['savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other']).nullish().describe("Type bucket for the new record."),
      asOfDate: z.string().nullish().describe("YYYY-MM-DD; default to today if missing."),
      notes: z.string().nullish().describe("Free-form notes; null if none."),
    }).nullish(),
  }).nullish().describe("Required when intent='split'."),
  unmatched: z.boolean().nullish().describe("True if intent is 'update' or 'split' but you couldn't confidently match an existing record."),
  reasoning: z.string().nullish().describe("One short line explaining the choice."),
});
export type ParsedSavingsAction = z.infer<typeof ParsedSavingsActionSchema>;
export type SavingsAiMode = 'auto' | 'add' | 'edit';

export async function parseSavingsAllocationFromText(input: {
  naturalLanguageText: string;
  existing: Array<Pick<SavingsAllocation, 'id' | 'name' | 'location' | 'category' | 'amount'>>;
  todayYmd: string;
  mode?: SavingsAiMode;
  model?: AIModel;
}): Promise<ParsedSavingsAction> {
  const modelToUse = input.model || 'gemini-3-flash-preview';

  const promptInput = {
    text: input.naturalLanguageText,
    existing: input.existing,
    today: input.todayYmd,
    mode: input.mode || 'auto',
  };

  if (modelToUse === 'gpt-5.2-chat') {
    return await callAzureOpenAI(promptTemplate, promptInput, ParsedSavingsActionSchema);
  }

  const prompt = ai.definePrompt({
    name: 'parseSavingsAllocationPrompt',
    output: { schema: ParsedSavingsActionSchema },
    config: { temperature: 0.1, maxOutputTokens: 800 },
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
REQUESTED MODE: {{mode}}

DECISION RULES:
1. If REQUESTED MODE is "add", prefer intent="add" unless the user explicitly references an existing record.
2. If REQUESTED MODE is "edit", prefer intent="update" or intent="split"; do NOT create a standalone add unless the text clearly says to add a new unrelated allocation.
3. If the input introduces a brand-new place/balance (e.g. "I have 50k in HDFC savings tagged emergency fund"), set intent="add".
4. If the input refers to an existing record (mentions an existing name/bank/fund or uses verbs like "update", "edit", "change", "increase to", "now has"), set intent="update".
5. If the input asks to separate/move/transfer/split part of an existing record into another place (e.g. "edit March and separate 10k into Slice Fixed Deposit"), set intent="split".
6. For 'update' and 'split': pick the EXACT id from the existing list whose name/location best matches the user's reference. If no good match, set unmatched=true and existingId=null.
7. For 'add', ALL of name, location, category, amount must be present. If any are missing, infer reasonable defaults from the text (name can mirror location if no explicit label).

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

OUTPUT FOR SPLITS:
- existingId: source record id.
- split.amount: amount to subtract from the source record.
- split.newRecord: the new separated allocation. Its amount is split.amount, so do not put the amount inside newRecord.
- record: leave all fields null for split unless the user explicitly wants to rename or otherwise change the source record.
- Example: "edit the March entry and make 2 now separate 10k into Slice Fixed Deposit" means match the March source, subtract ₹10,000 from it, and create a new fd record named/location "Slice Fixed Deposit".

OUTPUT JSON ONLY.
`;

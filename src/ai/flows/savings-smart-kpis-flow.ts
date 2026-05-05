'use server';
/**
 * Computes smart KPIs over a user's savings allocations:
 *   - total parked
 *   - per-category subtotals
 *   - intelligently merged groupings (e.g. all liquid funds across AMCs into
 *     a single "Liquid Funds" KPI; all HDFC accounts across savings/RD into
 *     "HDFC across products"; etc.)
 *   - one short headline insight
 *
 * Investment transactions for the year (passed in optionally) are also
 * considered so the AI can comment on how cash savings compare to invested
 * capital, but the main KPIs are about the cash-savings ledger itself.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { callAzureOpenAI } from '@/lib/azure-openai';
import type { AIModel, SavingsAllocation, AITransactionForAnalysis } from '@/lib/types';

const KpiSchema = z.object({
  label: z.string().describe("Short title, e.g. 'HDFC across products', 'Goal: Down-payment'."),
  amount: z.number().describe("INR value for this KPI."),
  share: z.number().nullish().describe("Share of total tracked savings, 0-100, 1 decimal. Null when not meaningful."),
  detail: z.string().nullish().describe("One-line context, e.g. '3 entries combined: HDFC Savings + HDFC RD + HDFC FD'."),
  color: z.enum(['blue', 'purple', 'pink', 'yellow', 'green', 'red']).nullish().describe("Suggested colour bucket for the KPI tile."),
  members: z.array(z.string()).nullish().describe("ids of the SavingsAllocations included in this KPI."),
  kind: z.enum(['merge', 'concentration', 'idle', 'stale', 'goal', 'other']).describe("What flavour of insight this is."),
});

const SavingsSmartKpisOutputSchema = z.object({
  totalParked: z.number().describe("Sum of every tracked savings amount, ₹."),
  kpis: z.array(KpiSchema).max(6).describe("Up to 6 NON-OBVIOUS insight tiles. Do NOT emit per-category subtotals — those are already shown elsewhere on the page. Empty array is fine if nothing useful applies."),
  headline: z.string().nullish().describe("One sharp, ≤25-word observation. Null if nothing meaningful to say."),
});
export type SavingsSmartKpisOutput = z.infer<typeof SavingsSmartKpisOutputSchema>;

export async function computeSavingsSmartKpis(input: {
  allocations: SavingsAllocation[];
  yearInvestmentTransactions?: AITransactionForAnalysis[];
  year: number;
  model?: AIModel;
}): Promise<SavingsSmartKpisOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';

  const promptInput = {
    allocations: input.allocations.map(a => ({
      id: a.id, name: a.name, location: a.location, category: a.category,
      amount: a.amount, asOfDate: a.asOfDate, notes: a.notes ?? null,
    })),
    investmentsForYear: input.yearInvestmentTransactions ?? [],
    year: input.year,
  };

  if (modelToUse === 'gpt-5.2-chat') {
    return await callAzureOpenAI(promptTemplate, promptInput, SavingsSmartKpisOutputSchema);
  }

  const prompt = ai.definePrompt({
    name: 'savingsSmartKpisPrompt',
    output: { schema: SavingsSmartKpisOutputSchema },
    config: { temperature: 0.2, maxOutputTokens: 700 },
    prompt: promptTemplate,
  });
  const { output } = await retryableAIGeneration(() => prompt(promptInput as any, { model: googleAI.model(modelToUse) }));
  if (!output) throw new Error("Smart KPIs flow returned no output.");
  return output;
}

const promptTemplate = `You are a personal-finance KPI builder for an Indian user (currency: INR ₹). The user maintains a manual ledger of where their CASH SAVINGS are parked. Your job: produce a small set of meaningful KPI tiles.

ALLOCATIONS (the user's cash-savings ledger):
\`\`\`json
{{{json allocations}}}
\`\`\`

INVESTMENT TRANSACTIONS for {{year}} (read-only context; do NOT mix into the totals):
\`\`\`json
{{{json investmentsForYear}}}
\`\`\`

YOUR OUTPUT — only NON-OBVIOUS insights. The page ALREADY shows total parked, per-category subtotals, and per-entry rows. Do NOT duplicate those. Emit a tile ONLY if it tells the user something they can't see at a glance.

1. \`totalParked\` = sum of \`amount\` across ALL allocations (used internally; the UI may not show it).
2. \`kpis\` — up to 6 tiles. Never repeat what's obvious. Patterns worth surfacing (pick 0-6 of these):
   a. **Cross-category merges** (kind="merge") — same institution across products, e.g. all HDFC products (savings + RD + FD) → "HDFC across products". Or same goal tagged in notes (e.g. "down-payment", "wedding", "emergency") → "Goal: Down-payment". Only if ≥2 entries and the merge cuts ACROSS the category split.
   b. **Concentration risk** (kind="concentration") — one bank/AMC/instrument holds >50% of total → "Concentration: HDFC". Include the % in detail.
   c. **Idle cash** (kind="idle") — too much in plain savings_account vs liquid_fund. Only if savings_account share ≥ 50% AND total ≥ ₹2L. Suggest the opportunity: "₹X idle in savings — moving to liquid fund ≈ ₹Y/yr at 6.5%".
   d. **Stale entries** (kind="stale") — entries whose asOfDate is >90 days before the latest asOfDate in the dataset. Tile = count + total ₹ at risk of being out of date.
   e. **Goal coverage** (kind="goal") — multiple entries explicitly tagged in notes for one purpose; show goal total + #entries.
   f. **Single-entry warning** (kind="other") — only if helpful (e.g. one entry is >70% of total).

3. \`headline\` — one sharp observation, ≤25 words, with specific ₹ figures, OR null if nothing useful applies. Don't restate the per-category split.

DO NOT EMIT
- A "Total Parked" tile.
- A per-category tile (Savings Accounts / Liquid Funds / FDs / RDs / Cash / Other) — those are already in the page's category breakdown.
- Any tile that just restates a single allocation's amount.
- More than 6 tiles. If there is nothing non-obvious, return kpis=[].

RULES
- All amounts are INR; use ₹ + Indian comma grouping in 'detail'/'headline' strings (e.g. ₹1,23,456.78). totalParked and kpi.amount must be plain numbers (no formatting).
- Round share to 1 decimal.
- Never invent allocations.
- members[] is required for any tile that aggregates ≥2 entries.
- If allocations is empty or has <2 entries, return totalParked accordingly, kpis=[], headline=null.

OUTPUT JSON ONLY conforming to the schema.
`;

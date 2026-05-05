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
  label: z.string().describe("Short title, e.g. 'Total Parked', 'Liquid Funds', 'HDFC across products'."),
  amount: z.number().describe("INR value for this KPI."),
  share: z.number().nullish().describe("Share of total tracked savings, 0-100, 1 decimal. Null for non-shareable KPIs."),
  detail: z.string().nullish().describe("Optional one-line context, e.g. '3 entries combined: ICICI Prudential Liquid, Axis Liquid, Quant Liquid'."),
  color: z.enum(['blue', 'purple', 'pink', 'yellow', 'green', 'red']).nullish().describe("Suggested colour bucket for the KPI tile."),
  members: z.array(z.string()).nullish().describe("ids of the SavingsAllocations included in this KPI (when it's a combined one)."),
});

const SavingsSmartKpisOutputSchema = z.object({
  totalParked: z.number().describe("Sum of every tracked savings amount, ₹."),
  kpis: z.array(KpiSchema).min(1).max(10).describe("Ordered list of KPIs to display. Always include 'Total Parked' first, then category subtotals, then any intelligent merges."),
  headline: z.string().nullish().describe("One sharp, ≤25-word observation about the overall picture."),
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

YOUR OUTPUT
1. \`totalParked\` = sum of \`amount\` across ALL allocations.
2. \`kpis\` = ordered list, max 8 items. Build them as follows:
   a. First KPI MUST be label="Total Parked", amount=totalParked, share=null, color="purple".
   b. Then ONE KPI per non-empty category bucket: 'Savings Accounts', 'Liquid Funds', 'Fixed Deposits', 'Recurring Deposits', 'Cash', 'Other'. Set members[] to the contributing ids and share=% of total to 1 decimal. Use color: savings_account→blue, liquid_fund→yellow, fd→purple, rd→pink, cash→green, other→red.
   c. THEN add INTELLIGENT MERGE KPIs for any pattern you can detect across location/notes that is more useful than the raw category split. Examples of patterns worth merging:
      - All HDFC products (savings + RD + FD at HDFC) → "HDFC across products".
      - All liquid mutual funds across AMCs → "Liquid Funds (all AMCs)" — only if it adds value beyond the category KPI.
      - All entries the user tagged for a single goal (e.g. notes mention "down-payment", "wedding", "emergency") → "Goal: Down-payment".
      - Bank-level concentration (e.g. >60% sitting in one bank).
      Only add a merge KPI if (i) it covers ≥2 allocations and (ii) it tells the user something non-obvious. Skip merges that just duplicate a category KPI.
   d. Cap the merge KPIs at 4. Each merge KPI must include members[] = ids of the allocations it covers.
3. \`headline\` = one short, sharp observation. Use specific numbers from the data (e.g. "₹8.2L parked, 71% in idle savings — moving ₹4L to a liquid fund could add ~₹16k/yr."). ≤25 words. Use ₹ Indian comma grouping. Null if there is nothing meaningful to say (e.g. <2 entries).

RULES
- All amounts are INR; use ₹ + Indian comma grouping in 'detail'/'headline' strings (e.g. ₹1,23,456.78). totalParked and kpi.amount must be plain numbers (no formatting).
- Round share to 1 decimal.
- Never invent allocations.
- If allocations is empty, return totalParked=0, kpis=[{label:"Total Parked",amount:0,color:"purple"}], headline=null.

OUTPUT JSON ONLY conforming to the schema.
`;

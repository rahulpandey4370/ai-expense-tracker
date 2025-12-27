
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { InvestmentSummaryInputSchema, type AIModel } from '@/lib/types';

const InvestmentSummaryOutputSchema = z.object({
  summary: z.string().describe("A concise, bulleted summary of the user's monthly investments, suitable for copying. Start with the total amount vs target, then breakdown by category, then list key individual investments."),
});

export type InvestmentSummaryOutput = z.infer<typeof InvestmentSummaryOutputSchema>;

const InvestmentSummaryInputSchemaInternal = InvestmentSummaryInputSchema.extend({
    model: z.string().optional(),
});

export async function summarizeInvestments(input: z.infer<typeof InvestmentSummaryInputSchema> & { model?: AIModel }): Promise<InvestmentSummaryOutput> {
  const validation = InvestmentSummaryInputSchemaInternal.safeParse(input);
  if (!validation.success) {
    throw new Error(`Invalid input for AI summary: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
  }
  return await investmentSummaryFlow(validation.data);
}

const investmentSummaryPrompt = ai().definePrompt({
  name: 'investmentSummaryPrompt',
  input: { schema: InvestmentSummaryInputSchemaInternal.omit({ model: true }) },
  output: { schema: InvestmentSummaryOutputSchema },
  config: {
    temperature: 0.2,
    maxOutputTokens: 600,
  },
  prompt: `You are a financial assistant. Your task is to generate a clean, concise, copiable summary of a user's investments for a specific month. Use bullet points (•) and be factual.
Your response MUST be in a valid JSON format.

**Data for {{monthYear}}:**
- **Total Invested:** ₹{{totalInvested}}
- **Monthly Target:** ₹{{monthlyTarget}}
- **Category Breakdown:**
{{#each categoryBreakdown}}
  - {{this.name}}: Target ₹{{this.targetAmount}}, Actual ₹{{this.actualAmount}}
{{/each}}
- **Individual Investments:**
{{#each fundEntries}}
  - {{this.fundName}} ({{this.category}}): ₹{{this.amount}}
{{/each}}

**Instructions:**
1.  Start with a header for the month (e.g., "Investment Summary for {{monthYear}}").
2.  State the total amount invested vs. the monthly target.
3.  Provide a bulleted list of the category-level performance (Actual vs. Target for each).
4.  Provide a bulleted list of the top 3-5 individual fund investments made during the month.
5.  Keep the language professional and neutral. The output should be pure text, easy to copy and paste into notes or messages. Do not add conversational fluff or advice.

**Example Output:**

Investment Summary for 2024-07
• Total Invested: ₹15,000 / ₹20,000
• Category Performance:
  • Equity: ₹10,000 / ₹12,000
  • Debt: ₹5,000 / ₹8,000
• Top Investments:
  • Parag Parikh Flexi Cap: ₹5,000
  • UTI Nifty 50 Index: ₹3,000
  • HDFC Liquid Fund: ₹2,000
`,
});

const investmentSummaryFlow = ai().defineFlow(
  {
    name: 'investmentSummaryFlow',
    inputSchema: InvestmentSummaryInputSchemaInternal,
    outputSchema: InvestmentSummaryOutputSchema,
  },
  async (input) => {
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(investmentSummaryPrompt.getDefinition());
    const result = await retryableAIGeneration(() => configuredPrompt(input));
    if (!result.output) {
        throw new Error("AI failed to generate a valid summary structure.");
    }
    return result.output;
  }
);

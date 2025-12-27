
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { InvestmentSummaryInputSchema, type AIModel, modelNames } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

const InvestmentSummaryOutputSchema = z.object({
  summary: z.string().describe("A concise, bulleted summary of the user's monthly investments, suitable for copying. Start with the total amount vs target, then breakdown by category, then list key individual investments."),
});

type InvestmentSummaryOutput = z.infer<typeof InvestmentSummaryOutputSchema> & { model?: AIModel };

const InvestmentSummaryInputSchemaInternal = InvestmentSummaryInputSchema.extend({
    model: z.enum(modelNames).optional(),
});

export async function summarizeInvestments(input: z.infer<typeof InvestmentSummaryInputSchema> & { model?: AIModel }): Promise<InvestmentSummaryOutput> {
  const validation = InvestmentSummaryInputSchemaInternal.safeParse(input);
  if (!validation.success) {
    throw new Error(`Invalid input for AI summary: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
  }
  const result = await investmentSummaryFlow(validation.data);
  return { ...result, model: validation.data.model };
}

const investmentSummaryFlow = ai.defineFlow(
  {
    name: 'investmentSummaryFlow',
    inputSchema: InvestmentSummaryInputSchemaInternal,
    outputSchema: InvestmentSummaryOutputSchema,
  },
  async (input) => {
    const model = input.model || 'gemini-1.5-flash-latest';

    if (model === 'gpt-5.2-chat') {
        const result = await callAzureOpenAI(investmentSummaryPromptTemplate, input, InvestmentSummaryOutputSchema);
        return { summary: result.summary };
    }

    const prompt = ai.definePrompt({
      name: 'investmentSummaryPrompt',
      input: { schema: InvestmentSummaryInputSchemaInternal.omit({ model: true }) },
      output: { schema: InvestmentSummaryOutputSchema },
      config: {
        temperature: 0.2,
        maxOutputTokens: 600,
      },
      prompt: investmentSummaryPromptTemplate,
    });
    
    const { output } = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
    if (!output) {
        throw new Error("AI failed to generate a valid summary structure.");
    }
    return output;
  }
);

const investmentSummaryPromptTemplate = `You are a financial assistant. Your task is to generate a clean, concise, copiable summary of a user's investments for a specific month. Use bullet points (•) and be factual.
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
`;

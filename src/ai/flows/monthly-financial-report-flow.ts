'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '../utils/retry-helper';
import { MonthlyFinancialReportInputSchema, MonthlyFinancialReportOutputSchema } from '@/lib/types';
import type { MonthlyFinancialReportInput, MonthlyFinancialReportOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function generateMonthlyFinancialReport(input: MonthlyFinancialReportInput): Promise<MonthlyFinancialReportOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    const result = await monthlyFinancialReportFlow(input);
    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error(`Error in generateMonthlyFinancialReport flow: ${error.message}`, error.stack);
    throw new Error(`An unexpected error occurred while generating the financial report: ${error.message}`);
  }
}

const reportPromptTemplate = `You are an expert financial analyst. Your task is to create a detailed monthly financial report in markdown format based on the user's transaction data for {{monthName}} {{year}}.
Your response MUST be in a valid JSON format.

Transaction Data:
\`\`\`json
{{{json transactions}}}
\`\`\`

**Report Sections:**

**1. Executive Summary:**
   - Start with a brief, high-level overview of the month's financial health.
   - Mention total income, total expenses, and net savings/loss.
   - Highlight one key positive and one area for improvement.

**2. Income vs. Expense Analysis:**
   - Detail the total income and total expenses.
   - Calculate and state the savings rate for the month ((Income - Expenses) / Income).
   - Compare this month's spending to the previous month if data is available, or note if it's not.

**3. Category Deep-Dive:**
   - Identify the top 3-5 spending categories.
   - For each top category, provide the total amount spent and the percentage of total expenses it represents.
   - Offer a brief insight for at least one of the top categories (e.g., "Food and Dining was the highest expense, consider tracking sub-categories like 'groceries' vs 'eating out'.").

**4. Savings and Investment Analysis:**
   - Identify and sum up all transactions categorized under investment-related categories (e.g., 'Stocks', 'Mutual Funds').
   - Calculate the investment rate ((Total Investment / Total Income)).
   - Analyze the net cash flow (Income - all outflows) and what it implies for their savings goals.

**5. Actionable Recommendations:**
   - Provide 2-3 clear, actionable recommendations.
   - Examples: "Set a budget of ₹X for 'Shopping' next month.", "Consider automating a small monthly investment of ₹Y.", "Review your subscriptions to find potential savings."

**Formatting Rules:**
- Use markdown for clear, readable sections.
- Use bolding for key terms and figures.
- Use bullet points for lists.
- All monetary values must be in Indian Rupees (₹).
`;


const monthlyFinancialReportFlow = ai.defineFlow(
  {
    name: 'monthlyFinancialReportFlow',
    inputSchema: MonthlyFinancialReportInputSchema,
    outputSchema: MonthlyFinancialReportOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = input.model || 'gemini-3-flash-preview';
    
    // Create the prompt input, excluding the model property
    const promptInput = {
      monthName: input.monthName,
      year: input.year,
      transactions: input.transactions,
    };
    
    let output;
    if (model === 'gpt-5.2-chat') {
        output = await callAzureOpenAI(reportPromptTemplate, promptInput, MonthlyFinancialReportOutputSchema.omit({ model: true }));
    } else {
        const prompt = ai.definePrompt({
            name: 'monthlyFinancialReportPrompt',
            input: { schema: MonthlyFinancialReportInputSchema.omit({ model: true }) },
            output: { schema: MonthlyFinancialReportOutputSchema.omit({ model: true }) },
            prompt: reportPromptTemplate,
        });
        const { output: result } = await retryableAIGeneration(() => prompt(promptInput, { model: googleAI.model(model) }));
        output = result;
    }
    
    if (!output) {
      throw new Error("Financial report generation failed to produce an output.");
    }
    return output;
  }
);

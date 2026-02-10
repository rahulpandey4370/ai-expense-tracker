'use server';
/**
 * @fileOverview AI-powered budgeting assistant.
 *
 * - suggestBudgetPlan - A function that uses AI to generate a personalized budget.
 * - BudgetingAssistantInput - The input type for the suggestBudgetPlan function.
 * - BudgetingAssistantOutput - The return type for the suggestBudgetPlan function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { BudgetingAssistantInputSchema, BudgetingAssistantOutputSchema, type BudgetingAssistantOutput, type AIModel } from '@/lib/types';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function suggestBudgetPlan(
  input: z.infer<typeof BudgetingAssistantInputSchema>
): Promise<BudgetingAssistantOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    // Validate input against internal schema before passing to AI
    const validatedInput = BudgetingAssistantInputSchema.parse(input);
    const result = await budgetingAssistantFlow(validatedInput);
    return { ...result, model: modelToUse };
  } catch (flowError: any) {
    console.error("Error executing budgetingAssistantFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    const baseErrorReturn = {
      recommendedMonthlyBudget: { needs: 0, wants: 0, investmentsAsSpending: 0, targetSavings: 0, discretionarySpendingOrExtraSavings: input.statedMonthlyIncome || 0 },
      detailedSuggestions: { categoryAdjustments: [], generalTips: [] },
      analysisSummary: `An unexpected error occurred while generating the budget: ${errorMessage}`,
      model: modelToUse,
    };
    if (flowError instanceof z.ZodError) {
      return {
        ...baseErrorReturn,
        detailedSuggestions: { categoryAdjustments: [`Invalid input for AI: ${JSON.stringify(flowError.flatten().fieldErrors)}`], generalTips: [] },
        analysisSummary: "Could not generate budget due to input errors. Please check your income and savings goal.",
      };
    }
    return baseErrorReturn;
  }
}

const budgetPromptTemplate = `You are a friendly and practical Personal Finance Advisor for FinWise AI.
Your response must be in a valid JSON format.
The user wants a personalized monthly budget plan in Indian Rupees (INR).
Analyze their stated income, savings goal, and past spending patterns to create a realistic and actionable budget.

User's Financial Details:
- Stated Monthly Income: ₹{{statedMonthlyIncome}}
- Stated Monthly Savings Goal: {{statedMonthlySavingsGoalPercentage}}% of income
- Average Past Total Monthly Expenses (last 3 months): ₹{{averagePastMonthlyExpenses}}
- Past Spending Breakdown (average per month over last 3 months): {{pastSpendingBreakdown}}

Your Task:
1.  **Calculate Target Savings**: Calculate (\`{{statedMonthlyIncome}}\` * \`{{statedMonthlySavingsGoalPercentage}}\` / 100). This is the \`targetSavings\` amount for the budget.
2.  **Recommend Budget Allocation**: Based on the income, savings goal, and past spending habits, recommend a budget for 'Needs', 'Wants', and 'Investments (as Spending, e.g., SIPs, regular stock buys)'.
    *   The sum of (Needs + Wants + InvestmentsAsSpending + TargetSavings) should ideally not exceed Stated Monthly Income.
    *   If past expenses are very high, your suggested budget might require significant cuts. Be realistic.
    *   The 'InvestmentsAsSpending' category is for regular investment outflows that are part of the monthly plan (like SIPs), distinct from the general 'targetSavings' which could be cash or unallocated investment funds.
3.  **Calculate Discretionary Amount**: Calculate \`discretionarySpendingOrExtraSavings\` = \`{{statedMonthlyIncome}}\` - (Needs + Wants + InvestmentsAsSpending + TargetSavings). This can be ₹0 or positive. If negative, the budget is over-extended.
4.  **Provide Detailed Suggestions**:
    *   **Category Adjustments**: Offer 2-4 specific, actionable suggestions on how the user might adjust their spending in particular categories (from their past breakdown or common categories like 'Dining Out', 'Shopping', 'Subscriptions') to meet the recommended budget and savings goal. Suggest approximate INR amounts for reduction/reallocation where possible.
    *   **General Tips**: Offer 1-3 general tips for better budgeting or saving.
5.  **Write an Analysis Summary**: Briefly explain the recommended budget, how it compares to their past spending, and how it helps achieve their savings goal. If significant lifestyle changes are implied by the budget, mention this gently.

Structure your output precisely according to the defined JSON schema.
Be empathetic and provide motivating, practical advice.
If income is ₹0 or very low, state that a meaningful budget cannot be created without income, but still offer general saving tips if possible.
If the savings goal is very aggressive (e.g., making total allocated expenses + savings > income), point this out and suggest a more conservative savings goal or the need for higher income.
Ensure all monetary values in the output are non-negative.
`;

const budgetingAssistantFlow = ai.defineFlow(
  {
    name: 'budgetingAssistantFlow',
    inputSchema: BudgetingAssistantInputSchema,
    outputSchema: BudgetingAssistantOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = input.model || 'gemini-3-flash-preview';

    if (input.statedMonthlyIncome <= 0) {
      return {
        recommendedMonthlyBudget: { needs: 0, wants: 0, investmentsAsSpending: 0, targetSavings: 0, discretionarySpendingOrExtraSavings: 0 },
        detailedSuggestions: {
          categoryAdjustments: [],
          generalTips: ["Consider tracking your expenses for a month to understand spending.", "Look for ways to increase your income if possible."]
        },
        analysisSummary: "A meaningful budget cannot be created without a stated monthly income. Please provide your income to get a personalized plan.",
      };
    }

    let output;
    if (model === 'gpt-5.2-chat') {
      output = await callAzureOpenAI(budgetPromptTemplate, input, BudgetingAssistantOutputSchema.omit({ model: true }));
    } else {
      const prompt = ai.definePrompt({
        name: 'budgetingAssistantPrompt',
        input: { schema: BudgetingAssistantInputSchema },
        output: { schema: BudgetingAssistantOutputSchema.omit({ model: true }) },
        config: {
          temperature: 0.6,
          maxOutputTokens: 1000,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        },
        prompt: budgetPromptTemplate,
      });
      const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
      output = result.output;
    }

    if (!output) {
      throw new Error("AI analysis failed to produce a valid budget plan.");
    }
    return output;
  }
);


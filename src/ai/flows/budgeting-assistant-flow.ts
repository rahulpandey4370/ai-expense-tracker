
'use server';
/**
 * @fileOverview AI-powered budgeting assistant.
 *
 * - suggestBudgetPlan - A function that uses AI to generate a personalized budget.
 * - BudgetingAssistantInput - The input type for the suggestBudgetPlan function.
 * - BudgetingAssistantOutput - The return type for the suggestBudgetPlan function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import type { BudgetingAssistantInput, BudgetingAssistantOutput, AIModel } from '@/lib/types';

// Internal Zod schemas for AI flow - not exported from 'use server' file
const BudgetingAssistantInputSchemaInternal = z.object({
  statedMonthlyIncome: z.number().min(0).describe("User's stated monthly income in INR. Can be 0 if not provided recently."),
  statedMonthlySavingsGoalPercentage: z.number().min(0).max(100).describe("User's desired savings rate as a percentage of income (e.g., 20 for 20%)."),
  averagePastMonthlyExpenses: z.number().min(0).describe("User's average total monthly expenses in INR, calculated from the last 3 months of their transaction data. Can be 0."),
  pastSpendingBreakdown: z.string().describe("A summary of the user's average monthly spending breakdown from the last 3 months. Example: 'Average spending: Needs: ₹30000 (e.g., Rent: ₹15000, Groceries: ₹8000), Wants: ₹15000 (e.g., Dining Out: ₹7000, Shopping: ₹5000), Investments: ₹5000 (e.g., Mutual Funds: ₹5000).' Include specific category examples if available."),
  model: z.string().optional(),
});

const BudgetingAssistantOutputSchemaInternal = z.object({
  recommendedMonthlyBudget: z.object({
    needs: z.number().min(0).describe("Recommended monthly spending for 'Needs' in INR."),
    wants: z.number().min(0).describe("Recommended monthly spending for 'Wants' in INR."),
    investmentsAsSpending: z.number().min(0).describe("Recommended monthly allocation for 'Investments' (treated as an expense category like SIPs, stock purchases) in INR. This is separate from pure 'Savings'."),
    targetSavings: z.number().min(0).describe("The target amount to be saved each month based on the user's income and savings goal percentage, in INR. This is pure cash savings or unallocated investment funds."),
    discretionarySpendingOrExtraSavings: z.number().min(0).describe("Remaining amount after allocating to needs, wants, investments (as spending), and target savings. This can be used for flexible spending or additional savings/investments, in INR."),
  }).describe("The AI's recommended monthly budget breakdown in INR."),
  detailedSuggestions: z.object({
    categoryAdjustments: z.array(z.string()).describe("Specific suggestions for adjusting spending in certain categories to meet the budget and savings goals. E.g., 'Consider reducing 'Dining Out' expenses by approximately ₹500.' or 'Allocate ₹X towards your Mutual Fund SIP.'"),
    generalTips: z.array(z.string()).describe("General financial tips to help the user stick to the budget and improve savings. E.g., 'Review subscriptions for potential cuts.' or 'Set up automatic transfers to your savings account on payday.'"),
  }).describe("Actionable advice to help the user achieve their financial plan."),
  analysisSummary: z.string().describe("A brief overall analysis comparing the suggested budget to past spending habits and explaining how it helps achieve the savings goal. Mention any significant changes required."),
});

export async function suggestBudgetPlan(
  input: BudgetingAssistantInput & { model?: AIModel }
): Promise<BudgetingAssistantOutput> {
  try {
    // Validate input against internal schema before passing to AI
    const validatedInput = BudgetingAssistantInputSchemaInternal.parse(input);
    return await budgetingAssistantFlow(validatedInput);
  } catch (flowError: any) {
    console.error("Error executing budgetingAssistantFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    if (flowError instanceof z.ZodError) {
      return {
        recommendedMonthlyBudget: { needs: 0, wants: 0, investmentsAsSpending: 0, targetSavings: 0, discretionarySpendingOrExtraSavings: input.statedMonthlyIncome || 0 },
        detailedSuggestions: { categoryAdjustments: [`Invalid input for AI: ${JSON.stringify(flowError.flatten().fieldErrors)}`], generalTips: [] },
        analysisSummary: "Could not generate budget due to input errors. Please check your income and savings goal.",
      };
    }
    return {
      recommendedMonthlyBudget: { needs: 0, wants: 0, investmentsAsSpending: 0, targetSavings: 0, discretionarySpendingOrExtraSavings: input.statedMonthlyIncome || 0 },
      detailedSuggestions: { categoryAdjustments: [], generalTips: [] },
      analysisSummary: `An unexpected error occurred while generating the budget: ${errorMessage}`,
    };
  }
}

const budgetPrompt = ai().definePrompt({
  name: 'budgetingAssistantPrompt',
  input: { schema: BudgetingAssistantInputSchemaInternal.omit({ model: true }) },
  output: { schema: BudgetingAssistantOutputSchemaInternal },
  config: {
    temperature: 0.6, // Allow for some creative yet grounded advice
    maxOutputTokens: 1000,
     safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are a friendly and practical Personal Finance Advisor for FinWise AI.
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
`,
});

const budgetingAssistantFlow = ai().defineFlow(
  {
    name: 'budgetingAssistantFlow',
    inputSchema: BudgetingAssistantInputSchemaInternal,
    outputSchema: BudgetingAssistantOutputSchemaInternal,
  },
  async (input) => {
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
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(budgetPrompt.getDefinition());
    const result = await retryableAIGeneration(() => configuredPrompt(input));
    return result.output!;
  }
);

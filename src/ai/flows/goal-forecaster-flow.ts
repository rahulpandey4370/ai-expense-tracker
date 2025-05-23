
'use server';
/**
 * @fileOverview AI flow for forecasting financial goals and providing a plan.
 *
 * - forecastFinancialGoal - A function that uses AI to assess a financial goal.
 * - GoalForecasterInput - The input type for the forecastFinancialGoal function. (Imported from lib/types)
 * - GoalForecasterOutput - The return type for the forecastFinancialGoal function. (Imported from lib/types)
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { GoalForecasterInputSchema, GoalForecasterOutputSchema, type GoalForecasterInput, type GoalForecasterOutput } from '@/lib/types'; // Import types and schemas

// Internal Zod schemas - not exported from this 'use server' file
// These will now be based on the imported schemas to ensure alignment
const GoalForecasterInputSchemaInternal = GoalForecasterInputSchema;

const GoalForecasterOutputSchemaInternal = GoalForecasterOutputSchema;


export async function forecastFinancialGoal(
  input: GoalForecasterInput
): Promise<GoalForecasterOutput> {
  try {
    // Validate input against the main schema before passing to AI
    const validatedInput = GoalForecasterInputSchema.parse(input);
    return await financialGoalForecasterFlow(validatedInput);
  } catch (flowError: any) {
    console.error("Error executing financialGoalForecasterFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    // Check if it's a Zod validation error from our explicit parse
    if (flowError instanceof z.ZodError) {
       return {
        feasibilityAssessment: "Input Error",
        estimatedOrProvidedGoalAmount: input.goalAmount || 0,
        wasAmountEstimatedByAI: !input.goalAmount,
        requiredMonthlySavings: 0,
        suggestedActions: [`Invalid input for AI: ${JSON.stringify(flowError.flatten().fieldErrors)}`],
        motivationalMessage: "Please check your input values."
      };
    }
    return {
      feasibilityAssessment: "Error",
      estimatedOrProvidedGoalAmount: input.goalAmount || 0,
      wasAmountEstimatedByAI: !input.goalAmount,
      requiredMonthlySavings: 0,
      suggestedActions: [`An unexpected error occurred: ${errorMessage}`],
      motivationalMessage: "Please try again later."
    };
  }
}

const financialGoalPrompt = ai.definePrompt({
  name: 'financialGoalPrompt',
  input: { schema: GoalForecasterInputSchemaInternal },
  output: { schema: GoalForecasterOutputSchemaInternal },
  config: {
    temperature: 0.5, // Allow for some creative yet grounded advice
    maxOutputTokens: 800,
     safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are a helpful and insightful personal finance advisor for FinWise AI.
The user wants to achieve a financial goal. Analyze their goal against their current financial situation (averages based on recent data in INR) and provide a forecast and actionable plan.

User's Goal:
- Description: {{goalDescription}}
- Target Amount (User Provided, optional): ₹{{goalAmount}}
- Desired Duration: {{goalDurationMonths}} months

User's Financials (Recent Averages):
- Average Monthly Income: ₹{{averageMonthlyIncome}}
- Average Monthly Expenses (Core Spending): ₹{{averageMonthlyExpenses}}
- Current Approximate Savings Rate (after core expenses): {{currentSavingsRate}}%

Your Task:
1.  **Determine Goal Amount**:
    - If a positive '{{goalAmount}}' is provided by the user, use that as the 'estimatedOrProvidedGoalAmount'. Set 'wasAmountEstimatedByAI' to false.
    - If '{{goalAmount}}' is NOT provided (is zero or missing), you MUST estimate a realistic cost in INR for the '{{goalDescription}}'. This estimated amount becomes 'estimatedOrProvidedGoalAmount'. Set 'wasAmountEstimatedByAI' to true. For example, if description is "Vacation to Europe for 2 people", estimate a reasonable cost. If "New Gaming Laptop", estimate that. Be specific if possible.
2.  **Calculate Feasibility**: Based on the 'estimatedOrProvidedGoalAmount', determine if the goal is 'Highly Feasible', 'Challenging but Possible', or 'Likely Unfeasible without changes' within the {{goalDurationMonths}} months.
    - Calculate required monthly savings for this goal: ('estimatedOrProvidedGoalAmount' / {{goalDurationMonths}}). Ensure this is positive.
    - Compare this to their current average monthly net savings ({{averageMonthlyIncome}} - {{averageMonthlyExpenses}}).
3.  **Projected Timeline (if applicable)**: If the goal seems feasible or challenging with their *current* average net savings, estimate how many months it would take them to reach 'estimatedOrProvidedGoalAmount'. If unfeasible with current habits, omit this. Ensure this is a positive integer if provided.
4.  **Required Monthly Savings**: Clearly state the amount (in INR) they need to save *specifically for this goal* each month to meet it in {{goalDurationMonths}} months, using the 'estimatedOrProvidedGoalAmount'. This should be a positive number.
5.  **Actionable Suggestions (2-4 points)**: Provide specific, practical suggestions based on the 'estimatedOrProvidedGoalAmount'.
    - If current savings are insufficient, suggest how much *additional* monthly savings are needed.
    - Suggest which typical expense categories (e.g., 'Food and Dining', 'Shopping', 'Entertainment') they might consider reducing, and by what approximate percentage or amount (INR) if possible.
    - Suggest ways to increase income if relevant.
6.  **Motivational Message**: End with a brief, encouraging note.

Structure your output according to the defined schema. Ensure all monetary values are positive.
If average monthly income is ₹0, and goalAmount was not provided (AI needs to estimate), state that a goal cannot be estimated or planned without income, set feasibility to 'Insufficient Data for Full Forecast', estimatedOrProvidedGoalAmount to 0, and provide general saving tips.
If goalAmount *was* provided but income is ₹0, calculate required monthly savings but state feasibility is 'Insufficient Data for Full Forecast'.
`,
});

const financialGoalForecasterFlow = ai.defineFlow(
  {
    name: 'financialGoalForecasterFlow',
    inputSchema: GoalForecasterInputSchemaInternal,
    outputSchema: GoalForecasterOutputSchemaInternal,
  },
  async (input) => {
    if (input.averageMonthlyIncome <= 0 && !input.goalAmount) {
        return {
            feasibilityAssessment: "Insufficient Data for Full Forecast",
            estimatedOrProvidedGoalAmount: 0,
            wasAmountEstimatedByAI: true, // Attempted estimation but failed due to no income
            requiredMonthlySavings: 0,
            suggestedActions: ["Average monthly income is zero or negative. A goal cannot be estimated or planned without positive income data. Please ensure you have recent income transactions recorded."],
            motivationalMessage: "Update your transaction history for a more accurate forecast."
        };
    }
     if (input.averageMonthlyIncome <= 0 && input.goalAmount && input.goalAmount > 0) {
        return {
            feasibilityAssessment: "Insufficient Data for Full Forecast",
            estimatedOrProvidedGoalAmount: input.goalAmount,
            wasAmountEstimatedByAI: false,
            requiredMonthlySavings: input.goalAmount / input.goalDurationMonths,
            suggestedActions: ["Average monthly income is zero or negative. While we can calculate required monthly savings for the goal, a full feasibility assessment isn't possible without positive income data."],
            motivationalMessage: "Update your transaction history for a more accurate forecast."
        };
    }
    const result = await retryableAIGeneration(() => financialGoalPrompt(input));
    return result.output!;
  }
);


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
import type { GoalForecasterInput, GoalForecasterOutput } from '@/lib/types'; // Import types

// Internal Zod schemas - not exported from this 'use server' file
const GoalForecasterInputSchemaInternal = z.object({
  goalDescription: z.string().describe("The user's description of their financial goal (e.g., 'Save for a vacation to Europe', 'Buy a new gaming laptop')."),
  goalAmount: z.number().min(0.01).describe("The target monetary amount for the goal in INR."),
  goalDurationMonths: z.number().int().min(1).describe("The desired duration in months to achieve the goal."),
  averageMonthlyIncome: z.number().min(0).describe("The user's average monthly income in INR based on recent data. Can be 0."),
  averageMonthlyExpenses: z.number().min(0).describe("The user's average monthly expenses (excluding dedicated savings/investments for this specific goal) in INR based on recent data. Can be 0."),
  currentSavingsRate: z.number().min(0).max(100).describe("The user's current approximate savings rate as a percentage of income (e.g., 20 for 20%)."),
});

const GoalForecasterOutputSchemaInternal = z.object({
  feasibilityAssessment: z.string().describe("A brief assessment of whether the goal is feasible within the given timeframe based on current financials (e.g., 'Highly Feasible', 'Challenging but Possible', 'Likely Unfeasible without changes')."),
  projectedMonthsToGoal: z.number().int().min(1).optional().describe("If feasible or challenging, the AI's projected number of months to reach the goal with current savings habits. Omit if unfeasible. Must be a positive integer if provided."),
  requiredMonthlySavings: z.number().min(0.01).describe("The amount the user would need to save specifically for this goal each month to achieve it in the desired duration. Must be a positive number."),
  suggestedActions: z.array(z.string()).describe("A list of 2-4 actionable suggestions to help achieve the goal. These could include increasing savings by a certain amount, or reducing spending in specific categories (e.g., 'Reduce 'Food and Dining' by X%', 'Increase monthly savings by ₹Y'). Be specific with INR amounts where possible."),
  motivationalMessage: z.string().optional().describe("A short, encouraging message for the user."),
});


export async function forecastFinancialGoal(
  input: GoalForecasterInput
): Promise<GoalForecasterOutput> {
  try {
    // Validate input against internal schema before passing to AI
    // This is an extra safety check, usually types from GoalForecasterInput (from lib/types) should align
    const validatedInput = GoalForecasterInputSchemaInternal.parse(input);
    return await financialGoalForecasterFlow(validatedInput);
  } catch (flowError: any) {
    console.error("Error executing financialGoalForecasterFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    // Check if it's a Zod validation error from our explicit parse
    if (flowError instanceof z.ZodError) {
       return {
        feasibilityAssessment: "Input Error",
        requiredMonthlySavings: 0, // Default value
        suggestedActions: [`Invalid input for AI: ${flowError.flatten().fieldErrors}`],
        motivationalMessage: "Please check your input values."
      };
    }
    return {
      feasibilityAssessment: "Error",
      requiredMonthlySavings: 0, // Default value
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
- Target Amount: ₹{{goalAmount}}
- Desired Duration: {{goalDurationMonths}} months

User's Financials (Recent Averages):
- Average Monthly Income: ₹{{averageMonthlyIncome}}
- Average Monthly Expenses: ₹{{averageMonthlyExpenses}}
- Current Approximate Savings Rate: {{currentSavingsRate}}%

Your Task:
1.  **Calculate Feasibility**: Determine if the goal is 'Highly Feasible', 'Challenging but Possible', or 'Likely Unfeasible without changes' within the {{goalDurationMonths}} months.
    - Calculate required monthly savings for this goal: ({{goalAmount}} / {{goalDurationMonths}}). Ensure this is a positive value if goalAmount and goalDurationMonths are positive.
    - Compare this to their current average monthly net savings ({{averageMonthlyIncome}} - {{averageMonthlyExpenses}}).
2.  **Projected Timeline (if applicable)**: If the goal seems feasible or challenging with their *current* average net savings (not the newly calculated required savings for the goal), estimate how many months it would take them to reach {{goalAmount}}. If unfeasible with current habits, omit this. Ensure this is a positive integer if provided.
3.  **Required Monthly Savings**: Clearly state the amount (in INR) they need to save *specifically for this goal* each month to meet it in {{goalDurationMonths}} months. This should be a positive number.
4.  **Actionable Suggestions (2-4 points)**: Provide specific, practical suggestions.
    - If current savings are insufficient for the goal's required monthly savings, suggest how much *additional* monthly savings are needed.
    - Suggest which typical expense categories (e.g., 'Food and Dining', 'Shopping', 'Entertainment', 'Subscriptions') they might consider reducing, and by what approximate percentage or amount (INR) if possible.
    - Suggest ways to increase income if relevant.
    - Prioritize clear, actionable steps.
5.  **Motivational Message**: End with a brief, encouraging note.

Structure your output according to the defined schema.
Example for a suggestion: "Consider reducing your 'Entertainment' spending by 15% (approx. ₹X) each month."
Be realistic and positive.
`,
});

const financialGoalForecasterFlow = ai.defineFlow(
  {
    name: 'financialGoalForecasterFlow',
    inputSchema: GoalForecasterInputSchemaInternal, // Use the internal schema
    outputSchema: GoalForecasterOutputSchemaInternal, // Use the internal schema
  },
  async (input) => {
    if (input.averageMonthlyIncome <= 0 && input.goalAmount > 0 && input.goalDurationMonths > 0) { // Check if income is non-positive but goal exists
        return {
            feasibilityAssessment: "Insufficient Data for Full Forecast",
            requiredMonthlySavings: input.goalAmount / input.goalDurationMonths,
            suggestedActions: ["Average monthly income is zero or negative. While we can calculate required monthly savings for the goal, a full feasibility assessment isn't possible without positive income data. Please ensure you have recent income transactions recorded."],
            motivationalMessage: "Update your transaction history for a more accurate forecast."
        };
    }
    const result = await retryableAIGeneration(() => financialGoalPrompt(input));
    return result.output!;
  }
);

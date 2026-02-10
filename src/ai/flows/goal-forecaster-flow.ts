'use server';
/**
 * @fileOverview AI flow for forecasting financial goals and providing a plan.
 *
 * - forecastFinancialGoal - A function that uses AI to assess a financial goal.
 * - GoalForecasterInput - The input type for the forecastFinancialGoal function. (Imported from lib/types)
 * - GoalForecasterOutput - The return type for the forecastFinancialGoal function. (Imported from lib/types)
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { GoalForecasterInputSchema, GoalForecasterOutputSchema, type GoalForecasterOutput, type AIModel } from '@/lib/types'; // Import types and schemas
import { callAzureOpenAI } from '@/lib/azure-openai';

export type GoalForecasterInput = z.infer<typeof GoalForecasterInputSchema>;

export async function forecastFinancialGoal(
  input: GoalForecasterInput
): Promise<GoalForecasterOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    // Validate input against the main schema before passing to AI
    const validatedInput = GoalForecasterInputSchema.omit({model: true}).parse(input);
    const result = await financialGoalForecasterFlow(input);
    return { ...result, model: modelToUse };
  } catch (flowError: any) {
    console.error("Error executing financialGoalForecasterFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    const baseErrorReturn = {
      feasibilityAssessment: "Error",
      estimatedOrProvidedGoalAmount: input.goalAmount || 0,
      wasAmountEstimatedByAI: !input.goalAmount,
      requiredMonthlySavings: 0,
      suggestedActions: [`An unexpected error occurred: ${errorMessage}`],
      motivationalMessage: "Please try again later.",
      model: modelToUse,
    };
    // Check if it's a Zod validation error from our explicit parse
    if (flowError instanceof z.ZodError) {
       return {
        ...baseErrorReturn,
        feasibilityAssessment: "Input Error",
        suggestedActions: [`Invalid input for AI: ${JSON.stringify(flowError.flatten().fieldErrors)}`],
        motivationalMessage: "Please check your input values."
      };
    }
    return baseErrorReturn;
  }
}

const financialGoalPromptTemplate = `You are a helpful and insightful personal finance advisor for FinWise AI.
The user wants to achieve a financial goal. Analyze their goal against their current financial situation (averages based on recent data in INR) and provide a forecast and actionable plan.
Your response MUST be in a valid JSON format.

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
3.  **Projected Timeline (if applicable)**: If the goal seems feasible or challenging with their *current* average net savings, estimate how many months it would take them to reach 'estimatedOrProvidedGoalAmount'. If unfeasible, omit this. Ensure this is a positive integer if provided.
4.  **Required Monthly Savings**: Clearly state the amount (in INR) they need to save *specifically for this goal* each month to meet it in {{goalDurationMonths}} months, using the 'estimatedOrProvidedGoalAmount'. This should be a positive number.
5.  **Actionable Suggestions (2-4 points)**: Provide specific, practical suggestions based on the 'estimatedOrProvidedGoalAmount'.
    - If current savings are insufficient, suggest how much *additional* monthly savings are needed.
    - Suggest which typical expense categories (e.g., 'Food and Dining', 'Shopping', 'Entertainment') they might consider reducing, and by what approximate percentage or amount (INR) if possible.
    - Suggest ways to increase income if relevant.
6.  **Motivational Message**: End with a brief, encouraging note.

Structure your output according to the defined schema. Ensure all monetary values are positive.
If average monthly income is ₹0, and goalAmount was not provided (AI needs to estimate), state that a goal cannot be estimated or planned without income, set feasibility to 'Insufficient Data for Full Forecast', estimatedOrProvidedGoalAmount to 0, and provide general saving tips.
If goalAmount *was* provided but income is ₹0, calculate required monthly savings but state feasibility is 'Insufficient Data for Full Forecast'.
`;

const financialGoalForecasterFlow = ai.defineFlow(
  {
    name: 'financialGoalForecasterFlow',
    inputSchema: GoalForecasterInputSchema.omit({model: true}),
    outputSchema: GoalForecasterOutputSchema.omit({model: true}),
  },
  async (input) => {
    const model = (input as any).model || 'gemini-3-flash-preview';
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

    let output;
    if (model === 'gpt-5.2-chat') {
        output = await callAzureOpenAI(financialGoalPromptTemplate, input, GoalForecasterOutputSchema.omit({ model: true }));
    } else {
        const prompt = ai.definePrompt({
          name: 'financialGoalPrompt',
          input: { schema: GoalForecasterInputSchema.omit({model: true}) },
          output: { schema: GoalForecasterOutputSchema.omit({model: true}) },
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
          prompt: financialGoalPromptTemplate,
        });
        const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
        output = result.output;
    }
    
    if (!output) {
      throw new Error("AI analysis failed to produce a valid goal forecast.");
    }
    return output;
  }
);

    
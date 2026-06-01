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
import { GoalForecasterInputSchema, GoalForecasterOutputSchema, type GoalForecasterOutput, type AIModel } from '@/lib/types'; // Import types and schemas
import { callStructuredLLM } from '@/lib/ai-client';
import { getDefaultModelForTask } from '@/lib/task-models';

export type GoalForecasterInput = z.infer<typeof GoalForecasterInputSchema>;

export async function forecastFinancialGoal(
  input: GoalForecasterInput
): Promise<GoalForecasterOutput> {
  const modelToUse = input.model || getDefaultModelForTask('goal_forecast');
  try {
    // Validate input against the main schema before passing to AI
    const validatedInput = GoalForecasterInputSchema.omit({ model: true }).parse(input);
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

const financialGoalPromptTemplate = `You are a pragmatic personal finance advisor for FinWise AI (Indian users, INR).
Your response MUST be a valid JSON object matching the schema.

User's Goal:
- Description: {{goalDescription}}
- Target Amount (User Provided, optional): ₹{{goalAmount}}
- Desired Duration: {{goalDurationMonths}} months

User's Financials (Recent Averages):
- Average Monthly Income: ₹{{averageMonthlyIncome}}
- Average Monthly Expenses (Core Spending): ₹{{averageMonthlyExpenses}}
- Average Monthly Net Savings: ₹{{netMonthlySavings}}
- Current Approximate Savings Rate: {{currentSavingsRate}}%

PRE-COMPUTED VALUES (use these exact numbers — do NOT recalculate):
- estimatedOrProvidedGoalAmount: ₹{{computedGoalAmount}}
- wasAmountEstimatedByAI: {{wasEstimatedFlag}}
- requiredMonthlySavings: ₹{{computedRequiredMonthlySavings}}
- projectedMonthsToGoal (months at current net savings): {{computedProjectedMonths}}
- alternativeTimelines: {{{json alternativeTimelines}}}

REFERENCE COSTS (use only when you must estimate the goal amount; pick a sensible point in the range and explain briefly):
- Domestic vacation (1 wk, 2 ppl): ₹30,000–₹80,000
- International vacation, mid-tier (1 wk, 2 ppl): ₹1,50,000–₹4,00,000
- Smartphone (mid-tier): ₹25,000–₹60,000  |  Premium: ₹70,000–₹1,50,000
- Laptop (mid-tier): ₹60,000–₹1,00,000  |  Pro/Gaming: ₹1,20,000–₹2,50,000
- Wedding (mid-tier, India): ₹10,00,000–₹40,00,000
- Used car: ₹3,00,000–₹8,00,000  |  New car (sedan/SUV): ₹8,00,000–₹20,00,000
- Home down-payment (Tier-1 metro, 20% of ₹80L): ₹16,00,000
- Emergency fund (6 months expenses): 6 × monthlyExpenses
Cap any estimate at 10× annualIncome unless the goal explicitly demands it (e.g., house).

YOUR JOB:
1. Use the pre-computed numbers verbatim — never recompute monthly savings or projected timeline yourself.
2. Decide feasibility:
   - "Highly Feasible" if requiredMonthlySavings ≤ 0.6 × netMonthlySavings.
   - "Challenging but Possible" if requiredMonthlySavings is between 0.6× and 1.2× netMonthlySavings.
   - "Likely Unfeasible without changes" if requiredMonthlySavings > 1.2× netMonthlySavings or netMonthlySavings ≤ 0.
   - "Insufficient Data for Full Forecast" if averageMonthlyIncome is 0.
3. Suggested Actions (3–5 items): each must reference a specific number from the data (₹ amount or category) — e.g., "Trim 'Dining Out' by ₹2,000/mo (~30% of current) to free up the gap".
4. Briefly comment on the alternativeTimelines array (e.g., "Stretching to 18 months drops monthly need to ₹X — much more sustainable").
5. Motivational message: short, specific, not generic.

Output the schema fields verbatim from PRE-COMPUTED VALUES; do not adjust them.`;

// Reference cost ranges for AI-side estimation when the user does not provide a goal amount.
// These are intentionally rough; the LLM picks a sensible point and we cap the result.
function inferReferenceGoalAmount(description: string, monthlyIncome: number): number {
  const d = description.toLowerCase();
  const annual = Math.max(monthlyIncome, 0) * 12;
  const cap = (n: number) => annual > 0 ? Math.min(n, annual * 10) : n;
  if (/wedding/.test(d)) return cap(2_000_000);
  if (/(home|house|flat|apartment).*down/.test(d) || /down.?payment/.test(d)) return cap(1_600_000);
  if (/(buy|new).*(car|sedan|suv)/.test(d)) return cap(1_200_000);
  if (/used.*car/.test(d)) return cap(500_000);
  if (/europe|international|abroad|trip.*overseas/.test(d)) return cap(250_000);
  if (/vacation|trip|holiday|travel/.test(d)) return cap(60_000);
  if (/laptop|macbook/.test(d)) return cap(90_000);
  if (/iphone|smartphone|phone/.test(d)) return cap(70_000);
  if (/emergency.*fund/.test(d)) return cap(monthlyIncome * 6 || 300_000);
  if (/bike|scooter|motorcycle/.test(d)) return cap(150_000);
  // Generic fallback — half a month's income, min ₹10k.
  return cap(Math.max(monthlyIncome / 2, 10_000));
}

const financialGoalForecasterFlow = ai.defineFlow(
  {
    name: 'financialGoalForecasterFlow',
    inputSchema: GoalForecasterInputSchema.omit({ model: true }),
    outputSchema: GoalForecasterOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || getDefaultModelForTask('goal_forecast');

    // ---- 8A/8C: compute timeline & savings deterministically ----
    const netMonthlySavings = Math.max(0, input.averageMonthlyIncome - input.averageMonthlyExpenses);
    const userProvidedAmount = input.goalAmount && input.goalAmount > 0 ? input.goalAmount : 0;
    const wasEstimatedByAI = userProvidedAmount === 0;
    const computedGoalAmount = userProvidedAmount || inferReferenceGoalAmount(input.goalDescription, input.averageMonthlyIncome);

    const requiredMonthlySavings = computedGoalAmount / input.goalDurationMonths;
    const computedProjectedMonths = netMonthlySavings > 0
      ? Math.max(1, Math.ceil(computedGoalAmount / netMonthlySavings))
      : undefined;

    // 8C: alternative timelines auto-computed
    const alternativeTimelineMonths = Array.from(
      new Set([
        Math.max(1, Math.round(input.goalDurationMonths * 0.5)),
        input.goalDurationMonths,
        Math.round(input.goalDurationMonths * 1.5),
        Math.round(input.goalDurationMonths * 2),
      ])
    ).sort((a, b) => a - b);
    const alternativeTimelines = alternativeTimelineMonths.map(months => ({
      months,
      requiredMonthlySavings: Math.round(computedGoalAmount / months),
      gapVsCurrent: Math.round((computedGoalAmount / months) - netMonthlySavings),
    }));

    // ---- early-return cases (kept) ----
    if (input.averageMonthlyIncome <= 0 && !userProvidedAmount) {
      return {
        feasibilityAssessment: "Insufficient Data for Full Forecast",
        estimatedOrProvidedGoalAmount: 0,
        wasAmountEstimatedByAI: true,
        requiredMonthlySavings: 0,
        suggestedActions: ["Average monthly income is zero. Add recent income transactions so we can plan against your real cashflow."],
        motivationalMessage: "Update your transaction history for a more accurate forecast."
      };
    }
    if (input.averageMonthlyIncome <= 0 && userProvidedAmount > 0) {
      return {
        feasibilityAssessment: "Insufficient Data for Full Forecast",
        estimatedOrProvidedGoalAmount: userProvidedAmount,
        wasAmountEstimatedByAI: false,
        requiredMonthlySavings,
        suggestedActions: [`At your current data, you'd need ₹${Math.round(requiredMonthlySavings).toLocaleString('en-IN')}/mo for this goal. Add income data to enable a full feasibility view.`],
        motivationalMessage: "Update your transaction history for a more accurate forecast."
      };
    }

    // ---- LLM call: only narrative / suggestions / motivation ----
    const promptInput = {
      ...input,
      netMonthlySavings: Math.round(netMonthlySavings),
      computedGoalAmount: Math.round(computedGoalAmount),
      wasEstimatedFlag: String(wasEstimatedByAI),
      computedRequiredMonthlySavings: Math.round(requiredMonthlySavings),
      computedProjectedMonths: computedProjectedMonths ?? 'unfeasible at current savings',
      alternativeTimelines,
    };

    let output = await callStructuredLLM(model, financialGoalPromptTemplate, promptInput, GoalForecasterOutputSchema.omit({ model: true }), {
      temperature: 0.4,
      maxOutputTokens: 800,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    });

    if (!output) {
      throw new Error("AI analysis failed to produce a valid goal forecast.");
    }

    // 8A: enforce the deterministic numbers regardless of what the LLM returned.
    return {
      ...output,
      estimatedOrProvidedGoalAmount: computedGoalAmount,
      wasAmountEstimatedByAI: wasEstimatedByAI,
      requiredMonthlySavings,
      projectedMonthsToGoal: computedProjectedMonths,
    };
  }
);


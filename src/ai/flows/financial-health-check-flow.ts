'use server';
/**
 * @fileOverview AI flow for generating a weekly/monthly financial health check summary.
 *
 * - getFinancialHealthCheck - A function that uses AI to summarize financial activity.
 * - FinancialHealthCheckInput - The input type for the getFinancialHealthCheck function.
 * - FinancialHealthCheckOutput - The return type for the getFinancialHealthCheck function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { FinancialHealthCheckInputSchema, FinancialHealthCheckOutputSchema, type FinancialHealthCheckOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function getFinancialHealthCheck(
  input: z.infer<typeof FinancialHealthCheckInputSchema>
): Promise<FinancialHealthCheckOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    const validatedInput = FinancialHealthCheckInputSchema.omit({ model: true }).parse(input);
    const result = await financialHealthCheckFlow(input);
    return { ...result, model: modelToUse };
  } catch (flowError: any) {
    console.error("Error executing financialHealthCheckFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error during AI processing.';
    if (flowError instanceof z.ZodError) {
      return {
        healthSummary: `Could not generate health check due to input errors: ${JSON.stringify(flowError.flatten().fieldErrors)}. Please check server logs.`,
        model: modelToUse,
      };
    }
    return {
      healthSummary: `An unexpected error occurred while generating the health check: ${errorMessage}`,
      model: modelToUse,
    };
  }
}

const healthCheckPromptTemplate = `You are a friendly financial assistant for FinWise AI (INR).
Your output MUST be valid JSON matching the schema.

Period: {{periodDescription}}

Current Period Data:
- Total Income: ₹{{currentTotalIncome}}
- Total Expenses: ₹{{currentTotalExpenses}}
- Spending Breakdown: {{currentSpendingBreakdown}}

Previous Period Data:
- Total Income: ₹{{previousTotalIncome}}
- Total Expenses: ₹{{previousTotalExpenses}}

PRE-COMPUTED VALUES (use these verbatim — DO NOT recalculate):
- healthScore (0-100): {{computedHealthScore}}
- scoreBreakdown: {{{json scoreBreakdown}}}
- anomalies (high-impact category moves vs previous period): {{{json anomalies}}}

Your job is the **narrative**, not the numbers:
1. healthSummary: 4-6 sentences. Reference the computedHealthScore explicitly ("Health score: 72/100"). State income/expense totals, the comparison vs previous period, the dominant spending bucket, and 1-2 specific tips that reference real category names.
2. healthScore: copy from computedHealthScore exactly.
3. scoreBreakdown: copy from above exactly.
4. anomalies: copy the supplied anomalies array verbatim. If empty, return an empty array.

Be specific (numbers and categories), constructive, and use ₹ for amounts.`;

// 10A: deterministic 0-100 health score from savings rate, expense growth, and investment rate.
function computeHealthScore(input: z.infer<typeof FinancialHealthCheckInputSchema>) {
  const income = input.currentTotalIncome;
  const expenses = input.currentTotalExpenses;
  const investments = input.currentTotalInvestments ?? 0;
  const prevExpenses = input.previousTotalExpenses;

  // Savings rate component (max 40)
  const savingsRate = income > 0 ? (income - expenses) / income : 0;
  const savingsScore = Math.max(0, Math.min(40, Math.round(savingsRate * 100 * 0.4)));

  // Expense growth component (max 30): flat = 30, +50% MoM = 0
  let expenseGrowthScore = 30;
  if (prevExpenses > 0) {
    const growth = (expenses - prevExpenses) / prevExpenses;
    if (growth > 0) expenseGrowthScore = Math.max(0, Math.round(30 - growth * 60));
    else expenseGrowthScore = 30;
  }

  // Investment rate component (max 30): 30% of income invested -> full score
  const invRate = income > 0 ? investments / income : 0;
  const investmentScore = Math.max(0, Math.min(30, Math.round((invRate / 0.30) * 30)));

  const total = Math.max(0, Math.min(100, savingsScore + expenseGrowthScore + investmentScore));
  return {
    total,
    breakdown: {
      savingsRate: savingsScore,
      expenseGrowth: expenseGrowthScore,
      investmentRate: investmentScore,
    },
  };
}

// 10B: anomalies = categories with > 25% MoM change AND ≥ ₹500 absolute swing.
function detectAnomalies(input: z.infer<typeof FinancialHealthCheckInputSchema>) {
  const cur = input.currentCategoryTotals || {};
  const prev = input.previousCategoryTotals || {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  const anomalies: { label: string; detail: string; severity: 'info' | 'warning' | 'critical' }[] = [];
  for (const k of keys) {
    const c = cur[k] || 0;
    const p = prev[k] || 0;
    if (Math.abs(c - p) < 500) continue;
    if (p === 0 && c > 0) {
      anomalies.push({ label: k, detail: `New spend: ₹${Math.round(c).toLocaleString('en-IN')} (no prior month activity)`, severity: 'info' });
      continue;
    }
    if (p > 0) {
      const pct = ((c - p) / p) * 100;
      if (Math.abs(pct) < 25) continue;
      const direction = pct >= 0 ? '↑' : '↓';
      const severity: 'info' | 'warning' | 'critical' = Math.abs(pct) >= 75 ? 'critical' : Math.abs(pct) >= 40 ? 'warning' : 'info';
      anomalies.push({
        label: k,
        detail: `${direction} ${Math.abs(pct).toFixed(0)}% (₹${Math.round(p).toLocaleString('en-IN')} → ₹${Math.round(c).toLocaleString('en-IN')})`,
        severity,
      });
    }
  }
  // Sort by severity then magnitude
  const sevOrder = { critical: 0, warning: 1, info: 2 } as const;
  anomalies.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  return anomalies.slice(0, 6);
}

const financialHealthCheckFlow = ai.defineFlow(
  {
    name: 'financialHealthCheckFlow',
    inputSchema: FinancialHealthCheckInputSchema.omit({ model: true }),
    outputSchema: FinancialHealthCheckOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || 'gemini-3-flash-preview';

    const { total: computedHealthScore, breakdown: scoreBreakdown } = computeHealthScore(input);
    const anomalies = detectAnomalies(input);

    const promptInput = {
      ...input,
      computedHealthScore,
      scoreBreakdown,
      anomalies,
    };

    let output;
    if (model === 'gpt-5.2-chat') {
      output = await callAzureOpenAI(healthCheckPromptTemplate, promptInput, FinancialHealthCheckOutputSchema.omit({ model: true }));
    } else {
      const prompt = ai.definePrompt({
        name: 'financialHealthCheckPrompt',
        output: { schema: FinancialHealthCheckOutputSchema.omit({ model: true }) },
        config: {
          temperature: 0.4,
          maxOutputTokens: 600,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        },
        prompt: healthCheckPromptTemplate,
      });
      const result = await retryableAIGeneration(() => prompt(promptInput as any, { model: googleAI.model(model) }));
      output = result.output;
    }

    if (!output) {
      throw new Error("AI analysis failed to produce a valid health check summary.");
    }

    // Always overwrite the deterministic fields so the LLM can't drift.
    return {
      ...output,
      healthScore: computedHealthScore,
      scoreBreakdown,
      anomalies,
    };
  }
);


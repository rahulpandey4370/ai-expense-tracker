'use server';

/**
 * @fileOverview AI-powered insights about spending habits using Gemini 2.5 Flash.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

// --- Input Schema ---
const SpendingInsightsInputSchema = z.object({
  currentMonthIncome: z.number().describe('The total income for the current month in INR.'),
  currentMonthCoreSpending: z.number().describe('The total core spending (Needs + Wants) for the current month in INR.'),
  currentMonthInvestmentSpending: z.number().describe('The total amount actively invested this month (e.g., stocks, mutual funds) in INR.'),
  lastMonthCoreSpending: z.number().describe('The total core spending for the last month in INR.'),
  spendingByCategory: z
    .record(z.number())
    .describe('A JSON object mapping each core spending category to its total amount for the current month in INR.'),
  lastMonthSpendingByCategory: z
    .record(z.number())
    .describe('A JSON object mapping each core spending category to its total amount for the previous month in INR.'),
  insightType: z
    .enum(['default', 'cost_cutter', 'growth_investor'])
    .optional()
    .default('default'),
  selectedMonth: z
    .number()
    .min(0)
    .max(11)
    .describe('The selected month for analysis (0=Jan, 11=Dec).'),
  selectedYear: z.number().describe('The selected year for analysis.'),
});

export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;

// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z
    .array(z.string())
    .optional()
    .describe('2–4 positive spending habits or trends observed this month.'),
  areasForImprovement: z
    .array(z.string())
    .optional()
    .describe('2–4 specific, actionable areas where spending could be optimized or is a potential risk.'),
  keyTakeaway: z
    .string()
    .optional()
    .describe(
      "A single, concise 'bottom line' summary of the most important financial insight for the user this month."
    ),
});

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a balanced, practical financial advisor. You give clear, encouraging, and actionable advice.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. You are direct, blunt, and focused on finding every possible way to reduce spending and save money.`,
  growth_investor: `You are a growth-focused financial advisor. Your main goal is to help the user maximize their savings and investments. You see all un-invested money as a missed opportunity.`,
};

// --- Prompt Definition ---
const spendingInsightsPrompt = ai.definePrompt({
  name: 'spendingInsightsPrompt',
  input: {
    schema: z.object({
      persona: z.string(),
      analysisPeriod: z.string(),
      currentDate: z.string(),
      jsonInput: z.string(),
    }),
  },
  output: {
    schema: SpendingInsightsOutputSchema,
  },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.6,
    maxOutputTokens: 2500, // ⬅️ increased
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `## PERSONALITY
{{persona}}

## ROLE
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance. Your job is to provide **deep, non-obvious, highly practical insights** based on the user's financial data.

## CONTEXT
- **Analysis Period:** {{analysisPeriod}}
- **Today's Date:** {{currentDate}} (Use this to provide time-aware, practical advice regarding the time of the month).
- Many big fixed expenses (like rent, home loan EMIs, personal loan EMIs, insurance premiums, school fees, etc.) typically occur **once a month**, often at the **start of the month**.
- **Do NOT** naively project the current spending rate linearly for the whole month, especially if:
  - It is early in the month and major fixed expenses have already gone out, or
  - The pattern clearly shows front-loaded or one-time expenses.
- Instead, reason about *how* and *when* expenses usually occur during a month, and factor that into your insights.
- The full user data is provided in "jsonInput" as a JSON object. Example keys you can use:
  - currentMonthCoreSpending
  - lastMonthCoreSpending
  - spendingByCategory
  - lastMonthSpendingByCategory
  - currentMonthInvestmentSpending
  - currentMonthIncome

## TASK
1. Parse **jsonInput** and understand the user's situation.
2. If \`currentMonthCoreSpending > 0\` OR \`lastMonthCoreSpending > 0\` (from jsonInput):
   - You **MUST** return:
     - **positiveObservations**: an array with **2 to 4** items.
     - **areasForImprovement**: an array with **2 to 4** items.
     - **keyTakeaway**: a **non-empty string**.
   - Each item in the arrays is **one complete insight**, written as a sentence or two. No numbering, no bullet prefixes.
   - If the data is limited, you still MUST produce 2–4 insights in each array by combining:
     - What you can infer from the actual numbers, and
     - Concrete, best-practice advice clearly tied back to the data pattern.
   - **Never** return empty arrays or an empty keyTakeaway in this case.
3. Only if \`currentMonthCoreSpending === 0\` AND \`lastMonthCoreSpending === 0\`:
   - You may return:
     - "positiveObservations": []
     - "areasForImprovement": []
     - "keyTakeaway": ""
   - This is the **only** case where arrays can be empty and the takeaway can be empty.

Focus on:
- Hidden trends (e.g., lifestyle creep, category drift, "silent" categories growing over time).
- Risky patterns (e.g., EMI-heavy profile, low savings/investment rate, recurring small leaks).
- Time-of-month nuances (early big expenses already done vs upcoming predictable spikes).
- Specific, Rupee-denominated (₹) suggestions and thresholds.

## OUTPUT FORMAT (STRICT)
You must output **only** a valid JSON object with exactly these three top-level keys:
- "positiveObservations": string[]
- "areasForImprovement": string[]
- "keyTakeaway": string

Example shape (values are just examples):

{
  "positiveObservations": [
    "Your core spending for {{analysisPeriod}} is ₹X lower than last month, showing better control over discretionary expenses.",
    "You have consistently kept essential categories like rent and utilities stable, avoiding lifestyle creep."
  ],
  "areasForImprovement": [
    "Spending on 'Food Delivery' is higher than last month; consider setting a weekly cap and shifting some orders to home-cooked meals.",
    "Shopping-related expenses have spiked early in the month; plan remaining festive/holiday expenses to avoid end-of-month cash stress."
  ],
  "keyTakeaway": "You are moving in the right direction on core spending, but tightening just 1–2 discretionary categories and slightly increasing investments could significantly improve your financial position this month."
}

Rules:
- **No markdown**, no explanation, no commentary before or after.
- Do **not** wrap the JSON in backticks.
- Do **not** include any extra keys or fields.
- Do **not** number the insights inside the strings (no "1.", "2." etc.).`,
});

// --- Flow Definition ---
const spendingInsightsFlow = ai.defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema,
  },
  async (input) => {
    const selectedPersona = personas[input.insightType || 'default'] || personas['default'];

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

    // Current date in India time (Bangalore)
    const currentDate = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    const promptInput = {
      persona: selectedPersona,
      analysisPeriod,
      currentDate,
      jsonInput: JSON.stringify(input, null, 2),
    };

    const result = await retryableAIGeneration(() => spendingInsightsPrompt(promptInput));

    if (!result.output) {
      console.error('AI model returned invalid structure:', JSON.stringify(result, null, 2));
      throw new Error('The AI returned a response, but it was empty or malformed.');
    }

    // Normalize so UI always gets arrays/string
    return {
      positiveObservations: result.output.positiveObservations ?? [],
      areasForImprovement: result.output.areasForImprovement ?? [],
      keyTakeaway: result.output.keyTakeaway ?? '',
    };
  }
);

// --- Main Export Function ---
export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  try {
    const validatedInput = SpendingInsightsInputSchema.parse(input);
    return await spendingInsightsFlow(validatedInput);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Input Zod validation error:', error.flatten());
      return {
        positiveObservations: [],
        areasForImprovement: [],
        keyTakeaway: `Validation Error: ${error.message}`,
      };
    }

    console.error('Error in getSpendingInsights:', error);

    return {
      positiveObservations: [],
      areasForImprovement: [],
      keyTakeaway: `I'm sorry, an unexpected error occurred while generating insights: ${error.message}`,
    };
  }
}

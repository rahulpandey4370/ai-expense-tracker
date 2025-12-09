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
  currentMonthInvestmentSpending: z
    .number()
    .describe('The total amount actively invested this month (e.g., stocks, mutual funds) in INR.'),
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
    .describe('3 positive spending habits or trends observed this month.'),
  areasForImprovement: z
    .array(z.string())
    .optional()
    .describe('3 specific, actionable areas where spending could be optimized or is a potential risk.'),
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
    maxOutputTokens: 2500, // bumped up
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
- Many big fixed expenses (rent, home loan EMIs, personal loan EMIs, insurance, school fees, etc.) typically occur **once a month**, often at the **start of the month**.
- **Do NOT** naively project the current spending rate linearly for the whole month, especially if:
  - It is early in the month and major fixed expenses have already gone out, or
  - The pattern clearly shows front-loaded or one-time expenses.
- Instead, reason about *how* and *when* expenses usually occur during a month, and factor that into your insights.

The full user data is in **jsonInput** as a JSON object. Important keys:
- \`currentMonthCoreSpending\` (number)
- \`lastMonthCoreSpending\` (number)
- \`spendingByCategory\` (object: category -> current month spend)
- \`lastMonthSpendingByCategory\` (object: category -> last month spend)
- \`currentMonthIncome\` (number)
- \`currentMonthInvestmentSpending\` (number)

## HARD CONSTRAINTS ON FACTS
When you talk about numbers or comparisons:

1. **You must only use values that actually exist in jsonInput**, or basic arithmetic directly on them
   (e.g., difference or percentage between two known values).
2. **Never invent**:
   - Day ranges (e.g., "first 9 days of the month").
   - Extra amounts not present in jsonInput.
   - Extra dates, periods, or counts of transactions.
3. If you are unsure of an exact number, speak **qualitatively**, e.g.:
   - "lower than last month"
   - "a meaningful share of your income"
   rather than inventing a Rupee amount.

## TASK
1. Parse **jsonInput** and understand the user's situation.
2. If \`currentMonthCoreSpending > 0\` OR \`lastMonthCoreSpending > 0\`:
   - You **MUST** return:
     - **positiveObservations**: an array with **exactly 3** items.
     - **areasForImprovement**: an array with **exactly 3** items.
     - **keyTakeaway**: a **non-empty string**.
   - Each item in the arrays is **one complete insight**, written as 1–3 sentences. No numbering or bullet prefixes.
   - Insights should be specific, refer to categories/amounts from the data where useful, and feel like something a human advisor would actually say.
3. Only if \`currentMonthCoreSpending === 0\` AND \`lastMonthCoreSpending === 0\`:
   - You may return:
     - "positiveObservations": []
     - "areasForImprovement": []
     - "keyTakeaway": ""
   - This is the **only** case where arrays can be empty and the takeaway can be empty.

Focus on:
- Hidden trends (lifestyle creep, category drift, "silent" categories growing).
- Risks (heavy EMIs vs income, low savings/investment, recurring small leaks).
- Time-of-month nuance (early big expenses vs upcoming predictable spikes).
- Concrete, Rupee-aware (₹) suggestions tied back to the data.

## OUTPUT FORMAT (STRICT)
You must output **only** a valid JSON object with exactly these three top-level keys:
- "positiveObservations": string[]
- "areasForImprovement": string[]
- "keyTakeaway": string

Example shape (values are examples, do NOT copy them literally):

{
  "positiveObservations": [
    "Your core spending for {{analysisPeriod}} is lower than last month, indicating improved discipline around discretionary categories.",
    "Spending on essential categories like rent and utilities appears stable, which helps prevent lifestyle creep.",
    "Your current month investments show that you are prioritising future goals over short-term consumption."
  ],
  "areasForImprovement": [
    "Spending on 'Food Delivery' is elevated; consider a weekly budget cap and shifting some meals to home-cooked options.",
    "Shopping-related expenses are front-loaded; plan remaining purchases to avoid end-of-month cash stress.",
    "If your surplus after core spending is healthy, consider increasing SIPs or other investments by at least a small fixed amount."
  ],
  "keyTakeaway": "You are broadly on the right track, but tightening 1–2 discretionary categories and slightly increasing investments could significantly improve your financial position this month."
}

Rules:
- **No markdown**, no explanation, no commentary before or after.
- Do **not** wrap the JSON in backticks.
- Do **not** include any extra keys or fields.
- Do **not** number the insights inside the strings (no "1.", "2.", etc.).`,
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

    // Normalise so UI always gets arrays/string
    return {
      positiveObservations: result.output.positiveObservations ?? [],
      areasForImprovement: result.output.areasForImprovement ?? [],
      keyTakeaway: result.output.keyTakeaway ?? '',
    };
  }
);

// --- Main Export Function ---
export async function getSpendingInsights(
  input: SpendingInsightsInput
): Promise<SpendingInsightsOutput> {
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

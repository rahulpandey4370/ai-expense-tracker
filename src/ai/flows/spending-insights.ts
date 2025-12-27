
'use server';

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { modelNames, type AIModel, SpendingInsightsOutputSchema } from '@/lib/types';


// --- Input Schema ---
const SpendingInsightsInputSchema = z.object({
  currentMonthIncome: z.number().describe('The total income for the current month in INR.'),
  currentMonthCoreSpending: z.number().describe('The total core spending (Needs + Wants) for the current month in INR.'),
  currentMonthInvestmentSpending: z.number().describe('The total amount actively invested this month (e.g., stocks, mutual funds) in INR.'),
  lastMonthCoreSpending: z.number().describe('The total core spending for the last month in INR.'),
  spendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the current month in INR.'),
  lastMonthSpendingByCategory: z.record(z.number()).describe('A JSON object mapping each core spending category to its total amount for the previous month in INR.'),
  insightType: z.enum(['default', 'cost_cutter', 'growth_investor']).optional().default('default'),
  selectedMonth: z.number().min(0).max(11).describe("The selected month for analysis (0=Jan, 11=Dec)."),
  selectedYear: z.number().describe("The selected year for analysis."),
  model: z.enum(modelNames).optional().default('gemini-1.5-flash-latest'),
});

export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore. You get straight to the point. You are practical and give actionable advice relevant to an Indian urban context. Use Indian currency symbol (₹) and Indian number formatting (lakhs, crores where appropriate but prefer raw numbers for clarity). Be direct, a bit witty, and slightly critical to motivate the user.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your only goal is to find savings. You are obsessed with efficiency and finding every rupee that can be saved. Your tone is sharp, analytical, and uncompromising. You see all 'want' spending as a liability. Provide specific, sometimes drastic, suggestions to cut costs.`,
  growth_investor: `You are a growth-focused financial advisor. You believe that money should be working for the user. Your goal is to maximize the user's investment potential. You view un-invested savings as a missed opportunity. Your tone is motivating, ambitious, and strategic. You push the user to invest more and cut frivolous spending to fuel their investments.`
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
  config: {
    temperature: 0.8,
    maxOutputTokens: 3000,
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
You are an Expert Personal Finance Analyst for FinWise AI, specializing in Indian urban personal finance. Your task is to provide deep, actionable insights based on the user's financial data. Go beyond the obvious numbers.

## CONTEXT
- **Analysis Period:** {{analysisPeriod}}
- **Today's Date:** {{currentDate}} (Use this to provide time-aware, practical advice regarding the time of the month).

Use {{currentDate}} to understand *where* in the month the user currently is, and adapt your tone and suggestions accordingly. For example:
- If it is early in the month and some big fixed expenses like rent or EMIs have *already* gone out, do **not** assume that the current pace of spending will continue linearly for the whole month.
- Some expenses (like rent, EMIs, insurance premiums) typically occur just once. Do **not** project these one-time amounts as if they will repeat.
- Identify spending anti-patterns, like high discretionary spending right after a salary credit, or a sudden spike in a specific category compared to the previous month.

## TASK
Analyze the user's financial data for {{analysisPeriod}}. Generate a structured response with 2-3 points for each section. Your insights should be time-aware, realistic, and focused on practical next steps for an urban Indian user.

## OUTPUT FORMAT INSTRUCTIONS
You MUST output a valid JSON object matching this structure. If you have no insights for a particular section, return an empty array [] for it.
{
  "positiveObservations": ["..."],
  "areasForImprovement": ["..."],
  "keyTakeaway": "..."
}

Rules for the output:
- It must be a single, valid JSON object.
- Use the Rupee symbol (₹).
- Do NOT include markdown code blocks (like \`\`\`json) in the output, just the raw JSON object.
- The final output MUST be a valid JSON object.

## USER FINANCIAL DATA
\`\`\`json
{{jsonInput}}
\`\`\`
`,
});

// --- Flow Definition ---
const spendingInsightsFlow = ai.defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const selectedPersona =
      personas[input.insightType || 'default'] || personas['default'];

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

    // Dynamically compute today's date in India time (Bangalore)
    const currentDate = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    }).format(new Date());

    const promptInput = {
      persona: selectedPersona,
      analysisPeriod,
      currentDate,
      jsonInput: JSON.stringify(input, null, 2),
    };
    
    const model = input.model;

    const { output } = await retryableAIGeneration(() =>
      spendingInsightsPrompt(promptInput, { model: googleAI.model(model!) })
    );

    if (!output) {
      console.error("AI model returned invalid structure:", JSON.stringify(output, null, 2));
      throw new Error("The AI returned a response, but it was empty or malformed.");
    }

    return output;
  }
);


// --- Main Export Function ---
export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  try {
    const validatedInput = SpendingInsightsInputSchema.parse(input);
    const result = await spendingInsightsFlow(validatedInput);
    return { ...result, model: validatedInput.model };
  } catch (e: any) {
    console.error("Error in getSpendingInsights:", e);
    // Re-throw the error to be caught by the caller, ensuring UI can show a proper error state
    throw new Error(e.message || "An unexpected error occurred while generating insights.");
  }
}

    
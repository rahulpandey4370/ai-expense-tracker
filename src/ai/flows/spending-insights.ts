
'use server';

<<<<<<< HEAD
/**
 * @fileOverview AI-powered insights about spending habits using Gemini.
 */
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import type { AIModel } from '@/contexts/AIModelContext';
=======
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { modelNames, type AIModel } from '@/lib/types';
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)

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
<<<<<<< HEAD
  model: z.string().optional().describe("The AI model to use for generation."),
=======
  model: z.enum(modelNames).optional().default('gemini-1.5-flash-latest'),
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
});

export type SpendingInsightsInput = z.infer<typeof SpendingInsightsInputSchema>;


// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z.array(z.string()).optional().describe("A list of 2-3 positive spending habits or trends observed this month."),
  areasForImprovement: z.array(z.string()).optional().describe("A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk."),
  keyTakeaway: z.string().optional().describe("A single, concise 'bottom line' summary of the most important financial insight for the user this month.")
});


// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z.array(z.string()).optional().describe("A list of 2-3 positive spending habits or trends observed this month."),
  areasForImprovement: z.array(z.string()).optional().describe("A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk."),
  keyTakeaway: z.string().optional().describe("A single, concise 'bottom line' summary of the most important financial insight for the user this month.")
});


// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z.array(z.string()).optional().describe("A list of 2-3 positive spending habits or trends observed this month."),
  areasForImprovement: z.array(z.string()).optional().describe("A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk."),
  keyTakeaway: z.string().optional().describe("A single, concise 'bottom line' summary of the most important financial insight for the user this month.")
});


// --- Output Schema ---
const SpendingInsightsOutputSchema = z.object({
  positiveObservations: z.array(z.string()).optional().describe("A list of 2-3 positive spending habits or trends observed this month."),
  areasForImprovement: z.array(z.string()).optional().describe("A list of 2-3 specific, actionable areas where spending could be optimized or is a potential risk."),
  keyTakeaway: z.string().optional().describe("A single, concise 'bottom line' summary of the most important financial insight for the user this month.")
});

=======
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsOutputSchema>;

// --- Personas ---
const personas = {
<<<<<<< HEAD
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore. You give practical, actionable advice with a bit of local flavor. You are direct and don't sugarcoat things, but you are ultimately trying to help the user improve their financial health. You value common sense over complex financial jargon.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your primary goal is to find every single opportunity to save money. You are meticulous, data-driven, and believe that every rupee saved is a rupee earned. You see wasteful spending everywhere and are not afraid to point it out.`,
  growth_investor: `You are a growth-focused financial advisor. You believe in spending money to make money and optimizing for long-term wealth creation. You are less concerned with small expenses and more focused on whether the user is investing enough and in the right places. You encourage smart risks and strategic spending.`
=======
  default: `You are a brutally honest, no-nonsense financial advisor who lives in Bangalore. You get straight to the point. You are practical and give actionable advice relevant to an Indian urban context. Use Indian currency symbol (₹) and Indian number formatting (lakhs, crores where appropriate but prefer raw numbers for clarity). Be direct, a bit witty, and slightly critical to motivate the user.`,
  cost_cutter: `You are an aggressive cost-cutting financial analyst. Your only goal is to find savings. You are obsessed with efficiency and finding every rupee that can be saved. Your tone is sharp, analytical, and uncompromising. You see all 'want' spending as a liability. Provide specific, sometimes drastic, suggestions to cut costs.`,
  growth_investor: `You are a growth-focused financial advisor. You believe that money should be working for the user. Your goal is to maximize the user's investment potential. You view un-invested savings as a missed opportunity. Your tone is motivating, ambitious, and strategic. You push the user to invest more and cut frivolous spending to fuel their investments.`
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
};

// --- Prompt Definition ---
const spendingInsightsPrompt = ai().definePrompt({
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
<<<<<<< HEAD
    schema: SpendingInsightsOutputSchema.omit({ model: true }),
  },
  config: {
    temperature: 0.8,
    maxOutputTokens: 1200,
=======
    schema: SpendingInsightsOutputSchema,
  },
  config: {
    temperature: 0.8,
    maxOutputTokens: 3000,
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `## PERSONALITY
=======
const spendingInsightsPromptTemplate = `## PERSONALITY
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
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
`;

// --- Flow Definition ---
const spendingInsightsFlow = ai().defineFlow(
  {
    name: 'spendingInsightsFlow',
    inputSchema: SpendingInsightsInputSchema,
    outputSchema: SpendingInsightsOutputSchema.omit({ model: true }),
  },
  async (input) => {
<<<<<<< HEAD
    const model = input.model || 'gemini-3-flash-preview';
    const selectedPersona = personas[input.insightType || 'default'] || personas['default'];
=======
    const selectedPersona =
      personas[input.insightType || 'default'] || personas['default'];
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const analysisPeriod = `${monthNames[input.selectedMonth]} ${input.selectedYear}`;

    const currentDate = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    }).format(new Date());

    const promptInput = {
      persona: selectedPersona,
      analysisPeriod,
      currentDate,
      jsonInput: JSON.stringify(input, null, 2),
    };
    
    const llm = ai(input.model as AIModel);
    const configuredPrompt = llm.definePrompt(spendingInsightsPrompt.getDefinition());

    const model = input.model;

    const { output } = await retryableAIGeneration(() =>
<<<<<<< HEAD
<<<<<<< HEAD
      configuredPrompt(promptInput)
    );
    
    if (!output) {
=======
      spendingInsightsPrompt(promptInput, { model: ai(input.model) })
=======
      spendingInsightsPrompt(promptInput, { model })
>>>>>>> f195e67 (Try fixing this error: `Console Error: Error: (0 , {imported module [pro)
    );

    if (!output || !output.insights) {
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
      console.error("AI model returned invalid structure:", JSON.stringify(output, null, 2));
      throw new Error("The AI returned a response, but it was empty or malformed.");
    }
<<<<<<< HEAD
    
    return {
      positiveObservations: output.positiveObservations || [],
      areasForImprovement: output.areasForImprovement || [],
      keyTakeaway: output.keyTakeaway || "",
    };
=======

    return output;
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
  }
);

function simpleTemplateRender(template: string, data: Record<string, any>): string {
    let rendered = template;
    for (const key in data) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(regex, data[key]);
    }
    return rendered;
}


// --- Main Export Function ---
export async function getSpendingInsights(input: SpendingInsightsInput): Promise<SpendingInsightsOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  try {
    const validatedInput = SpendingInsightsInputSchema.parse(input);
    return await spendingInsightsFlow(validatedInput);
<<<<<<< HEAD
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error("Input Zod validation error:", error.flatten());
      return { 
          keyTakeaway: `Validation Error: ${error.message}` 
      };
    }
    console.error("Error in getSpendingInsights:", error);
    return { 
      keyTakeaway: `I'm sorry, an unexpected error occurred while generating insights: ${error.message}` 
    };
=======
  } catch (e: any) {
    console.error("Error in getSpendingInsights:", e);
    throw new Error(e.message || "An unexpected error occurred while generating insights.");
>>>>>>> 816848e (Do not make any changes just yet. In this application I want to add the)
  }
}

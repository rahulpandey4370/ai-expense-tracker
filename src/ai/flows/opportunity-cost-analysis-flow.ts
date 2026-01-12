
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { OpportunityCostInputSchema, OpportunityCostOutputSchema } from '@/lib/types';
import type { OpportunityCostInput, OpportunityCostOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function analyzeOpportunityCost(input: OpportunityCostInput): Promise<OpportunityCostOutput> {
  const modelToUse = input.model || 'gemini-1.5-flash-latest';
  try {
    const result = await opportunityCostAnalysisFlow(input);
    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error(`Error in analyzeOpportunityCost flow: ${error.message}`, error.stack);
    throw new Error(`An unexpected error occurred while analyzing the purchase: ${error.message}`);
  }
}

const analysisPromptTemplate = `You are a pragmatic and insightful financial advisor. The user is considering a 'want' purchase and wants to understand its true cost.
Your response MUST be in a valid JSON format.

**User's Financial Context:**
- **Item Name:** {{itemName}}
- **Item Cost:** ₹{{itemCost}}
- **Monthly Income:** ₹{{userIncome}}
- **Working Schedule:** {{workingHoursPerDay}} hours/day, {{workingDaysPerMonth}} days/month

**Your Task:**
1.  **Calculate Time Cost:**
    - Calculate the user's hourly wage: (Monthly Income / Working Days per Month) / Working Hours per Day.
    - Calculate how many hours of work are needed to afford the item: Item Cost / Hourly Wage.
    - Convert this into a human-readable string. If it's more than the user's working hours per day, express it in days. Round to one decimal place if needed. For example: "about 5.5 hours of work" or "approx. 3.2 days of work".

2.  **Calculate Investment Alternative:**
    - Project the future value of the item's cost if it were invested instead. Assume a conservative 10% annual return over 10 years.
    - The formula is: Future Value = Principal * (1 + Rate)^Time. E.g., {{itemCost}} * (1.10)^10.
    - Format this into a clear sentence, e.g., "If invested, this amount could grow to approximately ₹[Calculated Value] in 10 years at a 10% annual return."

3.  **Suggest Alternative Uses:**
    - Provide a list of 3-4 diverse, tangible, and enriching alternative ways the user could spend this money.
    - Focus on experiences, self-improvement, or upgrading essentials.
    - Examples: "A weekend trip to a nearby city", "An online course for a new skill", "A high-quality mattress for better sleep", "3-4 sessions with a personal trainer".

4.  **Write a Summary:**
    - Conclude with a brief, thought-provoking summary that reframes the purchase decision without being preachy. It should empower the user to make a conscious choice.
    - Example: "Thinking about a purchase in terms of your life's time and potential future growth helps in making choices that truly align with your long-term goals."

**Output Structure:**
Structure your output precisely according to the defined JSON schema. Ensure all monetary values are in INR (₹).
`;

const opportunityCostAnalysisFlow = ai.defineFlow(
  {
    name: 'opportunityCostAnalysisFlow',
    inputSchema: OpportunityCostInputSchema.omit({ model: true }),
    outputSchema: OpportunityCostOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || 'gemini-1.5-flash-latest';
    let output;

    if (model === 'gpt-5.2-chat') {
        output = await callAzureOpenAI(analysisPromptTemplate, input, OpportunityCostOutputSchema.omit({ model: true }));
    } else {
        const prompt = ai.definePrompt({
          name: 'opportunityCostAnalysisPrompt',
          input: { schema: OpportunityCostInputSchema.omit({ model: true }) },
          output: { schema: OpportunityCostOutputSchema.omit({ model: true }) },
          prompt: analysisPromptTemplate,
        });
        const { output: result } = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
        output = result;
    }
    
    if (!output) {
      throw new Error("Opportunity cost analysis failed to produce a valid output.");
    }
    return output;
  }
);

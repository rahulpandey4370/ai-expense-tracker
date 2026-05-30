'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { OpportunityCostInputSchema, OpportunityCostOutputSchema } from '@/lib/types';
import type { OpportunityCostInput, OpportunityCostOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI, AZURE_DEPLOYMENT_NAME } from '@/lib/azure-openai';

export async function analyzeOpportunityCost(input: OpportunityCostInput): Promise<OpportunityCostOutput> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
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
- **Investment Assumptions:** {{annualReturnRate}}% annual return over {{investmentYears}} years

**Your Task & Output Structure Rules:**
Structure your output precisely according to the defined JSON schema. The values for 'timeCost' and 'investmentAlternative' must be single strings.

1.  **Calculate Time Cost:**
    - Calculate the user's hourly wage: (Monthly Income / Working Days per Month) / Working Hours per Day.
    - Calculate how many hours of work are needed to afford the item: Item Cost / Hourly Wage.
    - **Format the result into a single, human-readable string for the 'timeCost' field.** If it's more than the user's working hours per day, express it in days. Round to one decimal place if needed.
    - **Example for 'timeCost' field:** "about 5.5 hours of work" or "approx. 3.2 days of work".

2.  **Calculate Investment Alternative:**
    - Project the future value of the item's cost if it were invested instead. Use the user-supplied assumptions: {{annualReturnRate}}% annual return over {{investmentYears}} years.
    - The formula is: Future Value = Principal * (1 + Rate/100)^Years. E.g., {{itemCost}} * (1 + {{annualReturnRate}}/100)^{{investmentYears}}.
    - **Format this into a single, clear sentence for the 'investmentAlternative' field**, citing the chosen rate and horizon explicitly.
    - **Example:** "If invested, this could grow to approximately ₹[Calculated Value] in {{investmentYears}} years at a {{annualReturnRate}}% annual return."

3.  **Suggest Alternative Uses:**
    - For the 'alternativeUses' field, provide an array of 3-4 diverse, tangible, and enriching alternative ways the user could spend this money.
    - Focus on experiences, self-improvement, or upgrading essentials.
    - Examples for the array: "A weekend trip to a nearby city", "An online course for a new skill", "A high-quality mattress for better sleep".

4.  **Write a Summary (FinWise Verdict):**
    - For the 'summary' field, provide a concluding verdict.
    - First, reframe the decision by comparing the time cost and investment potential.
    - Then, give a clear recommendation. If the purchase seems reasonable relative to their income and offers good value, explicitly state that it's a reasonable purchase and they can go ahead. If it's too expensive or seems frivolous, advise against it and reinforce the alternatives.
    - **Example (Positive Verdict):** "Seeing this as X hours of your work, and knowing its potential future value, helps put the cost in perspective. Given its utility and your income, this seems like a reasonable purchase. You can go ahead with it."
    - **Example (Negative Verdict):** "This purchase represents nearly X days of your work. Considering that, and the fact that this money could grow significantly if invested, you might want to reconsider. Exploring one of the alternatives could offer more long-term value."

Ensure all monetary values are in INR (₹).
`;

const opportunityCostAnalysisFlow = ai.defineFlow(
  {
    name: 'opportunityCostAnalysisFlow',
    inputSchema: OpportunityCostInputSchema.omit({ model: true }),
    outputSchema: OpportunityCostOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = (input as any).model || 'gemini-3-flash-preview';
    let output;

    if (model === AZURE_DEPLOYMENT_NAME) {
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

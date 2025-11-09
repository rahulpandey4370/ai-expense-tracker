
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { InvestmentAnalysisOutputSchema } from '@/lib/types';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

const InvestmentAnalyzerInputSchema = z.object({
  investmentNotes: z.string().min(10, "Investment notes must be provided.").describe("A string of user-provided notes detailing their investments for the month. E.g., '- Parag Parikh Flexi Cap (Equity): ₹5000\n- UTI Nifty 50 Index Fund (Equity): ₹3000\n- ICICI Pru Liquid Fund (Debt): ₹10000'"),
});

export type InvestmentAnalyzerInput = z.infer<typeof InvestmentAnalyzerInputSchema>;
export type InvestmentAnalysisOutput = z.infer<typeof InvestmentAnalysisOutputSchema>;

export async function analyzeInvestments(input: InvestmentAnalyzerInput): Promise<InvestmentAnalysisOutput> {
  const validation = InvestmentAnalyzerInputSchema.safeParse(input);
  if (!validation.success) {
    throw new Error(`Invalid input: ${JSON.stringify(validation.error.flatten().fieldErrors)}`);
  }
  return await investmentAnalysisFlow(validation.data);
}

const investmentAnalysisPrompt = ai.definePrompt({
  name: 'investmentAnalysisPrompt',
  input: { schema: InvestmentAnalyzerInputSchema },
  output: { schema: InvestmentAnalysisOutputSchema },
  config: {
    temperature: 0.3,
    maxOutputTokens: 1200,
  },
  prompt: `You are an expert investment analyst for Indian retail investors.
Your task is to analyze the user's raw text notes about their monthly investments and provide a structured analysis in INR.

**User's Investment Notes:**
\`\`\`
{{{investmentNotes}}}
\`\`\`

**Your Tasks:**

1.  **Parse and Sum:** Read the notes and identify each individual investment and its amount. Calculate the \`totalInvestment\` amount for the month by summing up all identified investments.

2.  **Categorize:** For each investment, categorize it into one of the following fixed categories: **'Equity', 'Debt', 'Gold', 'US Stocks', 'Crypto', or 'Other'**.
    *   'Equity': Mutual funds (Flexi Cap, Index, Small Cap, etc.), direct stocks.
    *   'Debt': Debt funds, bonds, PPF, EPF.
    *   'Gold': SGBs (Sovereign Gold Bonds), Gold ETFs, Gold funds.
    *   'US Stocks': Direct US stocks or funds investing in US markets (e.g., Nasdaq 100 ETF).
    *   'Crypto': Any cryptocurrency investment.
    *   'Other': For anything that doesn't fit, like real estate, etc.

3.  **Calculate Allocations:**
    *   For each major category (Equity, Debt, etc.), calculate the total amount invested and its percentage of the \`totalInvestment\`.
    *   Within each major category, list the individual fund/asset allocations with their specific amount and percentage relative to the \`totalInvestment\`.

4.  **Rate the Strategy (1-5 Stars):**
    *   **1 Star:** Highly risky, undiversified (e.g., 100% in a single high-risk asset like one stock or crypto).
    *   **2 Stars:** Poor diversification, very high concentration in one category (e.g., >90% in Equity).
    *   **3 Stars:** Decent start but needs improvement. Some diversification but still heavily weighted (e.g., 70-90% in one category) or contains only 1-2 asset types.
    *   **4 Stars:** Good diversification across 2-3 major categories (e.g., a healthy mix of Equity and Debt/Gold).
    *   **5 Stars:** Excellent diversification across multiple major categories, showing a balanced approach to risk (e.g., solid allocation to Equity, Debt, and maybe Gold/US Stocks).

5.  **Justify the Rating:** Write a brief, 2-3 sentence justification explaining your rating. Comment on the diversification and risk profile of the monthly investments.

**Example Output Structure:**
If the notes are "- Nifty 50 Fund (Equity): 5000\n- Gold Bond: 5000", the total is 10000.
The output should have a category 'Equity' with a total of 5000 (50%) and an allocation for 'Nifty 50 Fund' of 5000 (50%). It should also have a category 'Gold' for 5000 (50%). The rating would be high (e.g., 4 stars) for good diversification.

**IMPORTANT: Adhere strictly to the JSON output schema provided.** Ensure all percentages add up correctly.
`,
});

const investmentAnalysisFlow = ai.defineFlow(
  {
    name: 'investmentAnalysisFlow',
    inputSchema: InvestmentAnalyzerInputSchema,
    outputSchema: InvestmentAnalysisOutputSchema,
  },
  async (input) => {
    const result = await retryableAIGeneration(() => investmentAnalysisPrompt(input));
    if (!result.output) {
        throw new Error("AI failed to generate a valid analysis structure.");
    }
    return result.output;
  }
);

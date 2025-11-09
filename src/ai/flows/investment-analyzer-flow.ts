
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
    temperature: 0.1,
    maxOutputTokens: 12000,
  },
  prompt: `You are an expert investment analyst for Indian retail investors with a strict focus on mathematical accuracy.
Your task is to analyze the user's raw text notes about their monthly investments and provide a structured analysis in INR.

**User's Investment Notes:**
\`\`\`
{{{investmentNotes}}}
\`\`\`

**CRITICAL INSTRUCTIONS:**
1.  **ACCURATELY CALCULATE TOTAL:** First, meticulously parse every single investment and its amount. Sum them up to get the final, accurate \`totalInvestment\`. Double-check this total. All subsequent calculations depend on this number being correct.
2.  **CALCULATE PERCENTAGES FROM THE FINAL TOTAL:** After confirming the total, calculate the percentage for each category and individual asset strictly based on the final \`totalInvestment\`. Ensure the sum of category percentages is 100%.

**Your Step-by-Step Tasks:**

1.  **Parse and Sum:** Read the notes and identify each individual investment and its amount. Calculate the \`totalInvestment\` amount for the month by summing up all identified investments. **This is the most important step. Be precise.** You Need to Add all the Investments Mentioned in the notes and add it one by one A+B+C and so on and then calculate the result. Be Precise and Super Accurate. You rely ONLY on the investment notes data and that is all.

2.  **Categorize:** For each investment, categorize it into one of the following fixed categories: **'Equity', 'Debt', 'Gold', 'US Stocks', 'Crypto', or 'Other'**.
    *   'Equity': Mutual funds (Flexi Cap, Index, Small Cap, etc.), direct stocks. All Give the Percentage Per Market Cap Investment as well like Large Cap, Mid Cap, Smaall Cap, Flexi Cap etc.
    *   'Debt': Debt funds, bonds, PPF, EPF.
    *   'Gold': SGBs (Sovereign Gold Bonds), Gold ETFs, Gold funds.
    *   'US Stocks': Direct US stocks or funds investing in US markets (e.g., Nasdaq 100 ETF).
    *   'Crypto': Any cryptocurrency investment.
    *   'Other': For anything that doesn't fit, like real estate, etc.

3.  **Calculate Allocations:**
    *   For each major category (Equity, Debt, etc.), calculate the total amount invested and its percentage of the final, accurate \`totalInvestment\`.
    *   Within each major category, list the individual fund/asset allocations with their specific amount and percentage relative to the final, accurate \`totalInvestment\`.

4.  **Rate the Strategy (1-5 Stars):**
    *   **1 Star:** Highly risky, undiversified (e.g., 100% in a single high-risk asset like one stock or crypto).
    *   **2 Stars:** Poor diversification, very high concentration in one category (e.g., >90% in Equity).
    *   **3 Stars:** Decent start but needs improvement. Some diversification but still heavily weighted (e.g., 70-90% in one category) or contains only 1-2 asset types.
    *   **4 Stars:** Good diversification across 2-3 major categories (e.g., a healthy mix of Equity and Debt/Gold).
    *   **5 Stars:** Excellent diversification across multiple major categories, showing a balanced approach to risk (e.g., solid allocation to Equity, Debt, and maybe Gold/US Stocks).

5.  **Justify the Rating:** Write a brief, 2-3 sentence justification explaining your rating. Comment on the diversification and risk profile of the monthly investments.

**IMPORTANT: Adhere strictly to the JSON output schema provided and ensure all calculations are double-checked for accuracy.**
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

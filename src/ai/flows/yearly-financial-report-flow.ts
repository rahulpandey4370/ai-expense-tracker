'use server';

import { ai } from '@/ai/genkit';
import { retryableAIGeneration } from '../utils/retry-helper';
import { YearlyFinancialReportInputSchema, YearlyFinancialReportOutputSchema } from '@/lib/types';
import type { YearlyFinancialReportInput, YearlyFinancialReportOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI } from '@/lib/azure-openai';

export async function generateYearlyFinancialReport(input: YearlyFinancialReportInput): Promise<YearlyFinancialReportOutput> {
  const modelToUse = input.model || 'gpt-5.2-chat';
  try {
    const result = await yearlyFinancialReportFlow(input);
    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error(`Error in generateYearlyFinancialReport flow: ${error.message}`, error.stack);
    throw new Error(`An unexpected error occurred while generating the yearly financial report: ${error.message}`);
  }
}

const yearlyReportPromptTemplate = `You are an expert personal-finance analyst writing a comprehensive ANNUAL report for an Indian user (currency: INR ₹) for {{year}}.

You are given:
- A per-month aggregated summary for every month of the year (income, expenses, Needs/Wants/Investments split, transaction counts, top categories).
{{#if isAggregated}}
- A sample of the LARGEST transactions of the year (because the full transaction set is too large to inline).
- Total transaction count for the year: {{totalTransactionCount}}.
- IMPORTANT: When citing specific transactions, only cite ones present in the largestTransactions list. For category/aggregate analysis, rely on monthlySummaries.
{{else}}
- The COMPLETE list of transactions for the year ({{totalTransactionCount}} txns) — analyze every one.
{{/if}}

Output MUST be valid JSON conforming to the supplied schema. Use markdown inside string fields. All monetary values use the ₹ symbol with Indian comma grouping (e.g., ₹1,23,456.78).

## MONTHLY SUMMARIES
\`\`\`json
{{{json monthlySummaries}}}
\`\`\`

{{#if transactions}}
## RAW TRANSACTION DATA (full year)
\`\`\`json
{{{json transactions}}}
\`\`\`
{{/if}}

{{#if largestTransactions}}
## LARGEST TRANSACTIONS OF THE YEAR (sample for citation)
\`\`\`json
{{{json largestTransactions}}}
\`\`\`
{{/if}}

## ANALYSIS DEPTH
Be rigorous and quantitative. Cite specific numbers, months, and categories. Avoid vague platitudes; give concrete, dated, numbered observations.

## OUTPUT FORMAT NOTES
- Do NOT repeat the section title as a markdown heading inside that section's field. The UI already renders the section title — your content should start directly with the analysis.
- Use markdown for emphasis/bullets/sub-headings inside the body, but reserve top-level headings (\`### ...\`) for sub-sections WITHIN the analysis, not for the section's own title.

## SECTION REQUIREMENTS

### 1. executiveSummary (markdown, 5-7 sentences)
- Total income, total expenses, net cashflow, overall savings rate % for the year.
- One sentence each for the biggest WIN and biggest CONCERN of the year.
- Highlight any standout month (highest spend, highest income, lowest savings).
- Mention any clear seasonal/quarterly pattern.

### 2. incomeVsExpenseAnalysis (markdown)
- Annual totals for income and expenses; Needs/Wants/Investments split with ₹ + % of total.
- Average monthly income, average monthly expenses, average monthly savings.
- Best & worst month for net cashflow with figures.
- Annual savings rate = (Income − Total Outflows) / Income, to 1 decimal.

### 3. categoryDeepDive (markdown)
- Top 8 expense categories for the year ranked: \`**Category** — ₹X (Y% of expenses)\` with total transactions.
- For top 3 categories, give one sharp insight tied to the data (use month-level patterns where possible).
- Call out any category that is concentrated in a few months (seasonality) vs spread evenly.

### 4. savingsAndInvestmentAnalysis (markdown)
- Total investment outflows for the year.
- Annual investment rate = Total Investments / Total Income (1 decimal %).
- Net cash savings = Income − (Needs + Wants + Investments).
- Discuss how investment activity changed across the year (which months were heaviest / which were skipped).
- Cashback / dividends / interest earned for the year.

### 5. actionableRecommendations (array of 5-7 strings)
- Each item must be specific, quantified, and tied to data above.
- Mix: spending cap recommendation with ₹ target, savings/investment recommendation with ₹ target, behavioural change tied to a specific month or pattern, budget-for-next-year recommendation, and one optimisation tied to a top category.

## RULES
- Numbers must reconcile across sections.
- Treat any transaction with expenseType='investment' OR a category in {Stocks, Mutual Funds, Recurring Deposit, Equity, Debt, Gold/Silver, US Stocks, Crypto} as an investment.
- Treat categories {Cashback, Investment Income, Dividends} (when type=income) as passive income.
- Never invent data not present in the inputs.
`;

const yearlyFinancialReportFlow = ai.defineFlow(
  {
    name: 'yearlyFinancialReportFlow',
    inputSchema: YearlyFinancialReportInputSchema,
    outputSchema: YearlyFinancialReportOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = input.model || 'gpt-5.2-chat';

    const promptInput = {
      year: input.year,
      monthlySummaries: input.monthlySummaries,
      transactions: input.transactions,
      largestTransactions: input.largestTransactions,
      totalTransactionCount: input.totalTransactionCount,
      isAggregated: input.isAggregated,
    };

    let output;
    if (model === 'gpt-5.2-chat') {
      output = await callAzureOpenAI(yearlyReportPromptTemplate, promptInput, YearlyFinancialReportOutputSchema.omit({ model: true }));
    } else {
      const prompt = ai.definePrompt({
        name: 'yearlyFinancialReportPrompt',
        input: { schema: YearlyFinancialReportInputSchema.omit({ model: true }) },
        output: { schema: YearlyFinancialReportOutputSchema.omit({ model: true }) },
        prompt: yearlyReportPromptTemplate,
      });
      const { output: result } = await retryableAIGeneration(() => prompt(promptInput, { model: googleAI.model(model) }));
      output = result;
    }

    if (!output) {
      throw new Error("Yearly financial report generation failed to produce an output.");
    }
    return output;
  }
);

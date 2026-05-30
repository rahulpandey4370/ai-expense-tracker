
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '../utils/retry-helper';
import { MonthlyFinancialReportInputSchema, MonthlyFinancialReportOutputSchema } from '@/lib/types';
import type { MonthlyFinancialReportInput, MonthlyFinancialReportOutput } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { callAzureOpenAI, AZURE_DEPLOYMENT_NAME } from '@/lib/azure-openai';

export async function generateMonthlyFinancialReport(input: MonthlyFinancialReportInput): Promise<MonthlyFinancialReportOutput> {
  // Default to gpt-5.2-chat for the deeper, longer-form monthly report.
  const modelToUse = input.model || AZURE_DEPLOYMENT_NAME;
  try {
    const result = await monthlyFinancialReportFlow(input);
    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error(`Error in generateMonthlyFinancialReport flow: ${error.message}`, error.stack);
    throw new Error(`An unexpected error occurred while generating the financial report: ${error.message}`);
  }
}

const reportPromptTemplate = `You are an expert personal-finance analyst writing a comprehensive monthly report for an Indian user (currency: INR ₹).
You are given the COMPLETE list of transactions for {{monthName}} {{year}} — analyze every single one. Do NOT sample, summarize prematurely, or skip rows.

Output MUST be valid JSON conforming to the supplied schema. Use markdown inside string fields. All monetary values use the ₹ symbol with Indian comma grouping (e.g., ₹1,23,456.78).

## RAW TRANSACTION DATA (full month, do not omit)
Each transaction has fields: \`type\` ('income' or 'expense'), \`amount\`, \`date\`, \`description\`, \`categoryName\`, \`paymentMethodName\`, \`expenseType\` ('need'|'want'|'investment'|'investment_expense', expenses only), and \`source\` (income only). When \`type\` is set, use it directly to partition income vs expense — do NOT re-infer from descriptions or category names.
\`\`\`json
{{{json transactions}}}
\`\`\`

## ANALYSIS DEPTH
Be rigorous and quantitative. Cite specific numbers, dates, merchants, and categories from the data. Avoid vague platitudes like "manage your spending"; give concrete, dated, numbered observations.

## OUTPUT FORMAT NOTES
- Do NOT repeat the section title as a markdown heading inside that section's field. The UI already renders the section title — your content should start directly with the analysis.
- Use markdown for emphasis/bullets/sub-headings inside the body, but reserve top-level headings (\`### ...\`) for sub-sections WITHIN the analysis, not for the section's own title.

## SECTION REQUIREMENTS

### 1. executiveSummary (markdown, 4-6 sentences)
- Total income, total expenses, net cashflow, savings rate %.
- One sentence each: biggest financial WIN this month and biggest CONCERN.
- Mention day-of-month patterns if obvious (e.g., "expenses concentrated in week 1 due to rent + EMI").

### 2. incomeVsExpenseAnalysis (markdown)
- Break income by source (salary, dividends, cashback, other) with ₹ amounts.
- Break expenses into Needs / Wants / Investments with ₹ + % of total.
- Compute and state savings rate = (Income − Total Outflows) / Income, to 1 decimal.
- Average daily spend (total expenses / days in month).
- Biggest single transaction (₹, description, date) and what it was.
- Number of transactions in the month.

### 3. categoryDeepDive (markdown)
- Top 5 expense categories ranked, each line: \`**Category** — ₹X (Y% of expenses, N txns, avg ₹Z/txn)\`.
- For each of the top 3, give one sharp, data-grounded insight (e.g., "Food and Dining: ₹12,400 across 28 txns; 18 of those are weekday lunches averaging ₹350 — a meal-prep habit could save ~₹4,500/mo").
- Call out any category that looks anomalous vs typical patterns (very high txn count, very high avg amount).
- List any one-off or unusual expenses worth noting (rare merchants, large outliers).

### 4. savingsAndInvestmentAnalysis (markdown)
- Sum of investment outflows (categories like Stocks, Mutual Funds, Recurring Deposit, Equity, Debt, Gold/Silver, US Stocks, Crypto, or expenseType=investment).
- Investment rate = Total Investments / Total Income (1 decimal %).
- Cash savings = Income − (Needs + Wants + Investments). State whether positive/negative.
- Diversity comment: how many distinct investment vehicles were used? Concentration risk?
- Cashback/dividends/interest income earned this month.

### 5. actionableRecommendations (array of 4-6 strings)
- Each item must be specific, quantified, and tied to data observed above.
- Mix: 1 spending-cut recommendation with target ₹, 1 investment/savings recommendation with target ₹, 1 behavioural recommendation (timing, automation, review subscriptions), 1 budget/goal recommendation for next month.
- Bad: "Reduce wants spending."  Good: "Cap 'Shopping' at ₹4,000 next month — you spent ₹6,200 across 9 txns this month, with ₹2,800 of that on 3 weekend impulse buys."

## RULES
- Numbers must reconcile (sums must be consistent across sections).
- If the month has very few transactions (< 5), still produce a report but say data is sparse.
- Never invent transactions, merchants, or categories that aren't in the data.
- Treat any transaction with expenseType='investment' OR a category in {Stocks, Mutual Funds, Recurring Deposit, Equity, Debt, Gold/Silver, US Stocks, Crypto} as an investment.
- Treat categories {Cashback, Investment Income, Dividends} (when type=income) as passive income.
`;


const monthlyFinancialReportFlow = ai.defineFlow(
  {
    name: 'monthlyFinancialReportFlow',
    inputSchema: MonthlyFinancialReportInputSchema,
    outputSchema: MonthlyFinancialReportOutputSchema.omit({ model: true }),
  },
  async (input) => {
    const model = input.model || AZURE_DEPLOYMENT_NAME;

    // Create the prompt input, excluding the model property
    const promptInput = {
      monthName: input.monthName,
      year: input.year,
      transactions: input.transactions,
    };

    let output;
    if (model === AZURE_DEPLOYMENT_NAME) {
      output = await callAzureOpenAI(reportPromptTemplate, promptInput, MonthlyFinancialReportOutputSchema.omit({ model: true }));
    } else {
      const prompt = ai.definePrompt({
        name: 'monthlyFinancialReportPrompt',
        input: { schema: MonthlyFinancialReportInputSchema.omit({ model: true }) },
        output: { schema: MonthlyFinancialReportOutputSchema.omit({ model: true }) },
        prompt: reportPromptTemplate,
      });
      const { output: result } = await retryableAIGeneration(() => prompt(promptInput, { model: googleAI.model(model) }));
      output = result;
    }

    if (!output) {
      throw new Error("Financial report generation failed to produce an output.");
    }
    return output;
  }
);

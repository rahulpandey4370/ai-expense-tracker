
'use server';

import { generateMonthlyFinancialReport, type MonthlyFinancialReportInput, type MonthlyFinancialReportOutput } from "@/ai/flows/monthly-financial-report-flow";
import { AITransactionForAnalysisSchema, type AIModel, modelNames } from "@/lib/types";
import { getTransactions } from "./transactions";

export async function getMonthlyReport(month: number, year: number, model: AIModel): Promise<MonthlyFinancialReportOutput> {
  const allTransactions = await getTransactions();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const relevantTransactions = allTransactions
    .filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === month && transactionDate.getFullYear() === year;
    })
    .map(t => {
      // Validate and transform each transaction to match AITransactionForAnalysisSchema
      const validatedData = AITransactionForAnalysisSchema.safeParse({
        description: t.description,
        amount: t.amount,
        date: t.date.toISOString(),
        categoryName: t.category?.name,
        paymentMethodName: t.paymentMethod?.name,
        expenseType: t.expenseType,
      });

      if (validatedData.success) {
        return validatedData.data;
      }
      console.warn(`Skipping invalid transaction for AI report: ${t.description}`, validatedData.error.flatten().fieldErrors);
      return null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (relevantTransactions.length === 0) {
    throw new Error(`No transactions found for ${monthNames[month]} ${year}.`);
  }

  const input: MonthlyFinancialReportInput = {
    monthName: monthNames[month],
    year: year,
    transactions: relevantTransactions,
    model: model || 'gemini-3-flash-preview',
  };

  return await generateMonthlyFinancialReport(input);
}


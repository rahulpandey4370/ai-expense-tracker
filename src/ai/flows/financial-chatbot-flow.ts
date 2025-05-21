
'use server';
/**
 * @fileOverview AI-powered chatbot for answering financial questions.
 *
 * - askFinancialBot - A function that handles financial queries using AI.
 * - FinancialChatbotOutput - The return type for the askFinancialBot function.
 * - ChatMessage - Type for chat history messages.
 */

import {ai}from '@/ai/genkit';
import {z}from 'genkit';
import type { AppTransaction } from '@/lib/types';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { getMonth, getYear, startOfMonth, endOfMonth, startOfYear, endOfYear, isValid } from 'date-fns';

const AITransactionSchema = z.object({
  id: z.string(),
  type: z.string(),
  date: z.string().describe("Date in ISO format string"),
  amount: z.number(),
  description: z.string().nullish(),
  categoryName: z.string().nullish().describe("Name of the category if applicable"),
  paymentMethodName: z.string().nullish().describe("Name of the payment method if applicable"),
  expenseType: z.string().nullish().describe("Type of expense: 'need', 'want', 'investment_expense' if applicable"),
  source: z.string().nullish().describe("Source of income if applicable"),
});
type AITransaction = z.infer<typeof AITransactionSchema>;

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Not exported - internal to the flow
const FinancialChatbotInputSchemaInternal = z.object({
  query: z.string().describe("The user's current financial question or request."),
  transactions: z.array(AITransactionSchema).describe("An array of user's financial transactions relevant to the query context. This might be all transactions or a subset based on selected filters like month/year."),
  chatHistory: z.array(ChatMessageSchema).optional().describe("Previous conversation history, if any."),
  dataScopeMessage: z.string().optional().describe("A message indicating the scope of the transaction data provided, e.g., 'for June 2023' or 'most recent transactions'.")
});
type FinancialChatbotInputInternal = z.infer<typeof FinancialChatbotInputSchemaInternal>;


const FinancialChatbotOutputSchema = z.object({
  response: z.string().describe("The AI's response to the user's query."),
});
export type FinancialChatbotOutput = z.infer<typeof FinancialChatbotOutputSchema>;

const monthNamesForParsing = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

function getYearFromQuery(query: string): number | null {
  const yearMatch = query.match(/\b(20[2-9][0-9])\b/); // Matches 2020-2099
  return yearMatch ? parseInt(yearMatch[1], 10) : null;
}

function getMonthFromQuery(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  for (let i = 0; i < monthNamesForParsing.length; i++) {
    if (lowerQuery.includes(monthNamesForParsing[i])) {
      return i; // 0 for January, 11 for December
    }
  }
  return null;
}

export async function askFinancialBot(input: {
  query: string;
  transactions: AppTransaction[];
  chatHistory?: ChatMessage[];
}): Promise<FinancialChatbotOutput> {

  const queryYear = getYearFromQuery(input.query);
  const queryMonth = getMonthFromQuery(input.query);
  let filteredUserTransactions = [...input.transactions];
  let dataScopeMessage = "most recent transactions (up to 250)";

  if (queryYear !== null) {
    if (queryMonth !== null) {
      // Filter by specific month and year
      const targetDate = new Date(queryYear, queryMonth, 1);
      if (isValid(targetDate)) {
        const periodStart = startOfMonth(targetDate);
        const periodEnd = endOfMonth(targetDate);
        filteredUserTransactions = input.transactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate >= periodStart && transactionDate <= periodEnd;
        });
        dataScopeMessage = `transactions for ${monthNamesForParsing[queryMonth]} ${queryYear}`;
      }
    } else {
      // Filter by entire year
      const targetDate = new Date(queryYear, 0, 1);
       if (isValid(targetDate)) {
        const periodStart = startOfYear(targetDate);
        const periodEnd = endOfYear(targetDate);
        filteredUserTransactions = input.transactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate >= periodStart && transactionDate <= periodEnd;
        });
        dataScopeMessage = `transactions for the year ${queryYear}`;
      }
    }
  } else if (queryMonth !== null) {
    // Filter by month in current year if only month is specified
    const currentYear = getYear(new Date());
    const targetDate = new Date(currentYear, queryMonth, 1);
    if (isValid(targetDate)) {
        const periodStart = startOfMonth(targetDate);
        const periodEnd = endOfMonth(targetDate);
        filteredUserTransactions = input.transactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate >= periodStart && transactionDate <= periodEnd;
        });
        dataScopeMessage = `transactions for ${monthNamesForParsing[queryMonth]} ${currentYear}`;
    }
  }

  const aiTransactions: AITransaction[] = filteredUserTransactions
    .map(t => ({
      id: t.id,
      type: t.type,
      date: t.date instanceof Date ? t.date.toISOString() : new Date(t.date).toISOString(),
      amount: t.amount,
      description: t.description,
      categoryName: t.category?.name,
      paymentMethodName: t.paymentMethod?.name,
      expenseType: t.expenseType,
      source: t.source,
    }))
    .slice(0, 250); // Limit to 250 transactions after filtering

  return financialChatbotFlow({
    query: input.query,
    transactions: aiTransactions,
    chatHistory: input.chatHistory,
    dataScopeMessage: dataScopeMessage + (aiTransactions.length < filteredUserTransactions.length ? `, showing the latest ${aiTransactions.length}` : '')
  });
}


const financialChatbotFlow = ai.defineFlow(
  {
    name: 'financialChatbotFlow',
    inputSchema: FinancialChatbotInputSchemaInternal,
    outputSchema: FinancialChatbotOutputSchema,
  },
  async ({ query, transactions, chatHistory, dataScopeMessage }) => {
    let systemPrompt = `You are an AI Financial Assistant for FinWise AI, an expert in analyzing personal finance data in Indian Rupees (INR).
The user has provided their transaction data. Your task is to answer the user's questions based on this data and any provided conversation history.
The transaction data provided to you is for ${dataScopeMessage || 'the most recent period (up to 250 transactions)'}.
Be concise and helpful. If the data provided does not contain information for a specific period or query, clearly state that your knowledge is based on the transaction data you have access to.
Refer to amounts in INR (e.g., ₹1000). When mentioning categories or payment methods, use the names provided (categoryName, paymentMethodName).

This application also has a 'Yearly Overview' page that provides a month-by-month summary of income, spending, savings, investments, and cashbacks/interests for a selected year. If the user asks for comprehensive yearly summaries or trends, you can suggest they visit that page.

Transaction Data:
\`\`\`json
${JSON.stringify(transactions, null, 2)}
\`\`\`
${transactions.length >= 250 ? `\n...(Note: Displaying up to 250 transactions. The actual data for the queried period might be larger if not fully shown here)` : ''}
`;

    const messages: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
    messages.push({ role: 'system', content: systemPrompt });

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-5).forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }
    messages.push({ role: 'user', content: query });

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:',
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    }));

    const responseText = llmResponse.text;
    if (!responseText) {
      console.error("AI model returned no text for financial chatbot query:", query);
      return { response: "I'm sorry, I encountered an issue generating a response. Please try again." };
    }
    return { response: responseText };
  }
);

    
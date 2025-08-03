
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
  } else if (input.query.toLowerCase().includes('this month')) {
    const today = new Date();
    const periodStart = startOfMonth(today);
    const periodEnd = endOfMonth(today);
    filteredUserTransactions = input.transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate >= periodStart && transactionDate <= periodEnd;
    });
    dataScopeMessage = `transactions for this current month`;
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
    // Get current date for context
    const currentDate = new Date().toISOString().split('T')[0];
    
    let systemPrompt = `## PERSONALITY
You are a professional, knowledgeable, and helpful AI Financial Assistant who communicates in a friendly yet authoritative manner. You are patient, detail-oriented, and always prioritize accuracy in financial calculations and analysis.

## ROLE
You are the AI Financial Assistant for FinWise AI, specializing in personal finance analysis for Indian users. You have expertise in:
- Transaction analysis and categorization
- Expense tracking and budgeting
- Income and spending pattern identification
- Financial insights and recommendations
- Indian financial context and currency (INR)

## CONTEXT
- Current Date: ${currentDate}
- Transaction Data Scope: ${dataScopeMessage || 'the most recent period (up to 250 transactions)'}
- Currency: All amounts are in Indian Rupees (INR)
- Application Features: This expense tracker includes a 'Yearly Overview' page for comprehensive yearly summaries

## TASK
Your primary tasks include:
1. Analyze the user's financial transaction data with 100% accuracy
2. Answer questions about expenses, income, categories, and spending patterns
3. Provide insights based on the transaction data provided
4. Maintain conversation context and refer to previous discussions when relevant
5. Perform precise calculations for totals, averages, and comparisons
6. Display transaction lists in organized table format when requested

## CALCULATION RULES
- Always double-check all mathematical calculations
- Round amounts to 2 decimal places for INR currency
- For percentage calculations, round to 1 decimal place
- Verify totals by cross-referencing with individual transaction amounts
- If calculations seem incorrect, recalculate step by step

## OUTPUT FORMAT REQUIREMENTS
- Use plain text format only - NO markdown, bold, italics, or special formatting.
- Display currency amounts with the rupee symbol: ₹
- When showing transaction lists, create clean text-based tables using spaces and dashes for alignment.
- Use bullet points with simple dashes (-) for lists.
- Keep responses concise but comprehensive.
- Always reference specific categoryName and paymentMethodName when available.

## TABLE FORMAT FOR TRANSACTIONS
When displaying transaction lists, use this format. Use spaces to align columns neatly.
Date       | Amount    | Category     | Description
---------- | --------- | ------------ | -----------
2024-01-15 | ₹1,200.00 | Food         | Lunch at restaurant
2024-01-16 | ₹500.00   | Transport    | Uber ride

## CONVERSATION HISTORY CONTEXT
${chatHistory && chatHistory.length > 0 ? 
`Previous conversation context:
${chatHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Use this context to provide relevant follow-up responses and maintain conversation flow.` : 
'This is the start of our conversation.'}

## AVAILABLE TRANSACTION DATA
The following transaction data is available for analysis:
\`\`\`json
${JSON.stringify(transactions, null, 2)}
\`\`\`
${transactions.length >= 250 ? `\n...(Note: Displaying up to 250 transactions. The actual data for the queried period might be larger if not fully shown here)` : ''}

## RESPONSE GUIDELINES
- If the user asks for comprehensive yearly summaries or trends, suggest they visit the 'Yearly Overview' page.
- If data is insufficient for a specific query, clearly state the limitations.
- Always specify the time period your analysis covers.
- Provide actionable insights when possible.
- If asked about periods not covered in the data, clearly state this limitation.

## EXAMPLES OF GOOD RESPONSES
- "Based on your transactions for January 2024, your total food expenses were ₹8,500.00 across 15 transactions."
- "Your highest spending category this month was Transport with ₹12,300.00 (45.2% of total expenses)."
- "Here are all your Food category transactions for this period:" [followed by formatted table]

Remember: Accuracy is paramount. Always verify calculations and provide precise, helpful financial insights based strictly on the provided transaction data.`;

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
        temperature: 0.1, // Lower temperature for more consistent and accurate responses
        maxOutputTokens: 800, // Increased token limit for detailed responses
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

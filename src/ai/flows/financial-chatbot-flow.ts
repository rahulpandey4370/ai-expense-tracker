
'use server';
/**
 * @fileOverview AI-powered chatbot for answering financial questions.
 *
 * - askFinancialBot - A function that handles financial queries using AI.
 * - FinancialChatbotInput - The input type for the askFinancialBot function (internal to flow).
 * - FinancialChatbotOutput - The return type for the askFinancialBot function.
 * - ChatMessage - Type for chat history messages.
 */

import {ai}from '@/ai/genkit';
import {z}from 'genkit';
import type { AppTransaction } from '@/lib/types'; // Using our app's Transaction type
import { retryableAIGeneration } from '@/ai/utils/retry-helper';

// Zod schema for transactions to be passed to the AI model
// Aligned with AppTransaction structure (relations will be denormalized for AI)
// Not Exported
const AITransactionSchema = z.object({
  id: z.string(),
  type: z.string(), // "income" | "expense"
  date: z.string().describe("Date in ISO format string"),
  amount: z.number(),
  description: z.string().nullish(),
  categoryName: z.string().nullish().describe("Name of the category if applicable"),
  paymentMethodName: z.string().nullish().describe("Name of the payment method if applicable"),
  expenseType: z.string().nullish().describe("Type of expense: 'need', 'want', 'investment_expense' if applicable"),
  source: z.string().nullish().describe("Source of income if applicable"),
});
type AITransaction = z.infer<typeof AITransactionSchema>;

// Not Exported
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// Not Exported
const FinancialChatbotInputSchema = z.object({
  query: z.string().describe("The user's current financial question or request."),
  transactions: z.array(AITransactionSchema).describe("An array of user's financial transactions relevant to the query context. This might be all transactions or a subset based on selected filters like month/year."),
  chatHistory: z.array(ChatMessageSchema).optional().describe("Previous conversation history, if any.")
});
export type FinancialChatbotInput = z.infer<typeof FinancialChatbotInputSchema>;

// Not Exported
const FinancialChatbotOutputSchema = z.object({
  response: z.string().describe("The AI's response to the user's query."),
});
export type FinancialChatbotOutput = z.infer<typeof FinancialChatbotOutputSchema>;


// Exported wrapper function
export async function askFinancialBot(input: {
  query: string;
  transactions: AppTransaction[]; // Expecting our app's AppTransaction type which includes relations
  chatHistory?: ChatMessage[];
}): Promise<FinancialChatbotOutput> {
  // Convert AppTransaction[] to AITransaction[] (flattening relations for AI)
  const aiTransactions: AITransaction[] = input.transactions.map(t => ({
    id: t.id,
    type: t.type,
    date: t.date instanceof Date ? t.date.toISOString() : new Date(t.date).toISOString(),
    amount: t.amount,
    description: t.description,
    categoryName: t.category?.name, // Access nested category name
    paymentMethodName: t.paymentMethod?.name, // Access nested payment method name
    expenseType: t.expenseType,
    source: t.source,
  }));
  return financialChatbotFlow({ query: input.query, transactions: aiTransactions, chatHistory: input.chatHistory });
}


const financialChatbotFlow = ai.defineFlow(
  {
    name: 'financialChatbotFlow',
    inputSchema: FinancialChatbotInputSchema,
    outputSchema: FinancialChatbotOutputSchema,
  },
  async ({ query, transactions, chatHistory }) => {
    let systemPrompt = `You are an AI Financial Assistant, an expert in analyzing personal finance data in Indian Rupees (INR).
The user has provided their transaction data. Your task is to answer the user's questions based on this data and any provided conversation history.
Be concise and helpful. If the data doesn't support an answer, clearly state that. Refer to amounts in INR (e.g., ₹1000).
When mentioning categories or payment methods, use the names provided (categoryName, paymentMethodName).

Transaction Data (potentially filtered by user's current view, e.g., for a specific month):
\`\`\`json
${JSON.stringify(transactions.slice(0, 100), null, 2)}
\`\`\`
${transactions.length > 100 ? `\n...(and ${transactions.length - 100} more transactions not shown to save space)` : ''}
`; // Truncate transactions if too long for the prompt

    const messages: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
    messages.push({ role: 'system', content: systemPrompt });

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-5).forEach(msg => { // Take last 5 messages from history
        messages.push({ role: msg.role, content: msg.content });
      });
    }
    messages.push({ role: 'user', content: query });

    const llmResponse = await retryableAIGeneration(() => ai.generate({
      prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:', // Construct prompt string
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
       // Explicitly pass the tools if any are defined and relevant for this flow.
       // tools: [/* your tools here if needed */]
    }));

    const responseText = llmResponse.text;
    if (!responseText) {
      console.error("AI model returned no text for financial chatbot query:", query);
      return { response: "I'm sorry, I encountered an issue generating a response. Please try again." };
    }
    return { response: responseText };
  }
);

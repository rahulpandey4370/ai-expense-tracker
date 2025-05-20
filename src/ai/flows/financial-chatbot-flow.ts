
'use server';
/**
 * @fileOverview AI-powered chatbot for answering financial questions.
 *
 * - askFinancialBot - A function that handles financial queries using AI.
 * - FinancialChatbotInput - The input type for the askFinancialBot function (internal to flow).
 * - FinancialChatbotOutput - The return type for the askFinancialBot function.
 * - ChatMessage - Type for chat history messages.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { Transaction as AppTransaction } from '@/lib/types';

// Zod schema for transactions to be passed to the AI model
const AITransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['income', 'expense']),
  date: z.string().describe("Date in ISO format string"),
  amount: z.number(),
  description: z.string(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  expenseType: z.enum(['need', 'want', 'investment_expense']).optional(),
  source: z.string().optional(),
});
type AITransaction = z.infer<typeof AITransactionSchema>;

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const FinancialChatbotInputSchema = z.object({
  query: z.string().describe("The user's current financial question or request."),
  transactions: z.array(AITransactionSchema).describe("An array of user's financial transactions relevant to the query context. This might be all transactions or a subset based on selected filters like month/year."),
  chatHistory: z.array(ChatMessageSchema).optional().describe("Previous conversation history, if any.")
});
export type FinancialChatbotInput = z.infer<typeof FinancialChatbotInputSchema>;

const FinancialChatbotOutputSchema = z.object({
  response: z.string().describe("The AI's response to the user's query."),
});
export type FinancialChatbotOutput = z.infer<typeof FinancialChatbotOutputSchema>;


// Exported wrapper function
export async function askFinancialBot(input: {
  query: string;
  transactions: AppTransaction[]; 
  chatHistory?: ChatMessage[];
}): Promise<FinancialChatbotOutput> {
  // Convert AppTransaction[] to AITransaction[] (Date to ISO string)
  const aiTransactions: AITransaction[] = input.transactions.map(t => ({
    ...t,
    // Ensure date is converted to ISO string for the AI
    date: t.date instanceof Date ? t.date.toISOString() : new Date(t.date).toISOString(),
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
    let prompt = `You are an AI Financial Assistant, an expert in analyzing personal finance data in Indian Rupees (INR).
The user has provided their transaction data. Your task is to answer the user's questions based on this data and any provided conversation history.
Be concise and helpful. If the data doesn't support an answer, clearly state that. Refer to amounts in INR (e.g., ₹1000).

Transaction Data (potentially filtered by user's current view, e.g., for a specific month):
\`\`\`json
${JSON.stringify(transactions, null, 2)}
\`\`\`
`;

    if (chatHistory && chatHistory.length > 0) {
      prompt += "\n\nConversation History:\n";
      chatHistory.forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}\n`;
      });
    }

    prompt += `\nUser's current question: ${query}\nAI Response:`;

    const llmResponse = await ai.generate({
      prompt: prompt,
      model: 'googleai/gemini-2.0-flash',
      config: {
        temperature: 0.4, 
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    });

    const responseText = llmResponse.text;
    if (!responseText) {
      console.error("AI model returned no text for financial chatbot query:", query);
      return { response: "I'm sorry, I encountered an issue generating a response. Please try again." };
    }
    return { response: responseText };
  }
);

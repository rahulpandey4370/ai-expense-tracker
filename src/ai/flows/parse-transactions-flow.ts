'use server';
/**
 * @fileOverview AI flow for parsing natural language text into structured transaction data.
 *
 * - parseTransactionsFromText - A function that uses AI to extract transaction details from text.
 * - ParseTransactionTextOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { format, parse as parseDateFns } from 'date-fns';
import { ParsedAITransactionSchema, type ParsedAITransaction, type AIModel } from '@/lib/types'; // Import from lib/types
import { callStructuredLLM } from '@/lib/ai-client';
import { getDefaultModelForTask } from '@/lib/task-models';
import { canonicalizeDescription } from '@/lib/merchants';
import { PARSE_TRANSACTIONS_PROMPT } from './parse-transactions-prompt';

// Internal schema for AI flow input, not exported
const CategorySchemaForAIInternal = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['income', 'expense']),
});

// Internal schema for AI flow input, not exported
const PaymentMethodSchemaForAIInternal = z.object({
  id: z.string(),
  name: z.string(),
});

// Internal schema for AI flow input, not exported
const SplitUserSchemaForAIInternal = z.object({
  id: z.string(),
  name: z.string(),
});

// Internal schema for AI flow input, not exported
const ParseTransactionTextInputSchemaInternal = z.object({
  naturalLanguageText: z.string().describe("The block of text containing one or more transaction descriptions."),
  expenseCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available expense categories (name, id) to help with mapping."),
  incomeCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available income categories (name, id) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAIInternal).describe("A list of available payment methods (for expenses)."),
  splitUsers: z.array(SplitUserSchemaForAIInternal).default([]).describe("People the user has split expenses with before — match names mentioned in the text against this list."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates like 'yesterday' or 'last Tuesday'."),
  model: z.string().optional(),
});
// Type exported for the wrapper function
export type ParseTransactionTextInput = z.infer<typeof ParseTransactionTextInputSchemaInternal>;


// Internal schema for AI flow output, not exported. Relies on imported ParsedAITransactionSchema
const ParseTransactionTextOutputSchemaInternal = z.object({
  parsedTransactions: z.array(ParsedAITransactionSchema.omit({ model: true })).describe("An array of structured transactions parsed from the input text. Each item should represent one identified transaction."),
  summaryMessage: z.string().optional().describe("A brief overall summary or any general notes about the parsing process (be concise)."),
});
export type ParseTransactionTextOutput = z.infer<typeof ParseTransactionTextOutputSchemaInternal> & { model?: AIModel };

export async function parseTransactionsFromText(
  input: {
    naturalLanguageText: string;
    categories: { id: string; name: string; type: 'income' | 'expense' }[]; // Combined categories from client
    paymentMethods: z.infer<typeof PaymentMethodSchemaForAIInternal>[];
    splitUsers?: z.infer<typeof SplitUserSchemaForAIInternal>[];
    model: AIModel;
  }
): Promise<ParseTransactionTextOutput> {
  const currentDate = format(new Date(), 'yyyy-MM-dd');
  const modelToUse = input.model || getDefaultModelForTask('transaction_parsing');

  const expenseCategoriesForAI = input.categories
    .filter(c => c.type === 'expense')
    .map(({ type, ...rest }) => rest);

  const incomeCategoriesForAI = input.categories
    .filter(c => c.type === 'income')
    .map(({ type, ...rest }) => rest);

  if (input.categories.length === 0) {
    console.warn("parseTransactionsFromText called with an empty category list. AI may struggle to map categories correctly. This might indicate an upstream data loading issue for categories.");
  }
  try {
    const result = await parseTransactionsFlow({
      naturalLanguageText: input.naturalLanguageText,
      expenseCategories: expenseCategoriesForAI,
      incomeCategories: incomeCategoriesForAI,
      paymentMethods: input.paymentMethods,
      splitUsers: input.splitUsers ?? [],
      currentDate,
      model: modelToUse,
    });

    return { ...result, model: modelToUse };
  } catch (error: any) {
    console.error("Error executing parseTransactionsFlow in wrapper:", error);
    const errorMessage = error.message || 'Unknown error';
    let userFriendlyMessage = `An unexpected error occurred during AI processing: ${errorMessage}. Please check server logs.`;
    if (errorMessage.includes("Handlebars error") || errorMessage.includes("unknown helper") || (errorMessage.includes("GoogleGenerativeAI Error") && errorMessage.includes("Invalid JSON payload")) || errorMessage.includes("The model is overloaded")) {
      userFriendlyMessage = `AI model failed to process the text due to an internal or configuration error: ${errorMessage}. Please check server logs or try again later.`;
    } else if (errorMessage.includes("503 Service Unavailable")) {
      userFriendlyMessage = `AI model is currently overloaded: ${errorMessage}. Please try again in a few moments.`;
    } else if (error.message && error.message.includes("ZodError")) {
      userFriendlyMessage = `AI model returned an unexpected data structure. Details: ${error.message}`;
    }
    return {
      parsedTransactions: [],
      summaryMessage: userFriendlyMessage,
      model: modelToUse,
    };
  }
}


const parseTransactionsFlow = ai.defineFlow(
  {
    name: 'parseTransactionsFlow',
    inputSchema: ParseTransactionTextInputSchemaInternal,
    outputSchema: ParseTransactionTextOutputSchemaInternal,
  },
  async (input) => {
    const model = input.model || getDefaultModelForTask('transaction_parsing');
    if (!input.naturalLanguageText.trim()) {
      return { parsedTransactions: [], summaryMessage: "Input text was empty." };
    }

    let output;
    try {
      output = await callStructuredLLM(model, PARSE_TRANSACTIONS_PROMPT, input, ParseTransactionTextOutputSchemaInternal, {
        temperature: 0.2,
        maxOutputTokens: 2500,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      });
    } catch (aiError: any) {
      console.error("AI generation failed in parseTransactionsFlow:", aiError);
      if (aiError.message && (aiError.message.includes("unknown helper") || aiError.message.includes("Handlebars error") || (aiError.message.includes("GoogleGenerativeAI Error") && aiError.message.includes("Invalid JSON payload")))) {
        throw new Error(`AI model failed to process the text due to a template or schema error: ${aiError.message}. Please check server logs for AI prompt issues.`);
      }
      if (aiError.message && (aiError.message.includes("The model is overloaded") || aiError.message.includes("503 Service Unavailable"))) {
        throw new Error(`AI model is currently overloaded: ${aiError.message}. Please try again in a few moments.`);
      }
      throw new Error(`AI model failed to process the text: ${aiError.message || 'Unknown AI error'}`);
    }

    if (!output || !Array.isArray(output.parsedTransactions)) {
      console.error("AI model returned no or invalid output structure for transaction parsing. Output:", output);
      // Construct a Zod-like error message for consistency in the UI handler
      throw new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'array',
          received: output?.parsedTransactions === undefined ? 'undefined' : 'unknown',
          path: ['parsedTransactions'],
          message: 'Required',
        },
      ]);
    }

    const seen = new Set<string>();
    const validatedTransactions = output.parsedTransactions.map(tx => {
      let finalDate = tx.date;
      try {
        if (tx.date) {
          const parsedD = parseDateFns(tx.date, 'yyyy-MM-dd', new Date());
          if (isNaN(parsedD.getTime())) {
            finalDate = format(new Date(), 'yyyy-MM-dd');
          } else {
            finalDate = tx.date;
          }
        } else {
          finalDate = format(new Date(), 'yyyy-MM-dd');
        }
      } catch (e) {
        finalDate = format(new Date(), 'yyyy-MM-dd');
      }
      return {
        ...tx,
        description: tx.description && canonicalizeDescription(tx.description),
        date: finalDate,
        amount: tx.amount && tx.amount > 0 ? tx.amount : 0,
      };
    }).filter(tx => {
      if (!tx.amount || tx.amount <= 0 || !tx.description) {
        return false;
      }
      // Create a unique key for each transaction to filter out exact duplicates
      const uniqueKey = `${tx.date}-${tx.description}-${tx.amount}-${tx.type}`;
      if (seen.has(uniqueKey)) {
        return false;
      }
      seen.add(uniqueKey);
      return true;
    });

    return {
      parsedTransactions: validatedTransactions,
      summaryMessage: output.summaryMessage || (validatedTransactions.length > 0 ? "Processing complete." : "AI could not identify any valid transactions in the text.")
    };
  }
);


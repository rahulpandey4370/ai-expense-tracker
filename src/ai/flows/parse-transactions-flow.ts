
'use server';
/**
 * @fileOverview AI flow for parsing natural language text into structured transaction data.
 *
 * - parseTransactionsFromText - A function that uses AI to extract transaction details from text.
 * - ParseTransactionTextOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { format, parse as parseDateFns } from 'date-fns';
import { ParsedAITransactionSchema, type ParsedAITransaction } from '@/lib/types'; // Import from lib/types

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
const ParseTransactionTextInputSchemaInternal = z.object({
  naturalLanguageText: z.string().describe("The block of text containing one or more transaction descriptions."),
  expenseCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available expense categories (name, id) to help with mapping."),
  incomeCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available income categories (name, id) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAIInternal).describe("A list of available payment methods (name, id) to help with mapping."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates like 'yesterday' or 'last Tuesday'."),
});
// Type exported for the wrapper function
export type ParseTransactionTextInput = z.infer<typeof ParseTransactionTextInputSchemaInternal>;


// Internal schema for AI flow output, not exported. Relies on imported ParsedAITransactionSchema
const ParseTransactionTextOutputSchemaInternal = z.object({
  parsedTransactions: z.array(ParsedAITransactionSchema).describe("An array of structured transactions parsed from the input text. Each item should represent one identified transaction."),
  summaryMessage: z.string().optional().describe("A brief overall summary or any general notes about the parsing process (be concise)."),
});
export type ParseTransactionTextOutput = z.infer<typeof ParseTransactionTextOutputSchemaInternal>;

export async function parseTransactionsFromText(
  input: {
    naturalLanguageText: string;
    categories: {id: string; name: string; type: 'income' | 'expense'}[]; // Combined categories from client
    paymentMethods: z.infer<typeof PaymentMethodSchemaForAIInternal>[];
  }
): Promise<ParseTransactionTextOutput> {
  const currentDate = format(new Date(), 'yyyy-MM-dd');

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
    return await parseTransactionsFlow({
        naturalLanguageText: input.naturalLanguageText,
        expenseCategories: expenseCategoriesForAI,
        incomeCategories: incomeCategoriesForAI,
        paymentMethods: input.paymentMethods,
        currentDate
    });
  } catch (error: any) {
    console.error("Error executing parseTransactionsFlow in wrapper:", error);
    const errorMessage = error.message || 'Unknown error';
    let userFriendlyMessage = `An unexpected error occurred during AI processing: ${errorMessage}. Please check server logs.`;
    if (errorMessage.includes("Handlebars error") || errorMessage.includes("unknown helper") || (errorMessage.includes("GoogleGenerativeAI Error") && errorMessage.includes("Invalid JSON payload")) || errorMessage.includes("The model is overloaded")) {
      userFriendlyMessage = `AI model failed to process the text due to an internal or configuration error: ${errorMessage}. Please check server logs or try again later.`;
    } else if (errorMessage.includes("503 Service Unavailable")) {
      userFriendlyMessage = `AI model is currently overloaded: ${errorMessage}. Please try again in a few moments.`;
    }
    return {
      parsedTransactions: [],
      summaryMessage: userFriendlyMessage
    };
  }
}

const parseTransactionsPrompt = ai.definePrompt({
  name: 'parseTransactionsPrompt',
  input: { schema: ParseTransactionTextInputSchemaInternal },
  output: { schema: ParseTransactionTextOutputSchemaInternal },
  // Model configuration for potentially faster responses
  config: {
    temperature: 0.3, 
    maxOutputTokens: 1500, 
    safetySettings: [ 
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are an expert financial assistant. Parse the following text for financial transactions in Indian Rupees (INR).
Current date is {{currentDate}}. Use it to resolve relative dates (e.g., "yesterday", "last Tuesday") to YYYY-MM-DD format.

**Handle imperfect input:** Be robust to common typographical errors (misspellings, grammatical errors). Focus on understanding the user's intent. Try to map misspelled categories or payment methods to the closest items from the provided lists.

**Split Expense Detection:** If the user mentions splitting a bill (e.g., "split with Rahul", "50-50 between me and Priya"), populate the 'splitDetails' object.
- 'participants': List all participant names, standardizing "I" or "me" to "me".
- 'splitRatio': Note the ratio if given (e.g., "equally", "50-50").

Available Expense Categories:
{{#each expenseCategories}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

Available Income Categories:
{{#each incomeCategories}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

Available Payment Methods (for expenses):
{{#each paymentMethods}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

For each transaction identified, provide:
- date: Transaction date (YYYY-MM-DD).
- description: Detailed description. For purchases (e.g., groceries), include the merchant name and list a few key items (e.g., "Zepto Groceries: Milk, Curd, Banana, Sauce, etc.").
- amount: Positive numeric amount (e.g., 50.75). Interpret ₹, INR, Rs. correctly. This should be the FULL amount of the bill, even if it was split.
- type: 'income' or 'expense'.
- categoryNameGuess: (Optional) Map to a provided category name. If unsure, use "Others" or leave blank.
- paymentMethodNameGuess: (Optional, for expenses) Map to a provided payment method name. If unsure, leave blank.
- expenseTypeNameGuess: (for expenses) Classify as 'need', 'want', or 'investment_expense'.
    Examples for 'need': Rent, essential Groceries, Medicines, commute to work, Loan Repayments, Utilities, Education fees.
    Examples for 'want': Ordering food, Eating out, non-essential travel/vacations, Shopping for gadgets/clothes, Movies, Entertainment subscriptions.
    Examples for 'investment_expense': Investing in Stocks, Mutual Funds (MF), Recurring Deposits (RD). Use this for any transaction involving words like 'invested', 'bought stocks', 'SIP', etc. YOU MUST USE the value 'investment_expense' for this type.
    YOU have to predict it to the best of your ability and provide an output dynamically.
    If 100% unsure or if it's an income transaction, leave blank.
- sourceGuess: (Optional, for income) Brief income source. If unsure or expense, leave blank.
- splitDetails: (Optional) If splitting is mentioned, provide participant names and ratio.
- confidenceScore: Your confidence (0.0-1.0) for this transaction. 1.0 means very confident.
- error: (Optional, concise) If a part is unparseable/missing info, note the error briefly.

Input Text:
\`\`\`
{{{naturalLanguageText}}}
\`\`\`

Return an array of structured transaction objects. If none, return an empty array.
Provide a very concise \`summaryMessage\` only if necessary (e.g., general parsing issues). Focus on speed and transaction accuracy.
`,
});

const parseTransactionsFlow = ai.defineFlow(
  {
    name: 'parseTransactionsFlow',
    inputSchema: ParseTransactionTextInputSchemaInternal,
    outputSchema: ParseTransactionTextOutputSchemaInternal,
  },
  async (input) => {
    if (!input.naturalLanguageText.trim()) {
        return { parsedTransactions: [], summaryMessage: "Input text was empty." };
    }

    let output;
    try {
      const result = await retryableAIGeneration(() => parseTransactionsPrompt(input), 3, 1500);
      output = result.output;
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

    if (!output) {
      console.error("AI model returned no output structure for transaction parsing.");
      throw new Error("AI model failed to return a valid output structure for transaction parsing.");
    }

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
        date: finalDate,
        amount: tx.amount && tx.amount > 0 ? tx.amount : 0, 
      };
    }).filter(tx => tx.amount > 0 && tx.description); 

    return {
        parsedTransactions: validatedTransactions,
        summaryMessage: output.summaryMessage || (validatedTransactions.length > 0 ? "Processing complete." : "AI could not identify any valid transactions in the text.")
    };
  }
);

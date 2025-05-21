
'use server';
/**
 * @fileOverview AI flow for parsing natural language text into structured transaction data.
 *
 * - parseTransactionsFromText - A function that uses AI to extract transaction details from text.
 * - ParsedAITransaction - The type for a single transaction parsed by AI. (Imported from lib/types)
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
});

// Internal schema for AI flow input, not exported
const PaymentMethodSchemaForAIInternal = z.object({
  id: z.string(),
  name: z.string(),
});

// Internal schema for AI flow input, not exported
const ParseTransactionTextInputSchemaInternal = z.object({
  naturalLanguageText: z.string().describe("The block of text containing one or more transaction descriptions."),
  expenseCategories: z.array(CategorySchemaForAIInternal).describe("A list of available expense categories (name, id) to help with mapping."),
  incomeCategories: z.array(CategorySchemaForAIInternal).describe("A list of available income categories (name, id) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAIInternal).describe("A list of available payment methods (name, id) to help with mapping."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates like 'yesterday' or 'last Tuesday'."),
});
// Type exported for the wrapper function
export type ParseTransactionTextInput = z.infer<typeof ParseTransactionTextInputSchemaInternal>;


// Internal schema for AI flow output, not exported. Relies on imported ParsedAITransactionSchema
const ParseTransactionTextOutputSchemaInternal = z.object({
  parsedTransactions: z.array(ParsedAITransactionSchema).describe("An array of structured transactions parsed from the input text. Each item should represent one identified transaction."),
  summaryMessage: z.string().optional().describe("A brief overall summary or any general notes about the parsing process."),
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
  } catch (flowError: any) {
    console.error("Error executing parseTransactionsFlow in wrapper:", flowError);
    const errorMessage = flowError.message || 'Unknown error';
    const userFriendlyMessage = errorMessage.includes("Handlebars error") || errorMessage.includes("unknown helper") || (errorMessage.includes("GoogleGenerativeAI Error") && errorMessage.includes("Invalid JSON payload"))
      ? `AI model failed to process the text due to a template or schema error: ${errorMessage}. Please check server logs for AI prompt issues.`
      : `An unexpected error occurred during AI processing: ${errorMessage}. Please check server logs.`;
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
  prompt: `You are an expert financial assistant. Your task is to parse the following natural language text and extract individual financial transactions.
The current date is {{currentDate}}. Use this to resolve relative dates like "yesterday", "last Tuesday", "next Friday", etc., into YYYY-MM-DD format.

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

For each transaction identified in the text, provide the following details:
- date: Transaction date in YYYY-MM-DD format.
- description: A detailed description of the transaction. If it's a purchase with multiple items (e.g., groceries from a specific store), include the merchant name and list a few key items (e.g., "Zepto Groceries: Milk, Curd, Banana"). For other transactions, use the merchant or a clear summary.
- amount: The numeric amount (always positive, e.g. 50.75).
- type: 'income' or 'expense'.
- categoryNameGuess: (Optional) If you can map it to one of the provided category names, state the name. If it's clearly a category not on the list but makes sense, state it. If unsure, use "Others" or leave blank.
- paymentMethodNameGuess: (Optional, for expenses only) If you can map it to one of the provided payment method names, state the name. If unsure or not applicable, leave blank.
- expenseTypeNameGuess: (Optional, for expenses only) Classify as 'need', 'want', or 'investment_expense'. If unsure or income, leave blank.
- sourceGuess: (Optional, for income only) Briefly describe the source of income. If unsure or expense, leave blank.
- confidenceScore: Your confidence (0.0 to 1.0) that you parsed this specific transaction correctly.
- error: (Optional) If a part of the text seems like a transaction but is unparseable or missing critical info (like amount or clear type), note the error for that part.

Input Text:
\`\`\`
{{{naturalLanguageText}}}
\`\`\`

Parse the text and return an array of structured transaction objects. If no transactions are found, return an empty array for parsedTransactions.
Provide amounts in Indian Rupees (INR or ₹). Ensure amounts are always positive numbers.
If a category or payment method in the text does not exactly match the provided lists but is very similar (e.g., "HDFC CC" vs "CC HDFC 7950"), try to map it to the closest one from the list for categoryNameGuess or paymentMethodNameGuess.
If text mentions "salary for July", and current month is August, assume it's last month's salary.
Interpret currency symbols like ₹, INR, Rs. correctly for the amount.
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
      // Check if the error message contains specific known issues.
      if (aiError.message && (aiError.message.includes("unknown helper") || aiError.message.includes("Handlebars error") || (aiError.message.includes("GoogleGenerativeAI Error") && aiError.message.includes("Invalid JSON payload")))) {
        throw new Error(`AI model failed to process the text due to a template or schema error: ${aiError.message}. Please check server logs for AI prompt issues.`);
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
            finalDate = format(new Date(), 'yyyy-MM-dd'); // Default to current date if AI date is invalid
          } else {
            finalDate = tx.date; // Keep valid YYYY-MM-DD from AI
          }
        } else {
           finalDate = format(new Date(), 'yyyy-MM-dd'); // Default to current date if AI provides no date
        }
      } catch (e) {
        finalDate = format(new Date(), 'yyyy-MM-dd'); // Default on any parsing error
      }
      return {
        ...tx,
        date: finalDate,
        amount: tx.amount && tx.amount > 0 ? tx.amount : 0, // Ensure amount is positive or zero
      };
    }).filter(tx => tx.amount > 0 && tx.description); // Further filter for transactions with valid amount and description

    return {
        parsedTransactions: validatedTransactions,
        summaryMessage: output.summaryMessage || (validatedTransactions.length > 0 ? "Processing complete." : "AI could not identify any valid transactions in the text.")
    };
  }
);

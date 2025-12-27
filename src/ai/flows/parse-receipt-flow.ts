
'use server';
/**
 * @fileOverview AI flow for parsing receipt images into structured transaction data.
 *
 * - parseReceiptImage - A function that uses AI to extract transaction details from a receipt image.
 * - ParseReceiptImageOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { format, parse as parseDateFns } from 'date-fns';
import { ParsedReceiptTransactionSchema, type ParsedReceiptTransaction, type AIModel } from '@/lib/types'; // Import from lib/types
<<<<<<< HEAD
<<<<<<< HEAD
import { callAzureOpenAI } from '@/lib/azure-openai';
=======
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
import { callAzureOpenAI } from '@/lib/azure-openai';
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)

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
const ParseReceiptImageInputSchemaInternal = z.object({
  receiptImageUri: z.string().describe(
    "A receipt image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
  ),
  categories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available expense categories (name, id) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAIInternal).describe("A list of available payment methods (name, id) to help with mapping."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates if any are ambiguously parsed from the receipt."),
<<<<<<< HEAD
  model: z.string().optional().describe("The AI model to use."),
=======
  model: z.nativeEnum(['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gpt-5.2-chat']).optional(),
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
});
// Type exported for the wrapper function
export type ParseReceiptImageInput = z.infer<typeof ParseReceiptImageInputSchemaInternal>;


export type ParseReceiptImageOutput = {
  parsedTransaction: ParsedReceiptTransaction | null;
  model?: AIModel;
};


export async function parseReceiptImage(
  input: {
    receiptImageUri: string;
    categories: {id: string; name: string; type: 'income' | 'expense'}[];
    paymentMethods: {id: string; name: string;}[];
<<<<<<< HEAD
    model?: AIModel;
=======
    model: AIModel;
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
  }
): Promise<ParseReceiptImageOutput> {
  const currentDate = format(new Date(), 'yyyy-MM-dd');
  const expenseCategoriesForAI = input.categories
    .filter(c => c.type === 'expense')
    .map(({ type, ...rest }) => rest);
  
<<<<<<< HEAD
<<<<<<< HEAD
  const modelToUse = input.model || 'gemini-3-flash-preview';
=======
  const modelToUse = input.model || 'gemini-1.5-flash-latest';
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
=======
  const modelToUse = input.model || 'gemini-3-flash-preview';
>>>>>>> 999104a (So it works for chat but not for insights or the AI transaction parsing)
  
  try {
    const result = await parseReceiptImageFlow({ 
        receiptImageUri: input.receiptImageUri,
        categories: expenseCategoriesForAI, // Only pass expense categories
        paymentMethods: input.paymentMethods,
<<<<<<< HEAD
<<<<<<< HEAD
        currentDate,
        model: input.model
    });
=======
        currentDate 
<<<<<<< HEAD
    }, { model: input.model });
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
    }, { model: modelToUse });
=======
        currentDate,
        model: modelToUse
    });
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)

    // Add model name to the successful response
    const finalParsedTransaction = result.parsedTransaction ? { ...result.parsedTransaction, model: modelToUse } : null;

    return { parsedTransaction: finalParsedTransaction, model: modelToUse };
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
  } catch (flowError: any) {
    console.error("Error executing parseReceiptImageFlow:", flowError);
    return {
      parsedTransaction: {
        error: `An unexpected error occurred during AI processing: ${flowError.message || 'Unknown error'}. Please check server logs.`,
      },
      model: modelToUse,
    };
  }
}

<<<<<<< HEAD
const parseReceiptImagePrompt = ai().definePrompt({
  name: 'parseReceiptImagePrompt',
<<<<<<< HEAD
  input: { schema: ParseReceiptImageInputSchemaInternal.omit({ model: true }) },
  output: { schema: z.object({ parsedTransaction: ParsedReceiptTransactionSchema.nullable() }) }, // Ensure output schema matches expected
=======
  input: { schema: ParseReceiptImageInputSchemaInternal },
  output: { schema: z.object({ parsedTransaction: ParsedReceiptTransactionSchema.omit({ model: true }).nullable() }) }, // Ensure output schema matches expected
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
  prompt: `You are an expert financial assistant specialized in parsing text from receipt images in Indian Rupees (INR).
=======
const receiptPromptTemplate = `You are an expert financial assistant specialized in parsing text from receipt images in Indian Rupees (INR).
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
Your task is to extract transaction details from the provided receipt image. Assume receipts are for expenses.
The current date is {{currentDate}}. Use this if the receipt date is ambiguous or relative.
You must respond in a valid JSON format.

Available Expense Categories:
{{#each categories}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

Available Payment Methods:
{{#each paymentMethods}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

From the receipt image, extract the following:
- date: Transaction date in YYYY-MM-DD format. If multiple dates are present (e.g., order date, payment date), prefer the payment date. If no date is clear, use the {{currentDate}}.
- description: Merchant name or a concise description of the purchase (e.g., "Big Bazaar Groceries", "Starbucks Coffee").
- amount: The total numeric amount paid (always positive, e.g., 50.75). Look for "Total", "Amount Due", "Paid", etc.
- categoryNameGuess: (Optional) Based on merchant or items, the best guess for an expense category name from the provided list. If unsure, use "Others".
- paymentMethodNameGuess: (Optional) If discernible from the receipt (e.g., "VISA ****1234", "Cash", "PayTM UPI"), the best guess for a payment method name from the provided list. Look for card brand names, last 4 digits, or payment app names.
- expenseTypeNameGuess: (Optional) Classify as 'need', 'want', or 'investment_expense'.
    Examples for 'need': Rent, essential Groceries (milk, bread, vegetables), Medicines, essential Auto & Transportation (commute to work), Loan Repayments, Utilities, Education fees, Maid salary, basic Gym membership for health.
    Examples for 'want': Ordering food online, Eating out at restaurants, Non-essential travel/vacations, Shopping for non-essentials (clothes beyond basic needs, gadgets), Movies, Entertainment subscriptions.
    Examples for 'investment': Investing in Stocks, Mutual Funds (MF), Recurring Deposits (RD), other financial assets.
    If unsure, default to 'need' or 'want' based on common sense for receipt items.
- confidenceScore: Your confidence (0.0 to 1.0) that you parsed this receipt correctly.
- error: (Optional) If the receipt is unreadable, blurry, or key information (like amount or merchant) is missing, note the error.

Receipt Image:
{{media url=receiptImageUri}}

Parse the receipt and return a single structured transaction object. If the image is not a receipt or completely unparseable, return null for parsedTransaction or include a clear error message.
Prioritize extracting the total amount paid. If items are listed, use the overall total, not individual item prices, unless it's the only amount visible.
`;

const parseReceiptImageFlow = ai().defineFlow(
  {
    name: 'parseReceiptImageFlow',
    inputSchema: ParseReceiptImageInputSchemaInternal,
    outputSchema: z.object({ parsedTransaction: ParsedReceiptTransactionSchema.omit({ model: true }).nullable() }),
  },
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  async (input) => {
    const model = input.model || 'gemini-3-flash-preview';
=======
  async (input, { model }) => {
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
  async (input, options) => {
    const model = options?.model;
>>>>>>> 40cdc81 (Still the same error)
=======
  async (input) => {
    const model = input.model || 'gemini-3-flash-preview';
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
    if (!input.receiptImageUri) {
        return { parsedTransaction: { error: "Receipt image URI was empty." } };
    }
    if (input.categories.length === 0) {
        console.warn("parseReceiptImageFlow: Category list was empty. AI may struggle to map categories.");
    }

    let outputFromAI;
    try {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      const llm = ai(input.model as AIModel);
      const configuredPrompt = llm.definePrompt(parseReceiptImagePrompt.getDefinition());
      const result = await retryableAIGeneration(() => configuredPrompt(input), 3, 2000);
=======
      const result = await retryableAIGeneration(() => parseReceiptImagePrompt(input, { model: model || googleAI.model('gemini-1.5-flash-latest') }), 3, 2000);
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
      const result = await retryableAIGeneration(() => parseReceiptImagePrompt(input, { model: googleAI.model(model) }), 3, 2000);
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
=======
      const result = await retryableAIGeneration(() => parseReceiptImagePrompt(input, { model: model ? googleAI.model(model as string) : undefined }), 3, 2000);
>>>>>>> 40cdc81 (Still the same error)
      outputFromAI = result.output;
=======
      if (model === 'gpt-5.2-chat') {
          const result = await callAzureOpenAI(receiptPromptTemplate, input, z.object({ parsedTransaction: ParsedReceiptTransactionSchema.omit({ model: true }).nullable() }));
          outputFromAI = result;
      } else {
          const prompt = ai.definePrompt({
            name: 'parseReceiptImagePrompt',
            input: { schema: ParseReceiptImageInputSchemaInternal.omit({ model: true}) },
            output: { schema: z.object({ parsedTransaction: ParsedReceiptTransactionSchema.omit({ model: true }).nullable() }) },
            prompt: receiptPromptTemplate,
          });
          const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }), 3, 2000);
          outputFromAI = result.output;
      }
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
    } catch (aiError: any) {
      console.error("AI generation failed in parseReceiptImageFlow:", aiError);
      return { parsedTransaction: { error: `AI model failed to process the receipt: ${aiError.message || 'Unknown AI error'}` } };
    }

    if (!outputFromAI || outputFromAI.parsedTransaction === undefined) { // Check for undefined explicitly
      console.error("AI model returned no or invalid output structure for receipt parsing. Output:", outputFromAI);
      return { parsedTransaction: { error: "AI model failed to return a valid output structure for receipt parsing." } };
    }
    
    // If parsedTransaction is null, it means AI decided it's unparseable, which is a valid output.
    if (outputFromAI.parsedTransaction === null) {
        return { parsedTransaction: null };
    }


    let finalDate = outputFromAI.parsedTransaction.date;
    if (outputFromAI.parsedTransaction.date) {
        try {
            const parsedD = parseDateFns(outputFromAI.parsedTransaction.date, 'yyyy-MM-dd', new Date());
            if (isNaN(parsedD.getTime())) {
                finalDate = format(new Date(), 'yyyy-MM-dd');
            } else {
                finalDate = outputFromAI.parsedTransaction.date;
            }
        } catch (e) {
            finalDate = format(new Date(), 'yyyy-MM-dd');
        }
    } else {
        finalDate = format(new Date(), 'yyyy-MM-dd');
    }

    return {
        parsedTransaction: {
            ...outputFromAI.parsedTransaction,
            date: finalDate,
            amount: outputFromAI.parsedTransaction.amount && outputFromAI.parsedTransaction.amount > 0 ? outputFromAI.parsedTransaction.amount : undefined,
        }
    };
  }
);

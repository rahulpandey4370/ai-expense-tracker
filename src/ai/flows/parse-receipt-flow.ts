
'use server';
/**
 * @fileOverview AI flow for parsing receipt images into structured transaction data.
 *
 * - parseReceiptImage - A function that uses AI to extract transaction details from a receipt image.
 * - ParsedReceiptTransaction - The type for the structure of a single transaction parsed by AI.
 * - ParseReceiptImageOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { format, parse as parseDateFns } from 'date-fns';
import { ParsedReceiptTransactionSchema } from '@/lib/types'; // Import from lib/types

const CategorySchemaForAI = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['income', 'expense']),
});
type CategoryForAI = z.infer<typeof CategorySchemaForAI>;

const PaymentMethodSchemaForAI = z.object({
  id: z.string(),
  name: z.string(),
});
type PaymentMethodForAI = z.infer<typeof PaymentMethodSchemaForAI>;

const ParseReceiptImageInputSchema = z.object({
  receiptImageUri: z.string().describe(
    "A receipt image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
  ),
  categories: z.array(CategorySchemaForAI).describe("A list of available expense categories (name, id, type) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAI).describe("A list of available payment methods (name, id) to help with mapping."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates if any are ambiguously parsed from the receipt."),
});
type ParseReceiptImageInput = z.infer<typeof ParseReceiptImageInputSchema>;

export type ParsedReceiptTransaction = z.infer<typeof ParsedReceiptTransactionSchema>;

const ParseReceiptImageOutputSchema = z.object({
  parsedTransaction: ParsedReceiptTransactionSchema.nullable().describe("The structured transaction parsed from the receipt image, or null if completely unparseable."),
});
export type ParseReceiptImageOutput = z.infer<typeof ParseReceiptImageOutputSchema>;


export async function parseReceiptImage(
  input: {
    receiptImageUri: string;
    categories: CategoryForAI[];
    paymentMethods: PaymentMethodForAI[];
  }
): Promise<ParseReceiptImageOutput> {
  const currentDate = format(new Date(), 'yyyy-MM-dd');
  try {
    return await parseReceiptImageFlow({ ...input, currentDate });
  } catch (flowError: any) {
    console.error("Error executing parseReceiptImageFlow:", flowError);
    return {
      parsedTransaction: {
        error: `An unexpected error occurred during AI processing: ${flowError.message || 'Unknown error'}. Please check server logs.`
      }
    };
  }
}

const parseReceiptImagePrompt = ai.definePrompt({
  name: 'parseReceiptImagePrompt',
  input: { schema: ParseReceiptImageInputSchema },
  output: { schema: ParseReceiptImageOutputSchema },
  prompt: `You are an expert financial assistant specialized in parsing text from receipt images.
Your task is to extract transaction details from the provided receipt image.
The current date is {{currentDate}}. Use this if the receipt date is ambiguous or relative. Assume receipts are for expenses.

Available Expense Categories:
{{#each categories}}
- {{this.name}} (ID: {{this.id}})
{{/each}}

Available Payment Methods:
{{#each paymentMethods}}- {{this.name}} (ID: {{this.id}}){{/each}}

From the receipt image, extract the following:
- date: Transaction date in YYYY-MM-DD format. If multiple dates are present (e.g., order date, payment date), prefer the payment date. If no date is clear, use the {{currentDate}}.
- description: Merchant name or a concise description of the purchase (e.g., "Big Bazaar Groceries", "Starbucks Coffee").
- amount: The total numeric amount paid (always positive). Look for "Total", "Amount Due", "Paid", etc.
- categoryNameGuess: (Optional) Based on merchant or items, the best guess for an expense category name from the provided list. If unsure, use "Others".
- paymentMethodNameGuess: (Optional) If discernible from the receipt (e.g., "VISA ****1234", "Cash"), the best guess for a payment method name from the provided list.
- expenseTypeNameGuess: (Optional) Classify as 'need', 'want', or 'investment_expense'. If unsure, default to 'need' or 'want' based on common sense for receipt items.
- confidenceScore: Your confidence (0.0 to 1.0) that you parsed this receipt correctly.
- error: (Optional) If the receipt is unreadable, blurry, or key information (like amount or merchant) is missing, note the error.

Receipt Image:
{{media url=receiptImageUri}}

Parse the receipt and return a single structured transaction object. If the image is not a receipt or completely unparseable, return null for parsedTransaction or include a clear error message.
Prioritize extracting the total amount paid. If items are listed, use the overall total, not individual item prices, unless it's the only amount visible.
`,
});

const parseReceiptImageFlow = ai.defineFlow(
  {
    name: 'parseReceiptImageFlow',
    inputSchema: ParseReceiptImageInputSchema,
    outputSchema: ParseReceiptImageOutputSchema,
  },
  async (input) => {
    if (!input.receiptImageUri) {
        return { parsedTransaction: { error: "Receipt image URI was empty." } };
    }
    if (input.categories.length === 0) {
        console.warn("parseReceiptImageFlow: Category list was empty. AI may struggle to map categories.");
    }

    let outputFromAI;
    try {
      const result = await retryableAIGeneration(() => parseReceiptImagePrompt(input), 3, 2000);
      outputFromAI = result.output;
    } catch (aiError: any) {
      console.error("AI generation failed in parseReceiptImageFlow:", aiError);
      return { parsedTransaction: { error: `AI model failed to process the receipt: ${aiError.message || 'Unknown AI error'}` } };
    }

    if (!outputFromAI || !outputFromAI.parsedTransaction) {
      console.error("AI model returned no or invalid output structure for receipt parsing.");
      return { parsedTransaction: { error: "AI model failed to return a valid output structure for receipt parsing." } };
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

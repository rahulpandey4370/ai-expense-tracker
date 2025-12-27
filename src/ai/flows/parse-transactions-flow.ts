
'use server';
/**
 * @fileOverview AI flow for parsing natural language text into structured transaction data.
 *
 * - parseTransactionsFromText - A function that uses AI to extract transaction details from text.
 * - ParseTransactionTextOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { format, parse as parseDateFns } from 'date-fns';
<<<<<<< HEAD
<<<<<<< HEAD
import { ParsedAITransactionSchema, type ParsedAITransaction, type AIModel, modelNames } from '@/lib/types'; // Import from lib/types
import { callAzureOpenAI } from '@/lib/azure-openai';
<<<<<<< HEAD
=======
import { ParsedAITransactionSchema, type ParsedAITransaction, type AIModel } from '@/lib/types'; // Import from lib/types
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
import { ParsedAITransactionSchema, type ParsedAITransaction, type AIModel, modelNames } from '@/lib/types'; // Import from lib/types
>>>>>>> 999104a (So it works for chat but not for insights or the AI transaction parsing)
=======
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
const ParseTransactionTextInputSchemaInternal = z.object({
  naturalLanguageText: z.string().describe("The block of text containing one or more transaction descriptions."),
  expenseCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available expense categories (name, id) to help with mapping."),
  incomeCategories: z.array(CategorySchemaForAIInternal.omit({ type: true })).describe("A list of available income categories (name, id) to help with mapping."),
  paymentMethods: z.array(PaymentMethodSchemaForAIInternal).describe("A list of available payment methods (for expenses)."),
  currentDate: z.string().describe("The current date in YYYY-MM-DD format, to help resolve relative dates like 'yesterday' or 'last Tuesday'."),
<<<<<<< HEAD
  model: z.string().optional().describe("The AI model to use."),
=======
  model: z.enum(modelNames).optional(),
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
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
    categories: {id: string; name: string; type: 'income' | 'expense'}[]; // Combined categories from client
    paymentMethods: z.infer<typeof PaymentMethodSchemaForAIInternal>[];
<<<<<<< HEAD
    model?: AIModel;
=======
    model: AIModel;
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
  }
): Promise<ParseTransactionTextOutput> {
  const currentDate = format(new Date(), 'yyyy-MM-dd');
<<<<<<< HEAD
<<<<<<< HEAD
  const modelToUse = input.model || 'gemini-3-flash-preview';
=======
  const modelToUse = input.model || 'gemini-1.5-flash-latest';
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
=======
  const modelToUse = input.model || 'gemini-3-flash-preview';
>>>>>>> 999104a (So it works for chat but not for insights or the AI transaction parsing)

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
        model: modelToUse,
    });
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)

    return { ...result, model: modelToUse };
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
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

<<<<<<< HEAD
const parseTransactionsPrompt = ai().definePrompt({
  name: 'parseTransactionsPrompt',
<<<<<<< HEAD
  input: { schema: ParseTransactionTextInputSchemaInternal.omit({ model: true }) }, // model is not part of the prompt itself
  output: { schema: ParseTransactionTextOutputSchemaInternal },
<<<<<<< HEAD
=======
=======
  input: { schema: ParseTransactionTextInputSchemaInternal },
<<<<<<< HEAD
  output: { schema: ParseTransactionTextOutputSchemaInternal.omit({ model: true }) },
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
=======
  output: { schema: ParseTransactionTextOutputSchemaInternal },
>>>>>>> 999104a (So it works for chat but not for insights or the AI transaction parsing)
  // Model configuration for potentially faster responses
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
  config: {
    temperature: 0.2, 
    maxOutputTokens: 1500, 
    safetySettings: [ 
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
  prompt: `You are an expert financial assistant. Parse the following text for financial transactions in Indian Rupees (INR).
=======
const parseTransactionsPromptTemplate = `You are an expert financial assistant. Parse the following text for financial transactions in Indian Rupees (INR).
<<<<<<< HEAD
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
=======
Your response must be in a valid JSON format.
>>>>>>> f6c9b38 (getting this error with gpt 5.2 in several flows so fix it)
Current date is {{currentDate}}. Use it to resolve relative dates (e.g., "yesterday", "last Tuesday") to YYYY-MM-DD format.

**Handle imperfect input:** Be robust to common typographical errors (misspellings, grammatical errors). Focus on understanding the user's intent. Try to map misspelled categories or payment methods to the closest items from the provided lists.

📝 TEXT FORMATTING RULE (IMPORTANT):
- Capitalize the first letter **ONLY** for human-readable text fields:
  - "description"
  - "summaryMessage"
  - "sourceGuess"
  - "error"
- ❌ DO NOT capitalize enum fields or identifiers

🔒 ENUM FIELDS (MUST BE LOWERCASE, EXACT MATCH):
- "type": "income" | "expense"
- "expenseTypeNameGuess": "need" | "want" | "investment" | "investment_expense"
- "categoryNameGuess": must exactly match provided category names
- "paymentMethodNameGuess": must exactly match provided payment method names


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
- description: Detailed description. For purchases (e.g., groceries), include the merchant name and list a few key items (e.g., "Zepto Groceries: Milk, Curd, Banana, Sauce, etc.") Do this Automatically even if the input is not formatted correctly.
- amount: The transaction amount.
- type: 'income' or 'expense'.
- categoryNameGuess: Your best guess for the category name from the provided lists.
- paymentMethodNameGuess: (Optional, for expenses) Your best guess for the payment method name.
- expenseTypeNameGuess: (Optional, for expenses) Classify as 'need', 'want', or 'investment_expense'.
    Examples for 'need': Rent, essential Groceries (milk, bread, vegetables), Medicines, essential Auto & Transportation (commute to work), Loan Repayments, Utilities, Education fees, Maid salary, basic Gym membership for health.
    Examples for 'want': Ordering food, Eating out, non-essential travel/vacations, Shopping for gadgets/clothes, Movies, Entertainment subscriptions.
    Examples for 'investment': Investing in Stocks, Mutual Funds (MF), Recurring Deposits (RD). Use this for any transaction involving words like 'invested', 'bought stocks', 'SIP', etc.
    If 100% unsure or if it's an income transaction, leave blank.
- sourceGuess: (Optional, for income) Brief income source. If unsure or expense, leave blank.
- confidenceScore: Your confidence (0.0-1.0) for this transaction. 1.0 means very confident.
- error: (Optional, concise) If a part is unparseable/missing info, note the error briefly.

Input Text:
\`\`\`
{{{naturalLanguageText}}}
\`\`\`

Return an array of structured transaction objects inside the \`parsedTransactions\` key. Each object MUST correspond to a distinct financial event mentioned in the text. Do not invent or duplicate transactions. If none, return an empty array.
Provide a very concise \`summaryMessage\` only if necessary (e.g., general parsing issues). Focus on speed and transaction accuracy.
`;

const parseTransactionsFlow = ai().defineFlow(
  {
    name: 'parseTransactionsFlow',
    inputSchema: ParseTransactionTextInputSchemaInternal,
    outputSchema: ParseTransactionTextOutputSchemaInternal,
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
    if (!input.naturalLanguageText.trim()) {
        return { parsedTransactions: [], summaryMessage: "Input text was empty." };
    }

    let output;
    try {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      const llm = ai(input.model as AIModel);
      const configuredPrompt = llm.definePrompt(parseTransactionsPrompt.getDefinition());
      const result = await retryableAIGeneration(() => configuredPrompt(input), 3, 1500);
=======
      const result = await retryableAIGeneration(() => parseTransactionsPrompt(input, { model: model || googleAI.model('gemini-1.5-flash-latest') }), 3, 1500);
>>>>>>> 97038b0 (What all AI flows is using the dynamic model thing as of now?)
=======
      const result = await retryableAIGeneration(() => parseTransactionsPrompt(input, { model: googleAI.model(model) }), 3, 1500);
>>>>>>> 27182ce (And for transparency throughout the application whenever an AI response)
=======
      const result = await retryableAIGeneration(() => parseTransactionsPrompt(input, { model: model ? googleAI.model(model as string) : undefined }), 3, 1500);
>>>>>>> 40cdc81 (Still the same error)
      output = result.output;
=======
      if (model === 'gpt-5.2-chat') {
        output = await callAzureOpenAI(parseTransactionsPromptTemplate, input, ParseTransactionTextOutputSchemaInternal);
      } else {
          const prompt = ai.definePrompt({
            name: 'parseTransactionsPrompt',
            input: { schema: ParseTransactionTextInputSchemaInternal.omit({ model: true }) },
            output: { schema: ParseTransactionTextOutputSchemaInternal },
            config: {
              temperature: 0.2, 
              maxOutputTokens: 1500, 
              safetySettings: [ 
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              ],
            },
            prompt: parseTransactionsPromptTemplate,
          });
          const result = await retryableAIGeneration(() => prompt(input, { model: googleAI.model(model) }));
          output = result.output;
      }
>>>>>>> f4150b2 (Perfect add this model to the list of model as well this is not a gemini)
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
          received: output?.parsedTransactions === undefined ? 'undefined' : 'invalid',
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

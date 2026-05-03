'use server';
/**
 * Parses a one-line natural-language description into a draft RecurringRule.
 * Returns the fields shaped for the UI form (no id / dates beyond dayOfMonth).
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { retryableAIGeneration } from '@/ai/utils/retry-helper';
import { callAzureOpenAI } from '@/lib/azure-openai';
import type { Category, PaymentMethod, AIModel } from '@/lib/types';

const ParsedRecurringRuleSchema = z.object({
  type: z.enum(['income', 'expense']).describe("Whether this is an income or expense rule."),
  amount: z.number().min(0).describe("Amount in INR. 0 if unknown."),
  description: z.string().describe("Short label for the rule, e.g. 'Rent', 'Wifi bill', 'Salary'."),
  categoryId: z.string().nullish().describe("Best-matching category ID from the supplied list, or null."),
  paymentMethodId: z.string().nullish().describe("Best-matching payment method ID from the supplied list (only for expenses), or null."),
  expenseType: z.enum(['need', 'want', 'investment']).nullish().describe("'need' for essentials (rent, utilities, EMI, groceries), 'want' for discretionary, 'investment' for SIP/MF/stocks. Null for income."),
  dayOfMonth: z.number().int().min(1).max(31).describe("Calendar day of the month the transaction recurs. Default to 1 if unspecified."),
  notes: z.string().nullish().describe("Anything you couldn't confidently extract or assumptions you made."),
});
export type ParsedRecurringRule = z.infer<typeof ParsedRecurringRuleSchema>;

export async function parseRecurringRuleFromText(input: {
  naturalLanguageText: string;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  model?: AIModel;
}): Promise<ParsedRecurringRule> {
  const modelToUse = input.model || 'gemini-3-flash-preview';
  const expenseCats = input.categories.filter(c => c.type === 'expense').map(c => ({ id: c.id, name: c.name }));
  const incomeCats = input.categories.filter(c => c.type === 'income').map(c => ({ id: c.id, name: c.name }));
  const pms = input.paymentMethods.map(p => ({ id: p.id, name: p.name }));

  const promptInput = {
    text: input.naturalLanguageText,
    expenseCategories: expenseCats,
    incomeCategories: incomeCats,
    paymentMethods: pms,
  };

  if (modelToUse === 'gpt-5.2-chat') {
    return await callAzureOpenAI(promptTemplate, promptInput, ParsedRecurringRuleSchema);
  }

  const prompt = ai.definePrompt({
    name: 'parseRecurringRulePrompt',
    output: { schema: ParsedRecurringRuleSchema },
    config: {
      temperature: 0.1,
      maxOutputTokens: 400,
    },
    prompt: promptTemplate,
  });
  const { output } = await retryableAIGeneration(() => prompt(promptInput as any, { model: googleAI.model(modelToUse) }));
  if (!output) throw new Error("Recurring rule parser returned no output.");
  return output;
}

const promptTemplate = `You are parsing a single recurring (monthly) money rule for an Indian user (INR). The user types a short natural-language description and you return ONE structured rule.

Output MUST be valid JSON conforming to the schema. Do not invent IDs not present in the supplied lists.

USER INPUT:
"{{text}}"

AVAILABLE EXPENSE CATEGORIES (id → name):
{{{json expenseCategories}}}

AVAILABLE INCOME CATEGORIES (id → name):
{{{json incomeCategories}}}

AVAILABLE PAYMENT METHODS (id → name):
{{{json paymentMethods}}}

RULES:
1. Decide type: "income" if it's salary, dividend, interest, cashback, payout. Otherwise "expense".
2. Extract amount from the text. Strip ₹/Rs/INR/commas. Use 0 if amount is missing.
3. Description: short, capitalised, 1–4 words. e.g. "Rent", "Wifi", "Spotify", "Salary".
4. Match category by name (case-insensitive, fuzzy). Only return an ID that EXISTS in the lists. If unsure, return null.
5. For expenses, match payment method by name (e.g. "HDFC credit card" -> any HDFC credit card item). If unsure, return null.
6. expenseType: "need" for rent, EMI, utilities (electricity, water, gas, wifi, mobile, broadband), insurance, groceries, fuel commute, school fees, maid/help, medical insurance. "want" for OTT/streaming/subscriptions for entertainment (Netflix, Spotify, Prime, gym beyond essentials), club memberships, magazines. "investment" for SIP, mutual fund, RD, stocks, gold/silver, crypto, equity, debt fund. Null for income.
7. dayOfMonth: integer 1-31. Look for "1st", "5th", "on the 10th", "every 28th", "by month-end" → 31. Default to 1 if not specified.
8. If something was guessed/assumed, put a short note in 'notes'. Otherwise leave it null.

Return only the JSON object.
`;

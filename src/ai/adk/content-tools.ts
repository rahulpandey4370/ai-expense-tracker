import { FunctionTool, type Context } from '@google/adk';
import { z } from 'zod';
import { callStructuredLLM } from '@/lib/ai-client';
import { getCategories, getPaymentMethods } from '@/lib/actions/transactions';
import { DESCRIPTION_RULES } from '@/ai/flows/parse-transactions-prompt';

/*
 * show_table: the agent hands the chat real rows and columns instead of
 * formatting a table in text, so tables always render properly.
 * read_attachment: reads a receipt photo or bank-statement PDF the user
 * attached (saved as an ADK artifact for this turn) into transactions.
 */

export const showTableTool = new FunctionTool({
  name: 'show_table',
  description:
    'Show the user a table. Use it for any list of 3 or more transactions or for comparisons (months, categories). ' +
    'Write amounts as text like "₹1,200" and dates like "4 Nov 2026". Then write only a short sentence about it; do not repeat the rows in text.',
  parameters: z.object({
    title: z.string().optional(),
    columns: z.array(z.string()).min(1).max(8),
    rows: z.array(z.array(z.string())).min(1).max(200),
  }) as any,
  execute: async () => ({ shown: true }),
});

export function attachmentName(i: number, mime: string) {
  return `attachment-${i + 1}.${mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] ?? 'bin'}`;
}

// Lenient on purpose: models sometimes drop a field or send numbers as text.
const Extracted = z.object({
  documentKind: z.string().catch('other'),
  transactions: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD'),
    type: z.enum(['income', 'expense']).catch('expense'),
    amount: z.coerce.number(),
    description: z.string(),
    categoryGuess: z.string().nullish(),
    paymentMethodGuess: z.string().nullish(),
    expenseTypeGuess: z.enum(['need', 'want', 'investment']).nullish().catch(null),
  })).catch([]),
  note: z.string().nullish(),
});

const PROMPT = `You read a personal-finance document (receipt photo, bank or card statement) for an Indian user. Currency INR.
Extract every transaction in it. For statements, debits are expenses and credits are income; skip opening/closing balances and totals.
Dates as YYYY-MM-DD (today is {{today}}; for a receipt with no year, use the current year).
Guess each category from this list only: {{categories}}.
Guess the payment method from this list only when the document makes it clear: {{paymentMethods}}.
Guess expenseTypeGuess for expenses: need, want or investment.
Write each description in this format: ${DESCRIPTION_RULES}
Return JSON: { "documentKind": "receipt" | "bank_statement" | "card_statement" | "other",
  "transactions": [{ "date", "type": "income" | "expense", "amount" (number), "description", "categoryGuess", "paymentMethodGuess", "expenseTypeGuess" }],
  "note": "anything the user should check" }`;

export function readAttachmentTool(modelKey: string) {
  return new FunctionTool({
    name: 'read_attachment',
    description:
      'Read a file the user attached to this message (receipt photo or bank/card statement PDF) and get its transactions. ' +
      'Then show them with show_table and offer to add them with add_transactions (fix category and payment method names first).',
    parameters: z.object({ filename: z.string().describe('e.g. attachment-1.pdf') }) as any,
    execute: async (input: any, ctx?: Context) => {
      const names = (await ctx?.listArtifacts()) ?? [];
      if (!names.includes(input.filename)) {
        return { error: names.length ? `No file "${input.filename}". Attached: ${names.join(', ')}` : 'No file is attached any more. Ask the user to attach it again.' };
      }
      const part = await ctx!.loadArtifact(input.filename);
      const data = part?.inlineData;
      if (!data?.data) return { error: 'The file could not be read.' };
      const [cats, pms] = await Promise.all([getCategories(), getPaymentMethods()]);
      try {
        return await callStructuredLLM(modelKey, PROMPT, {
          today: new Date().toISOString().slice(0, 10),
          categories: cats.map(c => `${c.name} (${c.type})`).join(', '),
          paymentMethods: pms.map(p => p.name).join(', '),
          receiptImageUri: `data:${data.mimeType};base64,${data.data}`,
        }, Extracted);
      } catch (e) {
        console.error('[adk] read_attachment failed:', e);
        return { error: 'Could not read that file. A clearer photo or a text-based PDF works best.' };
      }
    },
  });
}

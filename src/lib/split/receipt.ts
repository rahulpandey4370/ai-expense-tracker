// Receipt photos for split expenses: Luna reads line items; photos live in a private storage bucket.
import { z } from 'zod';
import { callStructuredLLM } from '@/lib/ai-client';
import { withAiFeature } from '@/lib/usage';
import { getSupabase } from '@/lib/supabase';
import { SPLIT_MODEL, assertAiBudget } from './voice';
import type { SplitItem } from './math';

export const RECEIPT_BUCKET = 'split-receipts';
const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export function decodeDataUri(uri: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(uri ?? '');
  if (!m || !MIMES.includes(m[1])) return null;
  const bytes = Buffer.from(m[2], 'base64');
  return bytes.length > 0 && bytes.length <= MAX_BYTES ? { mime: m[1], bytes } : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Lenient on purpose: JSON mode has no schema, so a missing/odd field falls back instead of failing.
const ReceiptSchema = z.object({
  merchant: z.string().catch(''),
  date: z.string().nullable().catch(null),
  total: z.coerce.number().nullable().catch(null),
  items: z.array(z.object({
    name: z.string().catch('Item'),
    amount: z.coerce.number().catch(0),
    memberIds: z.array(z.string()).catch([]),
  })).catch([]),
});
type RawReceipt = z.infer<typeof ReceiptSchema>;

export interface ReceiptDraft { description: string; date: string | null; amount: number | null; items: SplitItem[] }

/** Makes items add up to the total (extra "Tax & service" line, or scaled down for discounts); never trusts ids. */
export function cleanReceipt(raw: RawReceipt, memberIds: string[]): ReceiptDraft {
  const ok = new Set(memberIds);
  let items = raw.items
    .filter(i => i.amount > 0)
    .map(i => {
      const ids = [...new Set(i.memberIds.filter(id => ok.has(id)))];
      return { name: i.name.trim().slice(0, 80) || 'Item', amount: r2(i.amount), memberIds: ids.length ? ids : [...memberIds] };
    });
  const itemsTotal = r2(items.reduce((a, i) => a + i.amount, 0));
  const total = raw.total && raw.total > 0 ? r2(raw.total) : itemsTotal || null;
  if (total && items.length) {
    const diff = r2(total - itemsTotal);
    if (diff > 0) items.push({ name: 'Tax & service', amount: diff, memberIds: [...memberIds] });
    else if (diff < 0) {
      // Discount: scale each line down, then put leftover paise on the first line.
      const f = total / itemsTotal;
      items = items.map(i => ({ ...i, amount: Math.floor(i.amount * f * 100) / 100 }));
      items[0].amount = r2(items[0].amount + r2(total - items.reduce((a, i) => a + i.amount, 0)));
    }
  }
  return {
    description: raw.merchant.trim().slice(0, 120) || 'Receipt',
    date: raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    amount: total,
    items,
  };
}

const PROMPT = `Read this receipt photo for a group expense split. All amounts are Indian rupees (INR, ₹).
List every purchased line item with its line total. Skip subtotal/total/tax lines as items (tax and service charge are added separately).
total = the final amount paid. Today is {{{today}}}.
Group members (id: name): {{{members}}}
The person scanning is {{{speaker}}}. Their instruction about who had what (may be empty): """{{{text}}}"""
Fill memberIds per item only from that instruction; otherwise leave it empty.
Return JSON exactly in this shape:
{ "merchant": "short shop/restaurant name", "date": "YYYY-MM-DD" or null, "total": number or null,
  "items": [{ "name": "short item name", "amount": number (line total = qty × price), "memberIds": ["member id", ...] }] }`;

export async function scanReceiptDraft(dataUri: string, members: { id: string; name: string }[], speaker: string, text: string, today: string): Promise<ReceiptDraft> {
  await assertAiBudget();
  const raw = await withAiFeature('split_scan', () => callStructuredLLM(SPLIT_MODEL, PROMPT, {
    today, speaker, text: text.slice(0, 400),
    members: members.map(m => `${m.id}: ${m.name}`).join(', '),
    receiptImageUri: dataUri,
  }, ReceiptSchema, { feature: 'split_scan', temperature: 0.1, maxOutputTokens: 2000 }));
  return cleanReceipt(raw, members.map(m => m.id));
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await getSupabase().storage.createBucket(RECEIPT_BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: MIMES });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
  bucketReady = true;
}

export async function storeReceipt(groupId: string, expenseId: string, file: { mime: string; bytes: Buffer }): Promise<string> {
  await ensureBucket();
  const ext = file.mime === 'application/pdf' ? 'pdf' : file.mime.split('/')[1].replace('jpeg', 'jpg');
  const path = `${groupId}/${expenseId}-${Date.now()}.${ext}`;
  const { error } = await getSupabase().storage.from(RECEIPT_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedReceiptUrl(path: string): Promise<string | null> {
  const { data } = await getSupabase().storage.from(RECEIPT_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function removeReceipt(path: string) {
  await getSupabase().storage.from(RECEIPT_BUCKET).remove([path]).catch(() => {});
}

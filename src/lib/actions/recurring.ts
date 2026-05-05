'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { addTransaction } from './transactions';
import {
  RecurringRuleInputSchema,
  type RecurringRule,
  type RecurringRuleInput,
} from '@/lib/types';

const RECURRING_BLOB_PATH = 'internal/data/recurring-rules.json';

let _client: BlobContainerClient | undefined;
async function blobContainer(): Promise<BlobContainerClient> {
  if (_client) return _client;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const name = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!conn || !name) throw new Error("Azure storage env vars missing for recurring rules.");
  _client = BlobServiceClient.fromConnectionString(conn).getContainerClient(name);
  return _client;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readRules(): Promise<RecurringRule[]> {
  try {
    const c = await blobContainer();
    const blob = c.getBlobClient(RECURRING_BLOB_PATH);
    const dl = await blob.download(0);
    if (!dl.readableStreamBody) return [];
    const text = await streamToString(dl.readableStreamBody);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as RecurringRule[] : [];
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) return [];
    console.warn("readRules failed", error.message);
    return [];
  }
}

async function writeRules(rules: RecurringRule[]): Promise<void> {
  const c = await blobContainer();
  const block = c.getBlockBlobClient(RECURRING_BLOB_PATH);
  const body = JSON.stringify(rules, null, 2);
  await block.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

export async function getRecurringRules(): Promise<RecurringRule[]> {
  return readRules();
}

export async function addRecurringRule(data: RecurringRuleInput): Promise<RecurringRule> {
  const validated = RecurringRuleInputSchema.parse(data);
  const now = new Date().toISOString();
  const newRule: RecurringRule = {
    id: cuid(),
    ...validated,
    createdAt: now,
    updatedAt: now,
  };
  const all = await readRules();
  all.push(newRule);
  await writeRules(all);
  revalidatePath('/recurring');
  return newRule;
}

export async function updateRecurringRule(id: string, patch: Partial<RecurringRuleInput>): Promise<RecurringRule> {
  const all = await readRules();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`Recurring rule ${id} not found`);
  const merged = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = merged as RecurringRule;
  await writeRules(all);
  revalidatePath('/recurring');
  return all[idx];
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const all = await readRules();
  const next = all.filter(r => r.id !== id);
  if (next.length === all.length) throw new Error(`Recurring rule ${id} not found`);
  await writeRules(next);
  revalidatePath('/recurring');
}

// --- Materialization ---
function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function clampDayToMonth(year: number, monthIndex0: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, monthIndex0));
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function* iterateDueDates(rule: RecurringRule, today: Date): Generator<Date> {
  const start = new Date(rule.startDate + "T00:00:00");
  const end = rule.endDate ? new Date(rule.endDate + "T23:59:59") : null;
  const lastGen = rule.lastGeneratedDate ? new Date(rule.lastGeneratedDate + "T00:00:00") : null;

  // Start scanning from one month after the lastGeneratedDate, or from rule.startDate if never generated.
  let cursor: Date;
  if (lastGen) {
    cursor = new Date(lastGen.getFullYear(), lastGen.getMonth() + 1, 1);
  } else {
    cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  }

  // Walk forward month-by-month until we pass `today`.
  while (cursor <= today) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const day = clampDayToMonth(y, m, rule.dayOfMonth);
    const due = new Date(y, m, day);

    if (due >= start && (!end || due <= end) && due <= today) {
      yield due;
    }
    cursor = new Date(y, m + 1, 1);
  }
}

/**
 * Lazy materialization. Walk every active rule, insert a transaction for each
 * past-due month that hasn't yet been materialized, then update the rule's
 * lastGeneratedDate.
 *
 * Returns the number of transactions actually inserted.
 */
export async function materializeRecurringTransactions(): Promise<{ inserted: number; ruleErrors: number }> {
  const rules = await readRules();
  if (rules.length === 0) return { inserted: 0, ruleErrors: 0 };

  const today = new Date();
  let inserted = 0;
  let ruleErrors = 0;
  let mutated = false;

  for (const rule of rules) {
    if (!rule.isActive) continue;
    try {
      let lastInsertedYmd: string | undefined;
      for (const due of iterateDueDates(rule, today)) {
        await addTransaction({
          type: rule.type,
          date: due,
          amount: rule.amount,
          description: `🔁 ${rule.description}`,
          categoryId: rule.categoryId,
          paymentMethodId: rule.paymentMethodId,
          source: rule.source,
          expenseType: rule.expenseType,
          isSplit: false,
        });
        inserted += 1;
        lastInsertedYmd = ymd(due);
      }
      if (lastInsertedYmd) {
        rule.lastGeneratedDate = lastInsertedYmd;
        rule.updatedAt = new Date().toISOString();
        mutated = true;
      }
    } catch (err: any) {
      console.error(`materializeRecurringTransactions: rule ${rule.id} failed`, err?.message);
      ruleErrors += 1;
    }
  }

  if (mutated) await writeRules(rules);
  return { inserted, ruleErrors };
}

/**
 * Manually trigger a single rule for the current calendar month with today's
 * date. Useful when the actual expense happens before the rule's scheduled
 * dayOfMonth (e.g. rent due on the 7th got paid on the 5th). Marks the rule's
 * lastGeneratedDate so the lazy materializer skips this month going forward.
 */
export async function triggerRecurringRuleNow(ruleId: string): Promise<{ inserted: boolean; reason?: string }> {
  const all = await readRules();
  const idx = all.findIndex(r => r.id === ruleId);
  if (idx === -1) throw new Error(`Recurring rule ${ruleId} not found`);
  const rule = all[idx];

  if (!rule.isActive) {
    return { inserted: false, reason: "Rule is paused. Resume it first." };
  }

  const today = new Date();
  const ymdToday = ymd(today);

  const start = new Date(rule.startDate + "T00:00:00");
  if (today < start) {
    return { inserted: false, reason: `Rule starts on ${rule.startDate}.` };
  }
  if (rule.endDate) {
    const end = new Date(rule.endDate + "T23:59:59");
    if (today > end) return { inserted: false, reason: `Rule ended on ${rule.endDate}.` };
  }

  // Block double-insertion if this month is already materialized.
  if (rule.lastGeneratedDate) {
    const lastGen = new Date(rule.lastGeneratedDate + "T00:00:00");
    if (lastGen.getFullYear() === today.getFullYear() && lastGen.getMonth() === today.getMonth()) {
      return { inserted: false, reason: `Already generated this month on ${rule.lastGeneratedDate}.` };
    }
  }

  await addTransaction({
    type: rule.type,
    date: today,
    amount: rule.amount,
    description: `🔁 ${rule.description}`,
    categoryId: rule.categoryId,
    paymentMethodId: rule.paymentMethodId,
    source: rule.source,
    expenseType: rule.expenseType,
    isSplit: false,
  });

  rule.lastGeneratedDate = ymdToday;
  rule.updatedAt = new Date().toISOString();
  all[idx] = rule;
  await writeRules(all);
  revalidatePath('/recurring');

  return { inserted: true };
}

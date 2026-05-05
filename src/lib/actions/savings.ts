'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import {
  SavingsAllocationInputSchema,
  type SavingsAllocation,
  type SavingsAllocationInput,
  type AIModel,
} from '@/lib/types';
import { parseSavingsAllocationFromText } from '@/ai/flows/parse-savings-allocation-flow';
import { computeSavingsSmartKpis, type SavingsSmartKpisOutput } from '@/ai/flows/savings-smart-kpis-flow';

const SAVINGS_BLOB_PATH = 'internal/data/savings-allocations.json';

let _client: BlobContainerClient | undefined;
async function blobContainer(): Promise<BlobContainerClient> {
  if (_client) return _client;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const name = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!conn || !name) throw new Error("Azure storage env vars missing for savings allocations.");
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

async function readAll(): Promise<SavingsAllocation[]> {
  try {
    const c = await blobContainer();
    const blob = c.getBlobClient(SAVINGS_BLOB_PATH);
    const dl = await blob.download(0);
    if (!dl.readableStreamBody) return [];
    const text = await streamToString(dl.readableStreamBody);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as SavingsAllocation[] : [];
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) return [];
    console.warn("savings.readAll failed", error.message);
    return [];
  }
}

async function writeAll(items: SavingsAllocation[]): Promise<void> {
  const c = await blobContainer();
  const block = c.getBlockBlobClient(SAVINGS_BLOB_PATH);
  const body = JSON.stringify(items, null, 2);
  await block.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

export async function getSavingsAllocations(): Promise<SavingsAllocation[]> {
  return readAll();
}

export async function addSavingsAllocation(data: SavingsAllocationInput): Promise<SavingsAllocation> {
  const validated = SavingsAllocationInputSchema.parse(data);
  const now = new Date().toISOString();
  const item: SavingsAllocation = {
    id: cuid(),
    ...validated,
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  all.push(item);
  await writeAll(all);
  revalidatePath('/savings');
  return item;
}

export async function updateSavingsAllocation(id: string, patch: Partial<SavingsAllocationInput>): Promise<SavingsAllocation> {
  const all = await readAll();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`Savings allocation ${id} not found`);
  const merged = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  // Re-validate the merged input shape (excluding server fields).
  SavingsAllocationInputSchema.parse({
    name: merged.name,
    location: merged.location,
    category: merged.category,
    amount: merged.amount,
    asOfDate: merged.asOfDate,
    notes: merged.notes,
  });
  all[idx] = merged as SavingsAllocation;
  await writeAll(all);
  revalidatePath('/savings');
  return all[idx];
}

export async function deleteSavingsAllocation(id: string): Promise<void> {
  const all = await readAll();
  const next = all.filter(r => r.id !== id);
  if (next.length === all.length) throw new Error(`Savings allocation ${id} not found`);
  await writeAll(next);
  revalidatePath('/savings');
}

export type AISavingsActionResult =
  | { ok: true; mode: 'add'; record: SavingsAllocation }
  | { ok: true; mode: 'update'; record: SavingsAllocation; previous: SavingsAllocation }
  | { ok: false; reason: string };

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Run the AI parser over a one-line instruction and apply the resulting
 * add/update against the persisted ledger. Returns either the new/updated
 * record or a structured failure.
 */
export async function parseAndApplySavingsAllocation(
  naturalLanguageText: string,
  model?: AIModel,
): Promise<AISavingsActionResult> {
  const text = naturalLanguageText.trim();
  if (!text) return { ok: false, reason: "Empty input." };

  const existing = await readAll();
  const parsed = await parseSavingsAllocationFromText({
    naturalLanguageText: text,
    existing: existing.map(({ id, name, location, category, amount }) => ({ id, name, location, category, amount })),
    todayYmd: todayYmd(),
    model,
  });

  if (parsed.intent === 'update') {
    if (parsed.unmatched || !parsed.existingId) {
      return { ok: false, reason: parsed.reasoning || "Couldn't match an existing record. Try mentioning the bank or label." };
    }
    const idx = existing.findIndex(e => e.id === parsed.existingId);
    if (idx === -1) return { ok: false, reason: "Matched record vanished. Reload and retry." };
    const prev = existing[idx];
    const patch: Partial<SavingsAllocationInput> = {};
    if (parsed.record.name) patch.name = parsed.record.name;
    if (parsed.record.location) patch.location = parsed.record.location;
    if (parsed.record.category) patch.category = parsed.record.category;
    if (parsed.record.amount != null && parsed.record.amount > 0) patch.amount = parsed.record.amount;
    if (parsed.record.asOfDate) patch.asOfDate = parsed.record.asOfDate;
    if (parsed.record.notes !== null && parsed.record.notes !== undefined) {
      patch.notes = parsed.record.notes.length > 0 ? parsed.record.notes : undefined;
    }
    if (Object.keys(patch).length === 0) {
      return { ok: false, reason: "Nothing to change — couldn't extract a new value." };
    }
    const updated = await updateSavingsAllocation(prev.id, patch);
    return { ok: true, mode: 'update', record: updated, previous: prev };
  }

  // intent === 'add'
  const r = parsed.record;
  if (!r.name || !r.location || !r.category || r.amount == null || r.amount <= 0) {
    return { ok: false, reason: parsed.reasoning || "I need at least a name, location, type, and a positive amount to create an entry." };
  }
  const created = await addSavingsAllocation({
    name: r.name,
    location: r.location,
    category: r.category,
    amount: r.amount,
    asOfDate: r.asOfDate || todayYmd(),
    notes: r.notes || undefined,
  });
  return { ok: true, mode: 'add', record: created };
}

/**
 * Wraps the smart-KPIs AI flow. Server-side so we don't have to ship the
 * Genkit/Azure call into the browser bundle.
 */
export async function getSavingsSmartKpis(year: number, model?: AIModel): Promise<SavingsSmartKpisOutput> {
  const allocations = await readAll();
  return computeSavingsSmartKpis({ allocations, year, model });
}

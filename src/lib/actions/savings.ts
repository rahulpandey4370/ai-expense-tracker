'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import {
  SavingsAllocationInputSchema,
  type SavingsAllocation,
  type SavingsAllocationCategory,
  type SavingsAllocationInput,
  type AIModel,
} from '@/lib/types';
import { parseSavingsAllocationFromText, type SavingsAiMode, type ParsedSavingsAction } from '@/ai/flows/parse-savings-allocation-flow';

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
  | { ok: true; mode: 'split'; source: SavingsAllocation; previousSource: SavingsAllocation; record: SavingsAllocation; splitAmount: number }
  | { ok: false; reason: string };

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseAmountToken(raw: string): number | null {
  const cleaned = raw.toLowerCase().replace(/[,₹\s]/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|l|lac|lakh|lakhs|cr|crore|crores)?$/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const suffix = match[2];
  if (suffix === 'k') return base * 1000;
  if (suffix === 'l' || suffix === 'lac' || suffix === 'lakh' || suffix === 'lakhs') return base * 100000;
  if (suffix === 'cr' || suffix === 'crore' || suffix === 'crores') return base * 10000000;
  return base;
}

function inferSavingsCategory(text: string): SavingsAllocationCategory {
  const normalized = normalizeText(text);
  if (/\bfd\b|fixed deposit|term deposit/.test(normalized)) return 'fd';
  if (/\brd\b|recurring deposit/.test(normalized)) return 'rd';
  if (/liquid|overnight fund|money market/.test(normalized)) return 'liquid_fund';
  if (/cash|wallet/.test(normalized)) return 'cash';
  if (/saving|savings|bank|account|a c|ac\b/.test(normalized)) return 'savings_account';
  return 'other';
}

function findBestExistingMatch(sourceHint: string, existing: SavingsAllocation[]): SavingsAllocation | null {
  const normalizedHint = normalizeText(sourceHint.replace(/\b(entry|record|allocation|item|the|my)\b/gi, ' '));
  if (!normalizedHint) return null;

  const hintWords = normalizedHint.split(/\s+/).filter(Boolean);
  let best: { item: SavingsAllocation; score: number } | null = null;

  for (const item of existing) {
    const haystack = normalizeText(`${item.name} ${item.location}`);
    let score = haystack.includes(normalizedHint) || normalizedHint.includes(normalizeText(item.name)) ? 8 : 0;
    for (const word of hintWords) {
      if (word.length >= 3 && haystack.includes(word)) score += 2;
    }
    if (score > (best?.score ?? 0)) best = { item, score };
  }

  return best && best.score >= 2 ? best.item : null;
}

function parseHeuristicSplit(text: string, existing: SavingsAllocation[], mode: SavingsAiMode): ParsedSavingsAction | null {
  if (mode === 'add') return null;

  const compactText = text.replace(/\s+/g, ' ').trim();
  const sourceFirstMatch = compactText.match(
    /(?:edit|update|change)?\s*(?:the\s+)?(.+?)\s+(?:and\s+)?(?:make\s+\d+\s+(?:now\s+)?)?(?:split|separate|move|transfer|take\s+out)\s+(₹?\s*[\d,.]+(?:\s*(?:k|l|lac|lakh|lakhs|cr|crore|crores))?)\s+(?:to|into|in)\s+(.+)$/i,
  );
  const amountFirstMatch = compactText.match(
    /(?:split|separate|move|transfer|take\s+out)\s+(₹?\s*[\d,.]+(?:\s*(?:k|l|lac|lakh|lakhs|cr|crore|crores))?)\s+from\s+(?:the\s+)?(.+?)\s+(?:to|into|in)\s+(.+)$/i,
  );
  if (!sourceFirstMatch && !amountFirstMatch) return null;

  const sourceHint = sourceFirstMatch ? sourceFirstMatch[1] : amountFirstMatch![2];
  const amountToken = sourceFirstMatch ? sourceFirstMatch[2] : amountFirstMatch![1];
  const targetText = sourceFirstMatch ? sourceFirstMatch[3] : amountFirstMatch![3];
  const splitAmount = parseAmountToken(amountToken);
  if (!splitAmount) return null;

  const source = findBestExistingMatch(sourceHint, existing);
  if (!source) {
    return {
      intent: 'split',
      existingId: null,
      record: {},
      split: {
        amount: splitAmount,
        newRecord: {
          name: targetText.trim(),
          location: targetText.trim(),
          category: inferSavingsCategory(targetText),
          asOfDate: todayYmd(),
          notes: null,
        },
      },
      unmatched: true,
      reasoning: "Couldn't match the source record for the split.",
    };
  }

  const target = targetText.trim().replace(/[.!?]+$/, '');
  return {
    intent: 'split',
    existingId: source.id,
    record: {},
    split: {
      amount: splitAmount,
      newRecord: {
        name: target,
        location: target,
        category: inferSavingsCategory(target),
        asOfDate: todayYmd(),
        notes: null,
      },
    },
    unmatched: false,
    reasoning: `Split ${splitAmount} from ${source.name}.`,
  };
}

async function applyParsedSavingsAction(parsed: ParsedSavingsAction, existing: SavingsAllocation[]): Promise<AISavingsActionResult> {
  if (parsed.intent === 'split') {
    if (parsed.unmatched || !parsed.existingId) {
      return { ok: false, reason: parsed.reasoning || "Couldn't match the source record. Try mentioning the exact savings entry name." };
    }
    const idx = existing.findIndex(e => e.id === parsed.existingId);
    if (idx === -1) return { ok: false, reason: "Matched record vanished. Reload and retry." };

    const splitAmount = parsed.split?.amount;
    const newRecord = parsed.split?.newRecord;
    if (splitAmount == null || splitAmount <= 0 || !newRecord) {
      return { ok: false, reason: "I need a positive split amount and a destination for the separated entry." };
    }

    const previousSource = existing[idx];
    if (splitAmount >= previousSource.amount) {
      return { ok: false, reason: `The split amount must be less than ${previousSource.name}'s current balance (${formatINR(previousSource.amount)}).` };
    }

    const name = newRecord.name?.trim();
    const location = newRecord.location?.trim() || name;
    const category = newRecord.category || inferSavingsCategory(`${name || ''} ${location || ''}`);
    if (!name || !location) {
      return { ok: false, reason: "I need a destination name, like 'Slice Fixed Deposit', for the separated entry." };
    }

    const now = new Date().toISOString();
    const source: SavingsAllocation = {
      ...previousSource,
      ...(parsed.record.name ? { name: parsed.record.name } : {}),
      ...(parsed.record.location ? { location: parsed.record.location } : {}),
      ...(parsed.record.category ? { category: parsed.record.category } : {}),
      ...(parsed.record.notes !== null && parsed.record.notes !== undefined ? { notes: parsed.record.notes || undefined } : {}),
      amount: previousSource.amount - splitAmount,
      asOfDate: parsed.record.asOfDate || newRecord.asOfDate || todayYmd(),
      updatedAt: now,
    };
    const record: SavingsAllocation = {
      id: cuid(),
      name,
      location,
      category,
      amount: splitAmount,
      asOfDate: newRecord.asOfDate || parsed.record.asOfDate || todayYmd(),
      notes: newRecord.notes || undefined,
      createdAt: now,
      updatedAt: now,
    };

    SavingsAllocationInputSchema.parse({
      name: source.name,
      location: source.location,
      category: source.category,
      amount: source.amount,
      asOfDate: source.asOfDate,
      notes: source.notes,
    });
    SavingsAllocationInputSchema.parse({
      name: record.name,
      location: record.location,
      category: record.category,
      amount: record.amount,
      asOfDate: record.asOfDate,
      notes: record.notes,
    });

    const next = [...existing];
    next[idx] = source;
    next.push(record);
    await writeAll(next);
    revalidatePath('/savings');
    return { ok: true, mode: 'split', source, previousSource, record, splitAmount };
  }

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

const formatINR = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Run the AI parser over a one-line instruction and apply the resulting
 * add/update/split against the persisted ledger. Returns either the affected
 * record or a structured failure.
 */
export async function parseAndApplySavingsAllocation(
  naturalLanguageText: string,
  model?: AIModel,
  mode: SavingsAiMode = 'auto',
): Promise<AISavingsActionResult> {
  const text = naturalLanguageText.trim();
  if (!text) return { ok: false, reason: "Empty input." };

  const existing = await readAll();

  try {
    const heuristicSplit = parseHeuristicSplit(text, existing, mode);
    if (heuristicSplit) return applyParsedSavingsAction(heuristicSplit, existing);

    const parsed = await parseSavingsAllocationFromText({
      naturalLanguageText: text,
      existing: existing.map(({ id, name, location, category, amount }) => ({ id, name, location, category, amount })),
      todayYmd: todayYmd(),
      mode,
      model,
    });
    return applyParsedSavingsAction(parsed, existing);
  } catch (err: any) {
    console.error("parseAndApplySavingsAllocation failed", err);
    return {
      ok: false,
      reason: err?.message || "I couldn't apply that savings instruction. Try Add mode for new entries or Edit mode for updates/splits.",
    };
  }
}

'use server';

import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import {
  SavingsAllocationInputSchema,
  type SavingsAllocation,
  type SavingsAllocationInput,
} from '@/lib/types';

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

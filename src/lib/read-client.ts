"use client";
// Calls a server read through /api/read (in parallel, unlike server actions). See src/lib/reads.ts.
import type { Reads } from '@/lib/reads';

const revive = (_k: string, v: any) =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '$d' in v ? (v.$d === null ? new Date(NaN) : new Date(v.$d)) : v;

export async function read<K extends keyof Reads>(name: K, ...args: Parameters<Reads[K]>): Promise<Awaited<ReturnType<Reads[K]>>> {
  const res = await fetch('/api/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args }) });
  const text = await res.text();
  if (!res.ok) throw new Error(JSON.parse(text)?.error ?? `Could not load ${name}`);
  return JSON.parse(text, revive);
}

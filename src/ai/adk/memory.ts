import { FunctionTool, type BaseMemoryService, type Session } from '@google/adk';
import cuid from 'cuid';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/*
 * Long-term memory, two kinds:
 * - Past chats: the saved conversations (at most 10, see session-store.ts) are
 *   searchable through ADK's built-in load_memory tool, via this memory service.
 * - Facts: short notes the assistant was asked to keep ("Tanshu is my flatmate"),
 *   always put in its instructions, and listed in the chat drawer to delete.
 */

import { listMemoryFacts, type MemoryFact } from '@/lib/chat-store';
export { listMemoryFacts, type MemoryFact };

export async function deleteMemoryFact(id: string): Promise<void> {
  await getSupabase().from('ai_memories').delete().eq('id', id);
}

/** Searches the words of past chats. Small on purpose: there are at most 10 chats. */
export class PastChatsMemoryService implements BaseMemoryService {
  async addSessionToMemory(_session: Session): Promise<void> {
    // Every chat is already saved as it happens; nothing to copy.
  }

  async searchMemory({ query }: { appName: string; userId: string; query: string }) {
    const words = query.toLowerCase().split(/[^\p{L}\p{N}₹]+/u).filter(w => w.length >= 3);
    if (!words.length) return { memories: [] };
    const db = getSupabase();
    const [{ data: sessions }, { data: events }] = await Promise.all([
      db.from('chat_sessions').select('id, title'),
      db.from('chat_events').select('session_id, ts, data').order('ts', { ascending: true }),
    ]);
    const titles = new Map((sessions ?? []).map(s => [s.id, s.title as string]));
    const hits = (events ?? []).flatMap(e => {
      const author = e.data?.author as string | undefined;
      const text = ((e.data?.content?.parts ?? []) as { text?: string }[]).map(p => p.text ?? '').join(' ').trim();
      if (!text || e.data?.isCompacted) return [];
      const lower = text.toLowerCase();
      const score = words.filter(w => lower.includes(w)).length;
      return score ? [{ score, ts: e.ts as number, session: titles.get(e.session_id) ?? 'Chat', author, text }] : [];
    });
    hits.sort((a, b) => b.score - a.score || b.ts - a.ts);
    return {
      memories: hits.slice(0, 8).map(h => ({
        author: h.author === 'user' ? 'user' : 'assistant',
        timestamp: new Date(h.ts * (h.ts < 1e12 ? 1000 : 1)).toISOString(),
        content: { role: h.author === 'user' ? 'user' : 'model', parts: [{ text: `[Chat "${h.session}"] ${h.text.slice(0, 600)}` }] },
      })),
    };
  }
}

/** Saves a fact, refusing anything that looks like a card or account number. */
export async function saveMemoryFact(raw: string): Promise<{ saved: true; fact: string } | { saved: false; reason: string }> {
  const fact = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (fact.length < 3) return { saved: false, reason: 'That is too short to remember.' };
  if (/\b\d{9,}\b/.test(fact)) return { saved: false, reason: 'Looks like an account or card number; not stored.' };
  const { error } = await getSupabase().from('ai_memories').insert({ id: cuid(), fact });
  return error ? { saved: false, reason: error.message } : { saved: true, fact };
}

export const rememberFactTool = new FunctionTool({
  name: 'remember_fact',
  description:
    'Save a short, lasting fact about the user for future chats, e.g. "Tanshu is my flatmate", "Salary arrives on the 1st", ' +
    '"Zomato orders are always a Want". Use when the user asks you to remember something, or states a lasting preference. ' +
    'Never store passwords, card or account numbers.',
  parameters: z.object({ fact: z.string().min(3).max(200) }) as any,
  execute: async (input: any) => saveMemoryFact(String(input.fact)),
});

export const forgetFactTool = new FunctionTool({
  name: 'forget_fact',
  description: 'Delete a saved fact by its id (ids are listed under SAVED FACTS in your instructions).',
  parameters: z.object({ id: z.string() }) as any,
  execute: async (input: any) => { await deleteMemoryFact(String(input.id)); return { deleted: true }; },
});

export function factsInstruction(facts: MemoryFact[]): string {
  if (!facts.length) return '';
  return `## SAVED FACTS (things the user asked you to remember; use them, they may be out of date)\n${facts.map(f => `- [${f.id}] ${f.fact.replace(/[{}]/g, '')}`).join('\n')}`;
}

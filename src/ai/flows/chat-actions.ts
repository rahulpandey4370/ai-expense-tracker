'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { addTransaction } from '@/lib/actions/transactions';
import type { ChatSummary, ChatItem } from '@/lib/chat-types';
import type { TransactionInput } from '@/lib/types';
import { listChats, loadChat, sessionService } from '@/ai/adk/chat';
import { deleteMemoryFact, listMemoryFacts, saveMemoryFact, type MemoryFact } from '@/ai/adk/memory';
import { APP_NAME, USER_ID } from '@/ai/adk/session-store';

/** Chat history drawer, conversations and memory, for the chat UI. Sending and Confirm go through /api/chat (streamed). */

export async function getChatList(): Promise<ChatSummary[]> {
  return listChats();
}

export async function getChat(id: string): Promise<{ id: string; title: string; items: ChatItem[] } | null> {
  return loadChat(id);
}

export async function renameChat(id: string, title: string): Promise<void> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) throw new Error('Give the chat a name.');
  await getSupabase().from('chat_sessions').update({ title: clean }).eq('id', id);
}

/** /clear: wipes a chat's messages and its saved state, keeping the chat itself. Saved facts stay. */
export async function clearChat(id: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('chat_events').delete().eq('session_id', id);
  if (error) throw new Error(`Could not clear the chat: ${error.message}`);
  await db.from('chat_sessions').update({ title: 'New chat', state: {}, updated_at: new Date().toISOString() }).eq('id', id);
}

/** /remember: saves a fact straight away, without asking the AI. */
export async function rememberFact(fact: string): Promise<{ saved: boolean; fact?: string; reason?: string }> {
  return saveMemoryFact(fact);
}

export async function deleteChat(id: string): Promise<void> {
  await sessionService.deleteSession({ appName: APP_NAME, userId: USER_ID, sessionId: id });
}

export async function getMemoryFacts(): Promise<MemoryFact[]> {
  return listMemoryFacts();
}

export async function deleteMemory(id: string): Promise<void> {
  await deleteMemoryFact(id);
}

/** Undo for a transaction the chat deleted: puts it back from its saved snapshot. */
export async function undoChatDelete(snapshot: Record<string, unknown>): Promise<void> {
  // Stored as JSON, so nulls stand in for "not set"; the input schema wants them absent.
  const s = Object.fromEntries(Object.entries(snapshot).filter(([, v]) => v !== null)) as unknown as TransactionInput & { date: string | Date };
  await addTransaction({ ...s, date: new Date(s.date) });
  revalidatePath('/', 'layout');
}

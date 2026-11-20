'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { addTransaction } from '@/lib/actions/transactions';
import type { ChatAttachment, ChatOptions, ChatSummary, ChatTurnResult, ChatItem } from '@/lib/chat-types';
import type { TransactionInput } from '@/lib/types';
import { listChats, loadChat, runChatTurn, sessionService } from '@/ai/adk/chat';
import { deleteMemoryFact, listMemoryFacts, type MemoryFact } from '@/ai/adk/memory';
import { APP_NAME, USER_ID } from '@/ai/adk/session-store';

/** Chat history drawer, conversations, confirmations and memory, for the chat UI. */

const MAX_ATTACHMENT_BYTES = 3_000_000;

export async function sendChatMessage(input: { sessionId?: string; text: string; attachments?: ChatAttachment[]; options: ChatOptions }): Promise<ChatTurnResult> {
  const text = input.text.trim();
  const attachments = (input.attachments ?? []).slice(0, 3);
  if (!text && !attachments.length) throw new Error('Type a message or attach a file.');
  if (attachments.some(a => !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(a.mime))) throw new Error('Attach a photo (JPG, PNG, WebP) or a PDF.');
  if (attachments.some(a => a.dataBase64.length * 0.75 > MAX_ATTACHMENT_BYTES)) throw new Error('That file is too large. Keep it under 3 MB.');
  return runChatTurn({ sessionId: input.sessionId, text: text || `Read ${attachments.map(a => a.name).join(', ')}`, attachments, options: input.options });
}

export async function answerChatConfirmation(input: { sessionId: string; confirmationId: string; confirmed: boolean; options: ChatOptions }): Promise<ChatTurnResult> {
  const result = await runChatTurn({ sessionId: input.sessionId, confirmation: { id: input.confirmationId, confirmed: input.confirmed }, options: input.options });
  if (input.confirmed) revalidatePath('/', 'layout');
  return result;
}

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

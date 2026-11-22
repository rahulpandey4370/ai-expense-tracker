// Light reads of saved chats and facts, with no AI libraries, so /api/read starts fast.
import { getSupabase } from '@/lib/supabase';
import type { ChatSummary } from '@/lib/chat-types';

// Must match APP_NAME / USER_ID in src/ai/adk/session-store.ts.
const APP_NAME = 'finwise';
const USER_ID = 'me';

export interface MemoryFact { id: string; fact: string; createdAt: string }

export async function listChats(): Promise<ChatSummary[]> {
  const { data } = await getSupabase().from('chat_sessions').select('id, title, kind, updated_at')
    .eq('app_name', APP_NAME).eq('user_id', USER_ID).order('updated_at', { ascending: false }).limit(10);
  return (data ?? []).map(r => ({ id: r.id, title: r.title, kind: r.kind, updatedAt: r.updated_at }));
}

export async function listMemoryFacts(): Promise<MemoryFact[]> {
  const { data } = await getSupabase().from('ai_memories').select('id, fact, created_at').order('created_at', { ascending: true });
  return (data ?? []).map(r => ({ id: r.id, fact: r.fact, createdAt: r.created_at }));
}

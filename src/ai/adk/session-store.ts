import { BaseSessionService, createEvent, createSession, type Event, type Session } from '@google/adk';
import cuid from 'cuid';
import { getSupabase } from '@/lib/supabase';

/*
 * ADK sessions kept in Supabase (chat_sessions + chat_events, see
 * supabase/chat.sql), so a conversation survives between requests: follow-ups
 * keep their context, a paused "Confirm?" action can resume, and the chat
 * history drawer can list past chats. Built on ADK's BaseSessionService, which
 * still does the state merging; this class only loads and saves.
 */

export const APP_NAME = 'finwise';
export const USER_ID = 'me';
/** Only the most recently used chats are kept. */
export const MAX_SESSIONS = 10;

type CreateReq = Parameters<BaseSessionService['createSession']>[0];
type GetReq = Parameters<BaseSessionService['getSession']>[0];
type ListReq = Parameters<BaseSessionService['listSessions']>[0];
type DeleteReq = Parameters<BaseSessionService['deleteSession']>[0];
type AppendReq = Parameters<BaseSessionService['appendEvent']>[0];

export class SupabaseSessionService extends BaseSessionService {
  async createSession({ appName, userId, state, sessionId }: CreateReq): Promise<Session> {
    const id = sessionId?.trim() || cuid();
    const { error } = await getSupabase().from('chat_sessions').insert({
      id, app_name: appName, user_id: userId, state: state ?? {},
    });
    if (error) throw new Error(`Could not create chat: ${error.message}`);
    await pruneOldSessions(appName, userId);
    return createSession({ id, appName, userId, state: state ?? {}, events: [], lastUpdateTime: Date.now() });
  }

  async getSession({ appName, userId, sessionId, config }: GetReq): Promise<Session | undefined> {
    const db = getSupabase();
    const { data: row } = await db.from('chat_sessions').select('*')
      .eq('id', sessionId).eq('app_name', appName).eq('user_id', userId).maybeSingle();
    if (!row) return undefined;
    let q = db.from('chat_events').select('data').eq('session_id', sessionId).order('ts', { ascending: true });
    if (config?.afterTimestamp) q = q.gt('ts', config.afterTimestamp);
    const { data: rows, error } = await q;
    if (error) throw new Error(`Could not load chat: ${error.message}`);
    // createEvent restores ADK's event marker, which JSON storage drops.
    let events = (rows ?? []).map(r => createEvent(r.data as Event));
    if (config?.numRecentEvents) events = events.slice(-config.numRecentEvents);
    return createSession({
      id: row.id, appName, userId, state: row.state ?? {}, events,
      lastUpdateTime: new Date(row.updated_at).getTime(),
    });
  }

  async listSessions({ appName, userId, limit }: ListReq) {
    let q = getSupabase().from('chat_sessions').select('id, updated_at', { count: 'exact' })
      .eq('app_name', appName).order('updated_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    if (limit) q = q.limit(limit);
    const { data, count } = await q;
    const sessions = (data ?? []).map(r => createSession({
      id: r.id, appName, userId: userId ?? USER_ID, state: {}, events: [], lastUpdateTime: new Date(r.updated_at).getTime(),
    }));
    return { sessions, page: 1, limit: limit ?? sessions.length, totalItems: count ?? sessions.length, totalPages: 1 };
  }

  async deleteSession({ sessionId }: DeleteReq): Promise<void> {
    await getSupabase().from('chat_sessions').delete().eq('id', sessionId);
  }

  async appendEvent({ session, event }: AppendReq): Promise<Event> {
    const saved = await super.appendEvent({ session, event });
    if (saved.partial) return saved;
    const db = getSupabase();
    const { error } = await db.from('chat_events').upsert({
      id: saved.id, session_id: session.id, ts: saved.timestamp, data: JSON.parse(JSON.stringify(saved)),
    });
    if (error) throw new Error(`Could not save chat message: ${error.message}`);
    const hasState = saved.actions?.stateDelta && Object.keys(saved.actions.stateDelta).length > 0;
    await db.from('chat_sessions')
      .update({ updated_at: new Date().toISOString(), ...(hasState ? { state: session.state } : {}) })
      .eq('id', session.id);
    session.lastUpdateTime = saved.timestamp;
    return saved;
  }
}

/** Keeps the newest MAX_SESSIONS chats and deletes the rest (their events cascade). */
async function pruneOldSessions(appName: string, userId: string) {
  const db = getSupabase();
  const { data } = await db.from('chat_sessions').select('id')
    .eq('app_name', appName).eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(MAX_SESSIONS, MAX_SESSIONS + 50);
  const stale = (data ?? []).map(r => r.id);
  if (stale.length) await db.from('chat_sessions').delete().in('id', stale);
}

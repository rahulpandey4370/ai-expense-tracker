import { InMemoryArtifactService, LlmAgent, LoadMemoryTool, Runner, StreamingMode, createEvent, getFunctionCalls, getFunctionResponses, isCompactedEvent, type Event, type Session } from '@google/adk';
import type { Content } from '@google/genai';
import { getSupabase } from '@/lib/supabase';
import { getDefaultModelForTask } from '@/lib/task-models';
import type { ChatAttachment, ChatItem, ChatOptions, ChatSummary, ChatTurnResult } from '@/lib/chat-types';
import { DESCRIPTION_RULES } from '@/ai/flows/parse-transactions-prompt';
import { ACTION_TOOLS, previewAction } from './action-tools';
import { ExchangeCountCompactor } from './compactor';
import { attachmentName, readAttachmentTool, showTableTool } from './content-tools';
import { ANSWER_STYLE, HOW_TO_WORK, LEDGER_TOOLS, financeContext, portfolioOverview } from './finance-agent';
import { PastChatsMemoryService, factsInstruction, forgetFactTool, listMemoryFacts, rememberFactTool } from './memory';
import { adkModelFor } from './model';
import { APP_NAME, SupabaseSessionService, USER_ID } from './session-store';

/*
 * The main chat: one ADK agent run per message on a saved session, so it keeps
 * context, can pause an action for the user's Confirm, remembers past chats and
 * facts, compacts after 12 exchanges, reads attached files, and shows tables.
 */

export const sessionService = new SupabaseSessionService();
const memoryService = new PastChatsMemoryService();
const AGENT_NAME = 'finwise_assistant';
const ACTION_NAMES = new Set(ACTION_TOOLS.map(t => t.name));
const CONFIRM_CALL = 'adk_request_confirmation';

const CHAT_RULES = `## CHANGING DATA
- You can add, edit and delete transactions (add_transactions, update_transaction, delete_transaction), mark what someone owes as paid back (settle_split), and pause or resume recurring entries (set_recurring_active). Only when the user asks for a change.
- Look up what you need first: exact category and payment method names (list_categories_and_payment_methods), transaction ids (search_transactions), rule ids (get_recurring_rules), people (get_split_balances).
- If something essential is missing (the amount, or which of several cards), ask one short question instead of guessing. Date defaults to today.
- The app shows the user a Confirm card for every change and runs it only after they tap Confirm. So call the tool directly with the final values; never ask "shall I?" in text first. Then say one short line such as "Tap Confirm to add it."
- When a change is done, confirm it in one line. If a tool result says cancelledByUser, the user tapped Cancel: say so in a few words and do not retry.

## TRANSACTION DESCRIPTIONS
- Every description you add, and every description you change, is written the same way as the app's AI transaction parser: ${DESCRIPTION_RULES.replace(/[{}]/g, '')}
- Turn what the user typed into this format (e.g. "450 swiggy biryani" → "🍽️ Swiggy: Biryani"). When editing other fields, leave the description as it is.

## ATTACHED FILES
- When the message lists attached files, call read_attachment for each. Show what was found with show_table, then call add_transactions with those rows mapped to exact category and payment method names, so the user can confirm.

## TABLES
- For any list of 3 or more items, or a comparison, call show_table instead of writing the rows, then add one or two sentences.

## MEMORY
- Call remember_fact when the user asks you to remember something or states a lasting preference about their money. Never store card or account numbers.
- Call load_memory when the user refers to an earlier conversation ("like last time", "what did we say about Goa").
- A message starting with "[Previous Context Summary]" is the earlier part of THIS chat, condensed. Treat it as said in this conversation.`;

function buildAgent(modelKey: string, options: ChatOptions, factsText: string): LlmAgent {
  const model = adkModelFor(modelKey);
  return new LlmAgent({
    name: AGENT_NAME,
    description: "Answers questions about the user's money and makes changes they confirm.",
    model,
    // Fixed text first and today's context last, so the provider's prompt cache can reuse the start.
    instruction: [HOW_TO_WORK, CHAT_RULES, `## OUTPUT\n${ANSWER_STYLE}`, financeContext({ viewing: options.viewing, investmentFocus: options.investmentMode, verbose: options.verbose }), factsText]
      .filter(Boolean).join('\n\n'),
    tools: [
      ...LEDGER_TOOLS, ...(options.investmentMode ? [portfolioOverview] : []),
      ...ACTION_TOOLS, showTableTool, readAttachmentTool(modelKey),
      new LoadMemoryTool(), rememberFactTool, forgetFactTool,
    ],
    contextCompactors: [new ExchangeCountCompactor(model)],
    // ADK reports a Cancel tap as "This tool call is rejected.", which models
    // read as an app error and sometimes retry. Say what actually happened.
    afterToolCallback: ({ tool, response }) =>
      ACTION_NAMES.has(tool.name) && response?.error === 'This tool call is rejected.'
        ? { cancelledByUser: true, instruction: 'The user tapped Cancel. Nothing was changed. Acknowledge in a few words; do not call the tool again unless they ask.' }
        : undefined,
    generateContentConfig: { temperature: 0.1 },
  });
}

const titleFrom = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t || 'New chat';
};

/** One message (or one Confirm/Cancel tap) through the agent. */
export async function runChatTurn(input: {
  sessionId?: string;
  text?: string;
  attachments?: ChatAttachment[];
  confirmation?: { id: string; confirmed: boolean };
  options: ChatOptions;
  /** Receives the assistant's words as they are written. */
  onText?: (delta: string) => void;
}): Promise<ChatTurnResult> {
  const modelKey = input.options.modelKey || getDefaultModelForTask('chat');
  // Saved facts and the chat load at the same time.
  const [facts, existing] = await Promise.all([
    listMemoryFacts(),
    input.sessionId ? sessionService.getSession({ appName: APP_NAME, userId: USER_ID, sessionId: input.sessionId }) : undefined,
  ]);
  const agent = buildAgent(modelKey, input.options, factsInstruction(facts));
  const artifactService = new InMemoryArtifactService();
  const runner = new Runner({ appName: APP_NAME, agent, sessionService, memoryService, artifactService });

  let session = existing;
  if (!session) {
    if (input.confirmation) throw new Error('That chat no longer exists.');
    session = await sessionService.createSession({ appName: APP_NAME, userId: USER_ID });
  }
  // The first message names the chat (a new one, or one emptied with /clear).
  if (!session.events.length && !input.confirmation) {
    await getSupabase().from('chat_sessions').update({ title: titleFrom(input.text ?? '') }).eq('id', session.id);
  }

  // Files ride along as ADK artifacts for this turn; read_attachment loads them.
  const files = input.attachments ?? [];
  for (const [i, f] of files.entries()) {
    await artifactService.saveArtifact({
      appName: APP_NAME, userId: USER_ID, sessionId: session.id,
      filename: attachmentName(i, f.mime), artifact: { inlineData: { mimeType: f.mime, data: f.dataBase64 } },
    });
  }
  const attachedNote = files.length
    ? `\n\n[Attached files: ${files.map((f, i) => `${attachmentName(i, f.mime)} (${f.name})`).join(', ')}]`
    : '';
  const newMessage: Content = input.confirmation
    ? { role: 'user', parts: [{ functionResponse: { id: input.confirmation.id, name: CONFIRM_CALL, response: { confirmed: input.confirmation.confirmed } } }] }
    : { role: 'user', parts: [{ text: `${input.text ?? ''}${attachedNote}`.trim() }] };

  let error: string | undefined;
  const turnEvents: Event[] = [];
  try {
    const runConfig = { maxLlmCalls: 12, streamingMode: input.onText ? StreamingMode.SSE : StreamingMode.NONE };
    for await (const event of runner.runAsync({ userId: USER_ID, sessionId: session.id, newMessage, runConfig })) {
      if (event.author === AGENT_NAME && input.onText) {
        // Partial events carry the new words; a finished model reply separates the next one.
        if (event.partial) input.onText((event.content?.parts ?? []).filter(p => p.text && !p.thought).map(p => p.text).join(''));
        else input.onText('\n\n');
      }
      if (event.partial) continue;
      turnEvents.push(event);
      if (event.errorMessage) error = event.errorMessage;
      for (const c of getFunctionCalls(event)) console.info(`[adk] ${event.author} → ${c.name}(${JSON.stringify(c.args).slice(0, 300)})`);
    }
  } catch (e: any) {
    console.error('[chat] agent run failed:', e);
    error = e?.message ?? 'failed';
  }

  // Remember, outside the model's view: which model answered, and a readable
  // preview for each new Confirm card (built now, while "before" values are current).
  const uiState: Record<string, unknown> = {};
  const invocationId = turnEvents.find(e => e.invocationId)?.invocationId;
  if (invocationId) uiState[`ui:model:${invocationId}`] = modelKey;
  for (const e of turnEvents) {
    for (const c of getFunctionCalls(e)) {
      if (c.name !== CONFIRM_CALL || !c.id) continue;
      const original = (c.args as any)?.originalFunctionCall;
      uiState[`ui:preview:${c.id}`] = await previewAction(original?.name, original?.args ?? {});
    }
  }
  const fresh = await sessionService.getSession({ appName: APP_NAME, userId: USER_ID, sessionId: session.id });
  if (fresh && Object.keys(uiState).length) {
    await sessionService.appendEvent({ session: fresh, event: createEvent({ invocationId: 'ui', author: 'user', actions: { stateDelta: uiState } as any }) });
  }

  // `fresh` already holds every event of this turn; no need to read the chat again.
  const loaded = fresh
    ? { title: (await getSupabase().from('chat_sessions').select('title').eq('id', session.id).maybeSingle()).data?.title ?? 'Chat', items: eventsToItems(fresh) }
    : await loadChat(session.id);
  return {
    sessionId: session.id,
    title: loaded?.title ?? 'New chat',
    items: loaded?.items ?? [],
    error: error ? "The AI couldn't finish that. Please try again, or pick a different model." : undefined,
  };
}

export function splitFollowUps(raw: string): { text: string; followUps?: string[] } {
  const m = raw.match(/\[FOLLOWUPS\]([\s\S]*?)(\[\/FOLLOWUPS\]|$)/i);
  if (!m) return { text: raw.trim() };
  const followUps = m[1].split('\n').map(l => l.replace(/^\s*[-•*\d.]+\s*/, '').trim()).filter(l => l && l.length <= 120).slice(0, 4);
  return { text: raw.replace(m[0], '').trim(), followUps: followUps.length ? followUps : undefined };
}

const ATTACHED_RE = /\n*\[Attached files: (.*)\]\s*$/;

function resultText(tool: string, r: any): string | null {
  if (!r || r.error || r.problem || r.problems) return null;
  switch (tool) {
    case 'add_transactions': return r.added ? `Added ${r.added} transaction${r.added === 1 ? '' : 's'}` : null;
    case 'update_transaction': return r.updated ? `Updated “${r.description}”` : null;
    case 'delete_transaction': return r.deleted ? `Deleted “${r.description}”` : null;
    case 'settle_split': return r.settled ? `Marked ${r.person} as paid back` : null;
    case 'set_recurring_active': return r.updated ? `${r.active ? 'Resumed' : 'Paused'} “${r.description}”` : null;
    default: return null;
  }
}

/** Turns a saved session's events into what the chat shows. */
export function eventsToItems(session: Session): ChatItem[] {
  const items: ChatItem[] = [];
  const state = session.state as Record<string, any>;
  const confirmCards = new Map<string, Extract<ChatItem, { kind: 'confirm' }>>();
  for (const e of session.events) {
    if (isCompactedEvent(e)) { items.push({ kind: 'compacted', id: e.id }); continue; }
    const parts = e.content?.parts ?? [];
    if (e.author === 'user') {
      for (const r of getFunctionResponses(e)) {
        const card = r.id ? confirmCards.get(r.id) : undefined;
        if (card && r.name === CONFIRM_CALL) card.status = (r.response as any)?.confirmed ? 'confirmed' : 'cancelled';
      }
      const text = parts.map(p => p.text ?? '').join('').trim();
      if (text) {
        const att = text.match(ATTACHED_RE);
        items.push({
          kind: 'user', id: e.id, text: text.replace(ATTACHED_RE, '').trim(),
          attachments: att ? att[1].split(', ').map(s => s.replace(/^[^(]*\((.*)\)$/, '$1')) : undefined,
        });
      }
      continue;
    }
    // Review analysts' working notes stay hidden; only the written review shows.
    if (e.author !== AGENT_NAME && e.author !== 'review_writer') continue;
    for (const c of getFunctionCalls(e)) {
      if (c.name === 'show_table') {
        const a = c.args as any;
        if (Array.isArray(a?.columns) && Array.isArray(a?.rows)) items.push({ kind: 'table', id: c.id ?? e.id, title: a.title, columns: a.columns, rows: a.rows });
      } else if (c.name === CONFIRM_CALL && c.id) {
        const original = (c.args as any)?.originalFunctionCall;
        const card: Extract<ChatItem, { kind: 'confirm' }> = {
          kind: 'confirm', id: c.id, tool: original?.name ?? '', status: 'pending',
          preview: state[`ui:preview:${c.id}`] ?? { title: 'Confirm this change?', lines: [] },
        };
        confirmCards.set(c.id, card);
        items.push(card);
      }
    }
    for (const r of getFunctionResponses(e)) {
      const res = r.response as any;
      if (r.name === 'remember_fact' && res?.saved) items.push({ kind: 'memory', id: r.id ?? e.id, text: `Remembered: ${res.fact}` });
      if (r.name && ACTION_NAMES.has(r.name)) {
        const text = resultText(r.name, res);
        if (text) items.push({ kind: 'result', id: r.id ?? e.id, tool: r.name, ok: true, text, undo: res?.undo });
      }
    }
    const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
    if (text) {
      const { text: body, followUps } = splitFollowUps(text);
      if (body) items.push({ kind: 'assistant', id: e.id, text: body, followUps, model: state[`ui:model:${e.invocationId}`] });
    }
  }
  return items;
}

export async function loadChat(id: string): Promise<{ id: string; title: string; kind: string; items: ChatItem[] } | null> {
  const session = await sessionService.getSession({ appName: APP_NAME, userId: USER_ID, sessionId: id });
  if (!session) return null;
  const { data } = await getSupabase().from('chat_sessions').select('title, kind').eq('id', id).maybeSingle();
  return { id, title: data?.title ?? 'Chat', kind: data?.kind ?? 'chat', items: eventsToItems(session) };
}

export { listChats } from '@/lib/chat-store';

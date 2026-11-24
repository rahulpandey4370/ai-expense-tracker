// "Say it": a spoken/typed sentence → a split expense draft for one group.
import { z } from 'zod';
import { callStructuredLLM } from '@/lib/ai-client';
import { SMS_MODEL } from '@/lib/sms-ai';
import { withAiFeature } from '@/lib/usage';
import { getSupabase } from '@/lib/supabase';
import { resolveShares, type SplitMethod } from './math';
import type { ExpenseMeta } from './types';

// Lenient on purpose: JSON mode has no schema, so a missing/odd field falls back instead of failing.
const DraftSchema = z.object({
  amount: z.coerce.number().nullable().catch(null),
  description: z.string().catch(''),
  date: z.string().nullable().catch(null),
  paidBy: z.string().nullable().catch(null),
  method: z.enum(['equal', 'exact', 'percent', 'shares', 'items', 'cover']).catch('equal'),
  participants: z.array(z.string()).catch([]),
  values: z.array(z.object({ memberId: z.string(), value: z.coerce.number() })).catch([]),
  items: z.array(z.object({ name: z.string().catch('Item'), amount: z.coerce.number().catch(0), memberIds: z.array(z.string()).catch([]) })).catch([]),
  coveredBy: z.string().nullable().catch(null),
  question: z.string().nullable().catch(null),
  confident: z.boolean().catch(false),
});

const PROMPT = `You turn one spoken sentence about a shared expense into a structured split.

Group members (id: name):
{{{members}}}
The speaker is "{{{speaker}}}" (id {{{speakerId}}}). "I", "me", "my" mean the speaker.
Today is {{{today}}}. All amounts are Indian rupees (INR, ₹); treat any number as rupees.

Rules:
- paidBy: who paid. If not said, the speaker.
- "split", "between us", "everyone", "three ways" → method equal; pick participants from the names said, or everyone if "everyone"/"all"/unspecified.
- Specific amounts per person that add up to the total → exact. Percentages → percent. "twice as much", "2 shares" → shares.
- Someone's own item inside the bill (e.g. "Maya's wine was 12, split the rest") → method items: one item for that thing with only that person, and one item "Rest" for the remainder with the people splitting it.
- "X covers it", "my treat", "on me" → cover with coveredBy.
- Match names loosely (nicknames, first names). Never invent members; use only the ids above.
- description: 2-5 words, e.g. "Dinner at Ramiro".
- If the amount is missing or you can't tell who is involved, set question to one short question and confident=false.

Return JSON exactly in this shape (ids are the member ids above):
{ "amount": number or null, "description": "2-5 words", "date": "YYYY-MM-DD" or null, "paidBy": "id" or null,
  "method": "equal" | "exact" | "percent" | "shares" | "items" | "cover",
  "participants": ["id", ...], "values": [{ "memberId": "id", "value": number }],
  "items": [{ "name": "text", "amount": number, "memberIds": ["id", ...] }],
  "coveredBy": "id" or null, "question": "one short question" or null, "confident": true | false }

Sentence: """{{{text}}}"""`;

const rawLimit = Number(process.env.SPLIT_VOICE_DAILY_LIMIT ?? 150);
const DAILY_LIMIT = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 150;

/** Split voice + receipt scan use the same Luna model as the SMS flow (override with SPLIT_AI_MODEL). */
export const SPLIT_MODEL = process.env.SPLIT_AI_MODEL || SMS_MODEL;

// ponytail: one app-wide daily cap (friends and link guests spend the owner's AI credits); per-person caps if it gets abused.
// Reserve first, then count: parallel calls each see the others' reservations, so a burst can't slip past.
// Fails closed if the count can't be read.
export async function assertAiBudget() {
  const db = getSupabase();
  const unavailable = () => new Error('Voice and scan are unavailable right now. Type the expense instead.');
  const { data: slot, error: insErr } = await db.from('ai_usage')
    .insert({ feature: 'split_ai_quota', model_key: SPLIT_MODEL, provider: 'quota', operation: 'structured', ok: true })
    .select('id').single();
  if (insErr || !slot) throw unavailable();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('feature', 'split_ai_quota').gte('created_at', since);
  if (error || count == null || count > DAILY_LIMIT) {
    await db.from('ai_usage').delete().eq('id', slot.id);
    throw error || count == null ? unavailable() : new Error('Voice and scan are resting for today. Type the expense instead.');
  }
}

export interface VoiceDraft {
  description: string;
  amount: number | null;
  date: string | null;
  paidBy: string;
  method: SplitMethod;
  meta: ExpenseMeta;
  question: string | null;
  confident: boolean;
}

export async function parseVoiceDraft(text: string, members: { id: string; name: string }[], speaker: { id: string; name: string }, today: string): Promise<VoiceDraft> {
  await assertAiBudget();
  const raw = await withAiFeature('split_voice', () => callStructuredLLM(
    SPLIT_MODEL,
    PROMPT,
    { members: members.map(m => `${m.id}: ${m.name}`).join('\n'), speaker: speaker.name, speakerId: speaker.id, today, text: text.slice(0, 600) },
    DraftSchema,
    { feature: 'split_voice', temperature: 0.1, maxOutputTokens: 800 },
  ));
  return cleanDraft(raw, members.map(m => m.id), speaker.id);
}

/** Drops anything the model invented and checks the split adds up; never trusts the model's ids. */
export function cleanDraft(raw: z.infer<typeof DraftSchema>, memberIds: string[], speakerId: string): VoiceDraft {
  const ok = new Set(memberIds);
  const keep = (ids: string[]) => [...new Set(ids.filter(id => ok.has(id)))];
  const paidBy = raw.paidBy && ok.has(raw.paidBy) ? raw.paidBy : speakerId;
  let participants = keep(raw.participants);
  if (participants.length === 0) participants = [...memberIds];
  const values = Object.fromEntries(raw.values.filter(v => ok.has(v.memberId)).map(v => [v.memberId, v.value]));
  const items = raw.items.map(i => ({ name: i.name, amount: i.amount, memberIds: keep(i.memberIds) })).filter(i => i.memberIds.length && i.amount > 0);
  const coveredBy = raw.coveredBy && ok.has(raw.coveredBy) ? raw.coveredBy : undefined;
  const meta: ExpenseMeta = { participants, values, items, coveredBy };
  const amount = raw.amount && raw.amount > 0 ? Math.round(raw.amount * 100) / 100 : null;
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;

  let question = raw.question;
  if (!amount) question ??= 'How much was it?';
  else {
    const check = resolveShares(amount, raw.method, { participants, values, items, coveredBy });
    if (check.error) question ??= check.error;
  }
  return {
    description: raw.description.trim().slice(0, 120) || 'Expense',
    amount, date, paidBy, method: raw.method, meta, question,
    confident: raw.confident && !question,
  };
}

// "Say it": a spoken/typed sentence → a split expense draft for one group.
import { z } from 'zod';
import { callStructuredLLM } from '@/lib/ai-client';
import { SMS_MODEL } from '@/lib/sms-ai';
import { withAiFeature } from '@/lib/usage';
import { getSupabase } from '@/lib/supabase';
import { resolveShares, type SplitMethod } from './math';
import type { ExpenseMeta } from './types';

const DraftSchema = z.object({
  amount: z.number().nullable(),
  description: z.string(),
  date: z.string().nullable().describe('YYYY-MM-DD if a day was mentioned, else null'),
  paidBy: z.string().nullable().describe('member id of who paid; null if not said'),
  method: z.enum(['equal', 'exact', 'percent', 'shares', 'items', 'cover']),
  participants: z.array(z.string()).describe('member ids sharing the cost (equal/exact/percent/shares)'),
  values: z.array(z.object({ memberId: z.string(), value: z.number() })).describe('exact rupees, percent, or share weights per member; empty for equal'),
  items: z.array(z.object({ name: z.string(), amount: z.number(), memberIds: z.array(z.string()) })).describe('only for item-by-item'),
  coveredBy: z.string().nullable().describe('member id who covers everything (cover)'),
  question: z.string().nullable().describe('one short question if something essential is missing or ambiguous, else null'),
  confident: z.boolean().describe('true only if amount, payer and split are all clear'),
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

Sentence: """{{{text}}}"""`;

const DAILY_LIMIT = Number(process.env.SPLIT_VOICE_DAILY_LIMIT ?? 150);

/** Split voice + receipt scan use the same Luna model as the SMS flow (override with SPLIT_AI_MODEL). */
export const SPLIT_MODEL = process.env.SPLIT_AI_MODEL || SMS_MODEL;

// ponytail: one app-wide daily cap (friends and link guests spend the owner's AI credits); per-person caps if it gets abused.
export async function assertAiBudget() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await getSupabase().from('ai_usage').select('id', { count: 'exact', head: true })
    .in('feature', ['split_voice', 'split_scan']).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) throw new Error('Voice and scan are resting for today. Type the expense instead.');
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

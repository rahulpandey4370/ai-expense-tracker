"use client";

import './split.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { GroupDetail, GroupSummary } from '@/lib/split/types';
import type { VoiceDraft } from '@/lib/split/voice';
import { KIND_EMOJI, SplitSheet, splitSerif, todayYmd } from './bits';
import { ExpenseSheet, type ExpenseDraft } from './expense-sheet';
import { splitApi, useSplitGroup, useSplitHome } from './use-split';

/** What the main app knows when someone asks to split: from the form, AI entry, SMS or chat. */
export interface SplitSeed {
  amount?: number;
  description?: string;
  date?: string;
  groupHint?: string;
  participantNames?: string[];
  /** custom amounts by name */
  amountsByName?: Record<string, number>;
  paidByName?: string;
  mode?: 'equally' | 'custom' | 'not_mine' | 'shares';
  /** Free text to parse against the chosen group (an SMS note like "split with Asha in Goa trip"). */
  instruction?: string;
  receiptDataUri?: string;
}

const LAST_GROUP = 'split-last-group';
const norm = (s: string) => s.trim().toLowerCase();

/** Loose name match: full name, first name, or startsWith either way. */
function findMember(d: GroupDetail, name?: string) {
  if (!name) return undefined;
  const n = norm(name);
  const active = d.members.filter(m => !m.removed);
  return active.find(m => norm(m.name) === n)
    ?? active.find(m => norm(m.name).split(' ')[0] === n.split(' ')[0])
    ?? active.find(m => norm(m.name).startsWith(n) || n.startsWith(norm(m.name)));
}

function pickGroup(groups: GroupSummary[], hint?: string): string | null {
  if (groups.length === 0) return null;
  if (hint) {
    const h = norm(hint);
    const g = groups.find(x => norm(x.name) === h) ?? groups.find(x => norm(x.name).includes(h) || h.includes(norm(x.name)));
    if (g) return g.id;
  }
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_GROUP); } catch {}
  return groups.some(g => g.id === last) ? last : groups[0].id;
}

/** Seed → draft for a specific group (names resolved to that group's members). */
function draftFor(d: GroupDetail, seed: SplitSeed): ExpenseDraft {
  const me = d.meMemberId ?? d.members[0]?.id ?? '';
  const named = (seed.participantNames ?? []).map(n => findMember(d, n)?.id).filter((x): x is string => !!x);
  const payer = findMember(d, seed.paidByName)?.id ?? me;
  const all = d.members.filter(m => !m.removed).map(m => m.id);
  const base = { description: seed.description ?? '', amount: seed.amount ?? null, date: seed.date ?? todayYmd(), paidBy: payer, said: seed.instruction, receiptDataUri: seed.receiptDataUri };
  if (seed.mode === 'not_mine' && named[0]) return { ...base, method: 'cover', meta: { participants: [named[0]], coveredBy: named[0] } };
  const participants = named.length ? [...new Set([me, ...named])] : all;
  if (seed.mode === 'custom' && seed.amountsByName) {
    const values: Record<string, number> = {};
    for (const [n, v] of Object.entries(seed.amountsByName)) { const id = findMember(d, n)?.id; if (id) values[id] = v; }
    const others = Object.values(values).reduce((a, b) => a + b, 0);
    if (seed.amount && !values[me] && payer === me) values[me] = Math.max(0, Math.round((seed.amount - others) * 100) / 100);
    return { ...base, method: 'exact', meta: { participants: [...new Set([...participants, ...Object.keys(values)])], values } };
  }
  return { ...base, method: 'equal', meta: { participants } };
}

/** Opens the group split form from anywhere in the app, prefilled from what that screen knows. */
export function SplitComposer({ open, onOpenChange, seed, spendingDefaults, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; seed: SplitSeed;
  spendingDefaults?: Partial<{ categoryId: string; paymentMethodId: string; expenseType: 'need' | 'want' | 'investment' | 'investment_expense' }>;
  onSaved?: (expenseId: string, groupId: string) => void;
}) {
  const home = useSplitHome(open);
  const groups = useMemo(() => (home.data?.groups ?? []).filter(g => !g.archived), [home.data]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const group = useSplitGroup(open ? groupId : null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [parsing, setParsing] = useState(false);

  useEffect(() => { if (open && home.data && !groupId) setGroupId(pickGroup(groups, seed.groupHint)); }, [open, home.data, groups, groupId, seed.groupHint]);
  useEffect(() => { if (!open) { setGroupId(null); setDraft(null); } }, [open]);

  // Build the draft once the group loads (and again if the user switches group).
  useEffect(() => {
    const d = group.data;
    if (!open || !d) return;
    const fromSeed = draftFor(d, seed);
    if (!seed.instruction?.trim()) { setDraft(fromSeed); return; }
    setParsing(true);
    const text = `${seed.instruction}${seed.amount ? `. Total ${seed.amount} rupees` : ''}${seed.description ? ` for ${seed.description}` : ''}.`;
    splitApi<VoiceDraft>('parseVoice', { groupId: d.group.id, text, today: todayYmd() })
      .then(v => setDraft({ ...fromSeed, method: v.method, paidBy: v.paidBy, meta: v.meta, amount: seed.amount ?? v.amount, description: seed.description || v.description }))
      .catch(() => setDraft(fromSeed))
      .finally(() => setParsing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group.data?.group.id]);

  const pick = (id: string) => { setDraft(null); setGroupId(id); try { localStorage.setItem(LAST_GROUP, id); } catch {} };
  const switcher = (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Group">
      {groups.map(g => (
        <button key={g.id} type="button" role="radio" aria-checked={g.id === groupId} className="s-chip shrink-0" data-on={g.id === groupId} onClick={() => pick(g.id)}>
          {g.emoji ?? KIND_EMOJI[g.kind]} {g.name}
        </button>
      ))}
    </div>
  );

  if (!open) return null;
  if (home.data && groups.length === 0) {
    return (
      <SplitSheet open onOpenChange={onOpenChange} title={<>Start a <em>group</em> first</>}>
        <p className="s-muted mb-4 text-sm">Splits live in groups — a trip, your flat, or just you and one friend.</p>
        <Link href="/split-expenses" className="s-pill s-pill-primary w-full">Open Split Expenses</Link>
      </SplitSheet>
    );
  }
  if (!group.data || !draft || parsing) {
    return (
      <SplitSheet open onOpenChange={onOpenChange} title={<>Split <em>it</em></>}>
        <div className={`split-ui flex justify-center py-10 ${splitSerif.variable}`}><Loader2 className="s-muted h-6 w-6 animate-spin" /></div>
      </SplitSheet>
    );
  }
  return (
    <ExpenseSheet
      open onOpenChange={onOpenChange} detail={group.data} draft={draft} header={switcher}
      spendingDefaults={spendingDefaults}
      onSaved={id => { try { localStorage.setItem(LAST_GROUP, group.data!.group.id); } catch {} onSaved?.(id, group.data!.group.id); }}
    />
  );
}

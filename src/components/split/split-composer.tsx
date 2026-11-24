"use client";

import './split.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { GroupSummary } from '@/lib/split/types';
import { draftFor, type SplitSeed } from '@/lib/split/seed';
import type { VoiceDraft } from '@/lib/split/voice';
import { KIND_EMOJI, SplitSheet, splitSerif, todayYmd } from './bits';
import { ExpenseSheet, type ExpenseDraft } from './expense-sheet';
import { splitApi, useSplitGroup, useSplitHome } from './use-split';

export type { SplitSeed } from '@/lib/split/seed';

const LAST_GROUP = 'split-last-group';
const norm = (s: string) => s.trim().toLowerCase();

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

/** Opens the group split form from anywhere in the app, prefilled from what that screen knows. */
export function SplitComposer({ open, onOpenChange, seed, spendingDefaults, onSaved, linkTransactionId }: {
  open: boolean; onOpenChange: (o: boolean) => void; seed: SplitSeed;
  spendingDefaults?: Partial<{ categoryId: string; paymentMethodId: string; expenseType: 'need' | 'want' | 'investment' | 'investment_expense' }>;
  onSaved?: (expenseId: string, groupId: string) => void;
  /** Editing a transaction: the group expense takes it over instead of creating a new one. */
  linkTransactionId?: string;
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
    const fromSeed: ExpenseDraft = draftFor(d, seed, todayYmd());
    if (!seed.instruction?.trim()) { setDraft(fromSeed); return; }
    let cancelled = false; // switching group mid-parse must not drop group A's member ids onto group B
    setParsing(true);
    const text = `${seed.instruction}${seed.amount ? `. Total ${seed.amount} rupees` : ''}${seed.description ? ` for ${seed.description}` : ''}.`;
    splitApi<VoiceDraft>('parseVoice', { groupId: d.group.id, text, today: todayYmd() })
      .then(v => { if (!cancelled) setDraft({ ...fromSeed, method: v.method, paidBy: v.paidBy, meta: v.meta, amount: seed.amount ?? v.amount, description: seed.description || v.description }); })
      .catch(() => { if (!cancelled) setDraft(fromSeed); })
      .finally(() => { if (!cancelled) setParsing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group.data?.group.id]);

  const pick = (id: string) => {
    if (id === groupId) return;
    setDraft(null); setGroupId(id);
    try { localStorage.setItem(LAST_GROUP, id); } catch {}
  };
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
        <Link href="/split-expenses" className="s-pill s-pill-primary w-full">Open FinWise Split</Link>
      </SplitSheet>
    );
  }
  if (group.error) {
    return (
      <SplitSheet open onOpenChange={onOpenChange} title={<>Couldn&apos;t <em>open</em> the group</>}>
        <p className="s-muted mb-3 text-sm">{(group.error as Error).message}</p>
        {switcher}
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
      spendingDefaults={spendingDefaults} linkTransactionId={linkTransactionId}
      onSaved={id => { try { localStorage.setItem(LAST_GROUP, group.data!.group.id); } catch {} onSaved?.(id, group.data!.group.id); }}
    />
  );
}

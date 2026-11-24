import { useMemo, useState } from 'react';
import { ArrowLeft, HandCoins, Loader2, Mic, Plus, Users } from 'lucide-react';
import type { VoiceDraft } from '@/lib/split/voice';
import { VoiceSheet } from './voice-sheet';
import type { Expense, GroupDetail, Settlement } from '@/lib/split/types';
import { Avatar, AvatarStack, EmptyState, KIND_EMOJI, KIND_LABEL, inr, monthLabel, prettyDate } from './bits';
import { ExpenseSheet } from './expense-sheet';
import { SettleSheet } from './settle-sheet';
import { MembersSheet } from './members-sheet';
import { useSplitGroup } from './use-split';

interface Props {
  groupId: string | null;
  token?: string;
  asMember?: string | null;
  onPickMember?: (memberId: string) => void;
  onBack?: () => void;
}

type FeedItem = { kind: 'expense'; at: string; date: string; e: Expense } | { kind: 'settlement'; at: string; date: string; s: Settlement };

export function GroupView({ groupId, token, asMember, onPickMember, onBack }: Props) {
  const q = useSplitGroup(groupId, token, asMember);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [sheet, setSheet] = useState<null | 'expense' | 'settle' | 'members' | 'voice'>(null);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);

  const feed = useMemo(() => {
    if (!q.data) return [] as [string, FeedItem[]][];
    const items: FeedItem[] = [
      ...q.data.expenses.map(e => ({ kind: 'expense' as const, at: e.createdAt, date: e.date, e })),
      ...q.data.settlements.map(s => ({ kind: 'settlement' as const, at: s.createdAt, date: s.date, s })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
    const byMonth = new Map<string, FeedItem[]>();
    for (const it of items) {
      const k = it.date.slice(0, 7);
      byMonth.set(k, [...(byMonth.get(k) ?? []), it]);
    }
    return [...byMonth.entries()];
  }, [q.data]);

  if (q.isLoading) return <div className="flex justify-center py-20"><Loader2 className="s-muted h-6 w-6 animate-spin" /></div>;
  if (!q.data) { // a failed background poll keeps the last data on screen
    return <EmptyState title={<>This link <em>doesn&apos;t work</em></>} body={(q.error as Error)?.message ?? 'The group may have been deleted or the link turned off.'} />;
  }

  const d: GroupDetail = q.data;
  const me = d.meMemberId;
  const label = (id: string) => (id === me ? 'You' : d.members.find(m => m.id === id)?.name ?? 'Someone');
  const myBalance = me ? d.balances[me] ?? 0 : 0;
  const total = d.expenses.reduce((a, e) => a + e.amount, 0);
  const active = d.members.filter(m => !m.removed);

  // Link guests say who they are before adding anything.
  if (!me && token) {
    return (
      <div className="space-y-4">
        <div className="s-hero p-6">
          <p className="s-muted text-sm"><span className="mr-1.5">{d.group.emoji ?? KIND_EMOJI[d.group.kind]}</span>{d.group.name}</p>
          <p className="split-display mt-1 text-4xl">Who are <em>you</em>?</p>
        </div>
        <ul className="s-card">
          {active.map(m => (
            <li key={m.id}>
              <button type="button" className="s-row w-full text-left" onClick={() => onPickMember?.(m.id)}>
                <Avatar name={m.name} size={34} /> <span className="font-medium">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const openExpense = (e: Expense | null) => { setEditing(e); setDraft(null); setSheet('expense'); };
  const review = (v: VoiceDraft) => { setEditing(null); setDraft(v); setSheet('expense'); };

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to groups" className="s-pill h-10 w-10 p-0"><ArrowLeft className="h-4 w-4" /></button>
        )}
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--s-tint)] text-2xl" aria-hidden>{d.group.emoji ?? KIND_EMOJI[d.group.kind]}</span>
        <div className="min-w-0 flex-1">
          <h1 className="split-display truncate text-3xl">{d.group.name}</h1>
          <p className="s-muted text-xs">{KIND_LABEL[d.group.kind]} · {active.length} people · {inr(total)} spent</p>
        </div>
        <button type="button" onClick={() => setSheet('members')} aria-label="People and share link"><AvatarStack names={active.map(m => m.name)} max={3} /></button>
      </header>

      <section className="s-hero p-5">
        {Math.abs(myBalance) < 0.01 ? (
          <p className="split-display text-3xl">You&apos;re all <em>square</em>.</p>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <p className="split-display text-2xl">You {myBalance > 0 ? <>are <em>owed</em></> : <><em>owe</em></>}</p>
            <p className={`text-3xl font-bold tabular-nums ${myBalance > 0 ? 's-owed' : 's-owe'}`}>{inr(myBalance)}</p>
          </div>
        )}
        {d.transfers.filter(t => t.from === me || t.to === me).slice(0, 3).map((t, i) => (
          <p key={i} className="s-muted mt-1 text-sm">
            {t.from === me ? <>You owe {label(t.to)} <span className="s-owe font-semibold">{inr(t.amount)}</span></> : <>{label(t.from)} owes you <span className="s-owed font-semibold">{inr(t.amount)}</span></>}
          </p>
        ))}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="s-pill s-pill-primary" onClick={() => setSheet('voice')}><Mic className="h-4 w-4" /> Say it</button>
          <button type="button" className="s-pill" onClick={() => openExpense(null)}><Plus className="h-4 w-4" /> Add</button>
          <button type="button" className="s-pill" onClick={() => setSheet('settle')}><HandCoins className="h-4 w-4" /> Settle up</button>
          <button type="button" className="s-pill" onClick={() => setSheet('members')}><Users className="h-4 w-4" /> People</button>
        </div>
      </section>

      {feed.length === 0 ? (
        <EmptyState title={<>Nothing <em>logged</em> yet</>} body="Add the first expense — dinner, a cab, the rent — and everyone's share is worked out.">
          <button type="button" className="s-pill s-pill-primary" onClick={() => openExpense(null)}><Plus className="h-4 w-4" /> Add expense</button>
        </EmptyState>
      ) : feed.map(([month, items]) => (
        <section key={month}>
          <p className="s-muted mb-2 px-1 text-xs font-semibold uppercase tracking-wide">{monthLabel(month)}</p>
          <ul className="s-card overflow-hidden">
            {items.map(it => it.kind === 'expense' ? (
              <li key={it.e.id}>
                <ExpenseRow e={it.e} me={me} label={label} isOwner={d.isOwnerViewer} onClick={() => openExpense(it.e)} />
              </li>
            ) : (
              <li key={it.s.id} className="s-row text-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--s-tint)]" aria-hidden>💸</span>
                <span className="flex-1">{label(it.s.from)} paid {label(it.s.to)}<span className="s-muted block text-xs">{prettyDate(it.s.date)}{it.s.note ? ` · ${it.s.note}` : ''}</span></span>
                <span className="font-semibold tabular-nums">{inr(it.s.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex flex-col items-center gap-3 md:bottom-8">
        <button type="button" onClick={() => openExpense(null)} aria-label="Add expense by typing"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--s-line)] bg-[var(--s-card)] text-[var(--s-ink)] shadow-md"><Plus className="h-6 w-6" /></button>
        <button type="button" onClick={() => setSheet('voice')} aria-label="Say an expense"
          className="s-pill-primary flex h-16 w-16 items-center justify-center rounded-full shadow-lg"><Mic className="h-7 w-7" /></button>
      </div>

      <ExpenseSheet open={sheet === 'expense'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} expense={editing} draft={draft} />
      <VoiceSheet open={sheet === 'voice'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} onReview={review} />
      <SettleSheet open={sheet === 'settle'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} />
      <MembersSheet open={sheet === 'members'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} onDeleted={onBack} />
    </div>
  );
}

function ExpenseRow({ e, me, label, isOwner, onClick }: { e: Expense; me: string | null; label: (id: string) => string; isOwner: boolean; onClick: () => void }) {
  const mine = me ? e.shares[me] ?? 0 : 0;
  const iPaid = e.paidBy === me;
  const impact = iPaid ? e.amount - mine : -mine;
  return (
    <button type="button" onClick={onClick} className="s-row w-full text-left hover:bg-[var(--s-tint)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--s-tint)] text-xl" aria-hidden>{e.emoji ?? '🧾'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.description}</span>
        <span className="s-muted block text-xs">
          {label(e.paidBy)} paid {inr(e.amount)} · {prettyDate(e.date)}
          {isOwner && mine > 0 && !e.inMySpending && <span className="s-owe"> · not in my spending</span>}
        </span>
      </span>
      <span className="text-right text-xs">
        {Math.abs(impact) < 0.01 ? <span className="s-muted">not involved</span> : impact > 0
          ? <><span className="s-muted block">you lent</span><span className="s-owed text-sm font-semibold">{inr(impact)}</span></>
          : <><span className="s-muted block">you borrowed</span><span className="s-owe text-sm font-semibold">{inr(impact)}</span></>}
      </span>
    </button>
  );
}

import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, FileText, HandCoins, Loader2, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import { pageOf } from '@/lib/split/feed';
import { ReportSheet } from './report-sheet';
import { VoiceSheet } from './voice-sheet';
import { ReceiptView } from './receipt-view';
import { Hero } from './hero';
import { groupLines } from '@/lib/split/hero-lines';
import type { Expense, GroupDetail, Settlement } from '@/lib/split/types';
import { Avatar, AvatarStack, EmptyState, KIND_EMOJI, KIND_LABEL, inr, monthLabel, prettyDate } from './bits';
import { ExpenseSheet, type ExpenseDraft } from './expense-sheet';
import { useEffect } from 'react';
import { SettleSheet } from './settle-sheet';
import { MembersSheet } from './members-sheet';
import { useSplitAction, useSplitGroup } from './use-split';
import { GroupSheet } from './group-sheet';
import { useToast } from '@/hooks/use-toast';

interface Props {
  groupId: string | null;
  token?: string;
  asMember?: string | null;
  onPickMember?: (memberId: string) => void;
  onBack?: () => void;
  /** Open this expense's receipt view on load (tapped from the home feed). */
  openExpenseId?: string | null;
}

type FeedItem = { kind: 'expense'; at: string; date: string; e: Expense } | { kind: 'settlement'; at: string; date: string; s: Settlement };

export function GroupView({ groupId, token, asMember, onPickMember, onBack, openExpenseId }: Props) {
  const q = useSplitGroup(groupId, token, asMember);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [sheet, setSheet] = useState<null | 'expense' | 'settle' | 'members' | 'voice' | 'scan' | 'say' | 'receipt' | 'report' | 'group'>(null);
  const action = useSplitAction(token);
  const { toast } = useToast();
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null); // null = newest month with activity
  const [page, setPage] = useState(0);
  useEffect(() => { setMonth(null); setPage(0); }, [groupId]);
  // A new expense lands in view: go back to the newest month.
  const count = q.data?.expenses.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) { setMonth(null); setPage(0); }
    lastCount.current = count;
  }, [count]);

  // Deep link from the home feed: show that expense's receipt once the group loads.
  useEffect(() => {
    if (!openExpenseId || opened === openExpenseId || !q.data) return;
    const e = q.data.expenses.find(x => x.id === openExpenseId);
    if (e) { setViewing(e); setSheet('receipt'); }
    setOpened(openExpenseId);
  }, [openExpenseId, opened, q.data]);

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
  const review = (v: ExpenseDraft) => { setEditing(null); setDraft(v); setSheet('expense'); };
  const view = (e: Expense) => { setViewing(e); setSheet('receipt'); };
  const removePayment = async (s: Settlement) => {
    if (!confirm(`Delete the payment ${label(s.from)} → ${label(s.to)} ${inr(s.amount)}?`)) return;
    try {
      await action.mutateAsync({ op: 'deleteSettlement', groupId: d.group.id, settlementId: s.id });
      toast({ title: 'Payment deleted' });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <header className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to home" title="Back" className="s-nav-btn" data-back><ArrowLeft className="h-5 w-5" strokeWidth={2.5} /></button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="split-display truncate text-3xl">{d.group.name}</h1>
          <p className="s-muted truncate text-xs"><span aria-hidden>{d.group.emoji ?? KIND_EMOJI[d.group.kind]} </span>{KIND_LABEL[d.group.kind]} · {active.length} people · {inr(total)} spent</p>
        </div>
        <button type="button" className="shrink-0" onClick={() => setSheet('members')} aria-label="People and share link"><AvatarStack names={active.map(m => m.name)} max={3} /></button>
        {d.canManage && (
          <button type="button" onClick={() => setSheet('group')} aria-label="Edit or delete group" title="Group settings" className="s-nav-btn"><MoreHorizontal className="h-5 w-5" strokeWidth={2.5} /></button>
        )}
      </header>

      <Hero
        net={myBalance}
        lines={groupLines(d)}
        onScan={() => setSheet('scan')} onType={() => openExpense(null)} onVoice={() => setSheet('voice')} onSay={() => setSheet('say')}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="s-pill" onClick={() => setSheet('settle')}><HandCoins className="h-4 w-4" /> Settle up</button>
          <button type="button" className="s-pill" onClick={() => setSheet('members')}><Users className="h-4 w-4" /> People</button>
          <button type="button" className="s-pill" onClick={() => setSheet('report')}><FileText className="h-4 w-4" /> Report</button>
        </div>
      </Hero>

      {feed.length === 0 ? (
        <EmptyState title={<>Nothing <em>logged</em> yet</>} body="Add the first expense — dinner, a cab, the rent — and everyone's share is worked out.">
          <button type="button" className="s-pill s-pill-primary" onClick={() => openExpense(null)}><Plus className="h-4 w-4" /> Add expense</button>
        </EmptyState>
      ) : (() => {
        const cur = feed.find(([m]) => m === month) ?? feed[0];
        const pg = pageOf(cur[1], page);
        return (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <label className="s-chip relative inline-flex items-center gap-1" data-on="true">
              <span>{monthLabel(cur[0])}</span><ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
              <select aria-label="Month" className="absolute inset-0 cursor-pointer opacity-0" value={cur[0]} onChange={e => { setMonth(e.target.value); setPage(0); }}>
                {feed.map(([m, its]) => <option key={m} value={m}>{monthLabel(m)} · {its.length}</option>)}
              </select>
            </label>
            <span className="s-muted text-xs">{cur[1].length} {cur[1].length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <ul className="s-card overflow-hidden">
            {pg.items.map(it => it.kind === 'expense' ? (
              <li key={it.e.id}>
                <ExpenseRow e={it.e} me={me} label={label} isOwner={d.isOwnerViewer} onClick={() => view(it.e)} />
              </li>
            ) : (
              <li key={it.s.id} className="s-row text-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--s-tint)]" aria-hidden>💸</span>
                <span className="flex-1">{label(it.s.from)} paid {label(it.s.to)}<span className="s-muted block text-xs">{prettyDate(it.s.date)}{it.s.note ? ` · ${it.s.note}` : ''}</span></span>
                <span className="font-semibold tabular-nums">{inr(it.s.amount)}</span>
                <button type="button" className="s-muted -mr-1 p-2 hover:text-[var(--s-coral)]" aria-label={`Delete payment ${label(it.s.from)} to ${label(it.s.to)}`}
                  onClick={() => removePayment(it.s)} disabled={action.isPending}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          {pg.pages > 1 && (
            <div className="mt-2 flex items-center justify-between px-1 text-sm">
              <button type="button" className="s-chip" disabled={pg.page === 0} onClick={() => { setPage(pg.page - 1); window.scrollTo({ top: 0 }); }}>← Newer</button>
              <span className="s-muted text-xs">Page {pg.page + 1} of {pg.pages}</span>
              <button type="button" className="s-chip" disabled={pg.page === pg.pages - 1} onClick={() => { setPage(pg.page + 1); window.scrollTo({ top: 0 }); }}>Older →</button>
            </div>
          )}
        </section>
        );
      })()}

      <ExpenseSheet open={sheet === 'expense'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} expense={editing} draft={draft} />
      <VoiceSheet open={sheet === 'voice' || sheet === 'scan' || sheet === 'say'} startWithPhoto={sheet === 'scan'} startTyping={sheet === 'say'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} onReview={review} />
      <ReceiptView open={sheet === 'receipt'} onOpenChange={o => !o && setSheet(null)} expense={viewing ? d.expenses.find(x => x.id === viewing.id) ?? viewing : null} detail={d} token={token}
        onEdit={() => { if (viewing) openExpense(d.expenses.find(x => x.id === viewing.id) ?? viewing); }} />
      <SettleSheet open={sheet === 'settle'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} asMember={asMember} />
      <ReportSheet open={sheet === 'report'} onOpenChange={o => !o && setSheet(null)} group={d} />
      <MembersSheet open={sheet === 'members'} onOpenChange={o => !o && setSheet(null)} detail={d} token={token} />
      {d.canManage && <GroupSheet open={sheet === 'group'} onOpenChange={o => !o && setSheet(null)} detail={d} onDeleted={onBack} />}
    </div>
  );
}

function ExpenseRow({ e, me, label, isOwner, onClick }: { e: Expense; me: string | null; label: (id: string) => string; isOwner: boolean; onClick: () => void }) {
  const mine = me ? e.shares[me] ?? 0 : 0;
  const iPaid = e.paidBy === me;
  const impact = iPaid ? e.amount - mine : -mine;
  return (
    <button type="button" onClick={onClick} className="s-row w-full text-left hover:bg-[var(--s-tint)]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--s-line)] bg-[var(--s-card)] text-xl" aria-hidden>{e.emoji ?? '🧾'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{e.description}</span>
        <span className="s-muted block truncate text-xs">
          {iPaid ? 'You' : label(e.paidBy)} paid {inr(e.amount)} · {prettyDate(e.date)}
          {e.meta.receipt && ' · 🧾'}
          {isOwner && mine > 0 && !e.inMySpending && <span className="s-owe"> · not in my spending</span>}
        </span>
      </span>
      <span className="text-right">
        {Math.abs(impact) < 0.01 ? <span className="s-muted text-xs">not involved</span> : impact > 0
          ? <><span className="s-owed block text-sm font-bold tabular-nums">{inr(impact)}</span><span className="s-muted text-[11px]">you lent</span></>
          : <><span className="s-owe block text-sm font-bold tabular-nums">{inr(impact)}</span><span className="s-muted text-[11px]">you borrowed</span></>}
      </span>
    </button>
  );
}

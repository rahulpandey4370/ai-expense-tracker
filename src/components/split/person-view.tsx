import { useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Avatar, BalanceText, EmptyState, inr, monthLabel, prettyDate } from './bits';
import { ReportSheet } from './report-sheet';
import { useSplitPerson } from './use-split';

/** One person: balance, a chip per group, and everything you two shared — by month, newest first. */
export function PersonView({ personKey, onBack, onOpenGroup, onOpenExpense }: {
  personKey: string; onBack: () => void; onOpenGroup: (id: string) => void; onOpenExpense: (groupId: string, expenseId: string) => void;
}) {
  const q = useSplitPerson(personKey);
  const [report, setReport] = useState(false);
  const months = useMemo(() => {
    const by = new Map<string, NonNullable<typeof q.data>['items']>();
    for (const i of q.data?.items ?? []) by.set(i.date.slice(0, 7), [...(by.get(i.date.slice(0, 7)) ?? []), i]);
    return [...by.entries()];
  }, [q.data]);

  if (!q.data) {
    return q.error
      ? <EmptyState title={<>Couldn&apos;t <em>load</em></>} body={(q.error as Error).message} />
      : <div className="flex justify-center py-20"><Loader2 className="s-muted h-6 w-6 animate-spin" /></div>;
  }
  const p = q.data;
  return (
    <div className="space-y-4 pb-8">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to people" className="s-pill h-10 w-10 p-0"><ArrowLeft className="h-4 w-4" /></button>
        <Avatar name={p.name} size={46} />
        <div className="min-w-0 flex-1">
          <h1 className="split-display truncate text-3xl">{p.name}</h1>
          <BalanceText value={p.net} className="text-sm" owedLabel="owes you" oweLabel="you owe" />
        </div>
        <button type="button" className="s-pill" onClick={() => setReport(true)}><FileText className="h-4 w-4" /> Report</button>
      </header>

      <div className="flex flex-wrap gap-2">
        {p.groups.map(g => (
          <button key={g.groupId} type="button" className="s-chip" onClick={() => onOpenGroup(g.groupId)}>
            {g.groupEmoji} {g.groupName}: <span className={g.net > 0 ? 's-owed' : g.net < 0 ? 's-owe' : ''}>{Math.abs(g.net) < 0.01 ? 'settled' : inr(g.net)}</span>
          </button>
        ))}
      </div>

      {months.length === 0 ? (
        <EmptyState title={<>Nothing <em>shared</em> yet</>} body="Expenses you split with this person show up here, newest first." />
      ) : months.map(([m, items]) => (
        <section key={m}>
          <p className="s-muted mb-2 px-1 text-xs font-semibold uppercase tracking-wide">{monthLabel(m)}</p>
          <ul className="s-card overflow-hidden">
            {items.map(i => (
              <li key={i.id}>
                <button type="button" className="s-row w-full text-left hover:bg-[var(--s-tint)]"
                  onClick={() => (i.kind === 'expense' ? onOpenExpense(i.groupId, i.id) : onOpenGroup(i.groupId))}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--s-line)] bg-[var(--s-card)] text-xl" aria-hidden>{i.emoji ?? '🧾'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.title}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="s-group-chip">{i.groupName}</span>
                      <span className="s-muted truncate">{prettyDate(i.date)}{i.kind === 'expense' ? ` · ${i.paidByName} paid ${inr(i.amount)}` : ''}</span>
                    </span>
                  </span>
                  {Math.abs(i.impact) >= 0.01 && (
                    <span className="text-right">
                      <span className={`block text-sm font-bold tabular-nums ${i.impact > 0 ? 's-owed' : 's-owe'}`}>{inr(i.impact)}</span>
                      <span className="s-muted text-[11px]">{i.kind === 'settlement' ? (i.impact < 0 ? 'paid you' : 'you paid') : i.impact > 0 ? 'they owe' : 'you owe'}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ReportSheet open={report} onOpenChange={setReport} person={p} />
    </div>
  );
}

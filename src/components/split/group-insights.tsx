import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import { groupByMonth, groupKpis, monthRange } from '@/lib/split/report';
import { SplitSheet, inr } from './bits';

const short = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
const long = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="s-card min-w-0 p-3">
      <p className="s-muted truncate text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums">{value}</p>
      {note && <p className="s-muted truncate text-xs">{note}</p>}
    </div>
  );
}

/** Four headline numbers under the group hero: the month on screen, plus the whole group. */
export function KpiStrip({ d, month, onMore }: { d: GroupDetail; month: string | null; onMore: () => void }) {
  const m = useMemo(() => (month ? groupKpis(d, monthRange(month).from, monthRange(month).to) : null), [d, month]);
  const all = useMemo(() => groupKpis(d), [d]);
  const mn = month ? short(month) : '';
  return (
    <section aria-label="Group numbers" className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label={`Spent · ${mn || 'month'}`} value={inr(m?.totalSpent ?? 0)} note={`${m?.count ?? 0} ${m?.count === 1 ? 'expense' : 'expenses'}`} />
        {d.meMemberId
          ? <Kpi label={`Your share · ${mn || 'month'}`} value={inr(m?.myShare ?? 0)} note={m && m.myPaid > 0 ? `you paid ${inr(m.myPaid)}` : undefined} />
          : <Kpi label={`Avg expense · ${mn || 'month'}`} value={inr(m?.avgPerExpense ?? 0)} />}
        <Kpi label="Group total" value={inr(all.totalSpent)} note={`${all.count} ${all.count === 1 ? 'expense' : 'expenses'} · all time`} />
        <Kpi label={`Top payer · ${mn || 'month'}`} value={m?.topPayer?.name ?? '—'} note={m?.topPayer ? inr(m.topPayer.paid) : 'nothing paid yet'} />
      </div>
      <button type="button" className="s-pill w-full justify-between" onClick={onMore}>
        More insights <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}

/** Paid vs share for each person: two thin bars, one scale, values at the bar ends. */
function PaidVsShare({ people }: { people: { id: string; name: string; paid: number; share: number }[] }) {
  const max = Math.max(1, ...people.flatMap(p => [p.paid, p.share]));
  const Bar = ({ v, color, label }: { v: number; color: string; label: string }) => (
    <div className="flex items-center gap-2" title={`${label}: ${inr(v)}`}>
      <div className="h-2 flex-1">
        <div className="h-2 rounded-r-[4px]" style={{ width: `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`, background: color }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums">{inr(v)}</span>
    </div>
  );
  return (
    <figure className="space-y-3">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Paid vs share</span>
        <span className="s-muted flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--s-chart-a)' }} />Paid</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--s-chart-b)' }} />Share</span>
        </span>
      </figcaption>
      {people.map(p => (
        <div key={p.id} className="space-y-1">
          <p className="truncate text-xs font-medium">{p.name}</p>
          <Bar v={p.paid} color="var(--s-chart-a)" label={`${p.name} paid`} />
          <Bar v={p.share} color="var(--s-chart-b)" label={`${p.name}'s share`} />
        </div>
      ))}
    </figure>
  );
}

/** Spend per month (last six with activity); the month on screen is the solid bar. */
function SpendByMonth({ months, selected }: { months: { month: string; total: number }[]; selected: string | null }) {
  const max = Math.max(1, ...months.map(m => m.total));
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">Spend by month</figcaption>
      <div className="flex h-32 items-end gap-2 border-b border-[var(--s-line)]" role="list">
        {months.map(m => {
          const on = m.month === selected;
          return (
            <div key={m.month} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${long(m.month)}: ${inr(m.total)}`}>
              {on && <span className="text-[11px] font-semibold tabular-nums">{inr(m.total)}</span>}
              <div className="w-full max-w-10 rounded-t-[4px]" style={{ height: `${Math.max(2, (m.total / max) * 100)}%`, background: 'var(--s-chart-a)', opacity: on ? 1 : 0.35 }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {months.map(m => <span key={m.month} className={`flex-1 text-center text-[11px] ${m.month === selected ? 'font-semibold' : 's-muted'}`}>{short(m.month)}</span>)}
      </div>
    </figure>
  );
}

/** The full picture: this month or all time, per person, charts, and who owes whom right now. */
export function InsightsSheet({ open, onOpenChange, d, month }: { open: boolean; onOpenChange: (o: boolean) => void; d: GroupDetail; month: string | null }) {
  const [scope, setScope] = useState<'month' | 'all'>(month ? 'month' : 'all');
  const useMonth = scope === 'month' && !!month;
  const k = useMemo(() => (useMonth ? groupKpis(d, monthRange(month!).from, monthRange(month!).to) : groupKpis(d)), [d, month, useMonth]);
  const months = useMemo(() => groupByMonth(d, 6), [d]);
  const me = d.meMemberId;
  const name = (id: string) => (id === me ? 'You' : d.members.find(m => m.id === id)?.name ?? 'Someone');
  const stats: [string, string][] = [
    ['Spent', inr(k.totalSpent)],
    ['Expenses', String(k.count)],
    ['Average per expense', inr(k.avgPerExpense)],
    ['Average per day', inr(k.avgPerDay)],
    ['Biggest', k.biggest ? `${k.biggest.description} · ${inr(k.biggest.amount)}` : '—'],
    ['Payments made', inr(k.paymentsTotal)],
  ];

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>Group <em>insights</em></>}>
      <div className="space-y-5">
        <div className="flex gap-2" role="radiogroup" aria-label="Period">
          {month && <button type="button" role="radio" aria-checked={useMonth} className="s-chip" data-on={useMonth} onClick={() => setScope('month')}>{long(month)}</button>}
          <button type="button" role="radio" aria-checked={!useMonth} className="s-chip" data-on={!useMonth} onClick={() => setScope('all')}>All time</button>
        </div>

        <dl className="s-card grid grid-cols-2 gap-x-4 gap-y-3 p-4">
          {stats.map(([l, v]) => (
            <div key={l} className="min-w-0">
              <dt className="s-muted text-[11px] font-semibold uppercase tracking-wide">{l}</dt>
              <dd className="truncate font-semibold tabular-nums" title={v}>{v}</dd>
            </div>
          ))}
        </dl>

        <section className="s-card overflow-hidden">
          <p className="s-muted px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide">Each person</p>
          <table className="w-full text-sm">
            <thead><tr className="s-muted text-xs"><th className="px-4 py-2 text-left font-medium">Person</th><th className="py-2 text-right font-medium">Paid</th><th className="py-2 text-right font-medium">Share</th><th className="px-4 py-2 text-right font-medium">Net</th></tr></thead>
            <tbody>
              {k.people.map(p => (
                <tr key={p.id} className="border-t border-[var(--s-line)]">
                  <td className="max-w-[8rem] truncate px-4 py-2">{p.name}</td>
                  <td className="py-2 text-right tabular-nums">{inr(p.paid)}</td>
                  <td className="py-2 text-right tabular-nums">{inr(p.share)}</td>
                  <td className={`px-4 py-2 text-right font-semibold tabular-nums ${p.net > 0.005 ? 's-owed' : p.net < -0.005 ? 's-owe' : ''}`}>{p.net > 0.005 ? '+' : p.net < -0.005 ? '−' : ''}{inr(Math.abs(p.net))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="s-muted px-4 pb-3 pt-1 text-xs">Net = paid − share, plus payments sent, minus payments received, in this period.</p>
        </section>

        <section className="s-card p-4"><PaidVsShare people={k.people} /></section>
        {months.length > 0 && <section className="s-card p-4"><SpendByMonth months={months} selected={month} /></section>}

        <section className="s-card p-4">
          <p className="text-sm font-semibold">Who owes whom now</p>
          <p className="s-muted mb-2 text-xs">All time, fewest payments.</p>
          {d.transfers.length === 0 ? <p className="text-sm">Everyone is square.</p> : (
            <ul className="space-y-1 text-sm">
              {d.transfers.map((t, i) => <li key={i}><strong>{name(t.from)}</strong> {t.from === me ? 'pay' : 'pays'} <strong>{name(t.to)}</strong> <span className="tabular-nums">{inr(t.amount)}</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </SplitSheet>
  );
}

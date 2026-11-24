import { useEffect, useState } from 'react';
import { FileText, Loader2, Pencil } from 'lucide-react';
import type { Expense, GroupDetail } from '@/lib/split/types';
import { SplitSheet, prettyDate } from './bits';
import { splitApi } from './use-split';

const num = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Puts an italic accent on the first "split"/"paid"/"each" in what was said, like a hand-written note. */
function Quote({ text }: { text: string }) {
  const m = [/\bsplit\b/i, /\beach\b/i, /\bcovers?\b/i, /\bpaid\b/i].map(r => r.exec(text)).find(Boolean);
  if (!m) return <>&ldquo;{text}&rdquo;</>;
  return <>&ldquo;{text.slice(0, m.index)}<em>{m[0]}</em>{text.slice(m.index + m[0].length)}&rdquo;</>;
}

/** Tapping an expense: the paper-receipt breakdown (what was said, lines, each person's total) + photo. */
export function ReceiptView({ open, onOpenChange, expense: e, detail, token, onEdit }: {
  open: boolean; onOpenChange: (o: boolean) => void; expense: Expense | null; detail: GroupDetail; token?: string; onEdit: () => void;
}) {
  const [photo, setPhoto] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  useEffect(() => {
    setPhoto(null);
    if (!open || !e?.meta.receipt) return;
    setLoadingPhoto(true);
    splitApi<{ url: string; isPdf: boolean }>('receiptUrl', { groupId: detail.group.id, expenseId: e.id }, token)
      .then(setPhoto).catch(() => setPhoto(null)).finally(() => setLoadingPhoto(false));
  }, [open, e?.id, e?.meta.receipt, detail.group.id, token]);

  if (!e) return null;
  const me = detail.meMemberId;
  const name = (id: string) => (id === me ? 'You' : detail.members.find(m => m.id === id)?.name ?? 'Someone');
  const people = Object.entries(e.shares);
  const items = e.meta.items ?? [];
  const everyone = people.length;

  // Middle lines: how the bill was divided.
  const lines: [string, string][] = [];
  if (e.method === 'items') {
    for (const it of items) {
      const shared = it.memberIds.length;
      lines.push(shared > 1
        ? [`${it.name}, ${shared} ways`, `${num(it.amount / shared)} each`]
        : [`${it.name} · ${name(it.memberIds[0])}`, num(it.amount)]);
    }
  } else if (e.method === 'cover') {
    lines.push([`${name(e.meta.coveredBy ?? people[0]?.[0] ?? '')} covers it`, num(e.amount)]);
  } else if (e.method === 'equal') {
    lines.push([`Split ${everyone} ways`, `${num(e.amount / Math.max(everyone, 1))} each`]);
  } else {
    for (const [id, v] of people) {
      const raw = e.meta.values?.[id];
      const tag = e.method === 'percent' && raw != null ? ` (${raw}%)` : e.method === 'shares' && raw != null ? ` (×${raw})` : '';
      lines.push([`${name(id)}${tag}`, num(v)]);
    }
  }

  // Per-person totals, naming what only they had ("Maya + wine").
  const solo = (id: string) => items.filter(it => it.memberIds.length === 1 && it.memberIds[0] === id).map(it => it.name.toLowerCase());
  const mine = me ? e.shares[me] ?? 0 : 0;
  const footer = e.paidBy === me
    ? (e.amount - mine > 0.009 ? `You lent ${num(e.amount - mine)}` : 'All yours')
    : mine > 0 ? `You owe ${name(e.paidBy)} ${num(mine)}` : 'You weren’t in this one';

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>{e.emoji ?? '🧾'} {e.description}</>}>
      <div className="space-y-6 pb-2">
        {e.meta.receipt && (
          <div className="s-card overflow-hidden">
            {loadingPhoto ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="s-muted h-5 w-5 animate-spin" /></div>
            ) : photo?.isPdf ? (
              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-4 font-semibold"><FileText className="h-5 w-5" /> Open receipt PDF</a>
            ) : photo ? (
              <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Receipt for ${e.description}`} className="max-h-80 w-full object-contain bg-[var(--s-tint)]" /></a>
            ) : (
              <p className="s-muted p-4 text-sm">Couldn&apos;t load the receipt photo.</p>
            )}
          </div>
        )}

        <div className="px-2">
          <article className="s-receipt" aria-label="Receipt breakdown">
            <div className="r-row r-muted text-[0.72rem]"><span>finwise · {detail.group.name.toLowerCase()}</span><span>{prettyDate(e.date)}</span></div>
            {e.meta.said && <p className="r-quote mt-2"><Quote text={e.meta.said} /></p>}
            <div className="r-rule" />
            <div className="r-row font-semibold uppercase"><span>{e.description} · {name(e.paidBy)} paid</span><span>{num(e.amount)}</span></div>
            {lines.map(([l, r], i) => <div key={i} className="r-row"><span>{l}</span><span>{r}</span></div>)}
            <div className="r-rule" />
            {people.map(([id, v]) => (
              <div key={id} className="r-row">
                <span>{name(id)}{solo(id).length ? ` + ${solo(id).join(', ')}` : ''}</span><span>{num(v)}</span>
              </div>
            ))}
            <div className="r-rule" />
            <div className="r-row font-semibold"><span>{footer}</span><span>₹</span></div>
          </article>
        </div>

        <button type="button" className="s-pill w-full" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit expense</button>
      </div>
    </SplitSheet>
  );
}

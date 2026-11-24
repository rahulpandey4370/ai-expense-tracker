import { useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2, MessageCircle, Undo2 } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, SplitSheet, inr, prettyDate, todayYmd } from './bits';
import { useSplitAction } from './use-split';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: GroupDetail;
  token?: string;
  asMember?: string | null;
}

export function upiLink(upiId: string, payee: string, amount: number, note: string) {
  const q = new URLSearchParams({ pa: upiId, pn: payee, am: amount.toFixed(2), cu: 'INR', tn: note.slice(0, 40) });
  return `upi://pay?${q.toString()}`;
}

export function SettleSheet({ open, onOpenChange, detail, token, asMember }: Props) {
  const { toast } = useToast();
  const action = useSplitAction(token);
  const me = detail.meMemberId;
  const people = detail.members.filter(m => !m.removed);
  const member = (id: string) => detail.members.find(m => m.id === id);
  const label = (id: string) => (id === me ? 'You' : member(id)?.name ?? '?');

  const [custom, setCustom] = useState({ from: '', to: '', amount: '', note: '' });
  useEffect(() => {
    if (open) setCustom({ from: me ?? '', to: people.find(p => p.id !== me)?.id ?? '', amount: '', note: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const record = async (from: string, to: string, amount: number, note?: string) => {
    try {
      await action.mutateAsync({ op: 'settle', groupId: detail.group.id, from, to, amount, date: todayYmd(), note, asMember });
      toast({ title: `Marked as paid · ${label(from)} → ${label(to)} ${inr(amount)}` });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const undo = async (settlementId: string) => {
    try {
      await action.mutateAsync({ op: 'deleteSettlement', groupId: detail.group.id, settlementId });
      toast({ title: 'Payment removed' });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const remind = (from: string, amount: number) => {
    const upi = member(me ?? '')?.upiId;
    const text = `Hey ${member(from)?.name}, quick reminder: you owe me ${inr(amount)} for "${detail.group.name}".`
      + (upi ? ` UPI: ${upi}` : '');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>Settle <em>up</em></>}>
      <div className="space-y-5">
        <section>
          <p className="s-muted mb-2 text-sm">Fewest payments to clear everything:</p>
          {detail.transfers.length === 0 ? (
            <div className="s-hero p-5 text-center">
              <p className="split-display text-2xl">Everyone&apos;s <em>square</em>.</p>
            </div>
          ) : (
            <ul className="s-card">
              {detail.transfers.map((t, i) => {
                const payee = member(t.to);
                return (
                  <li key={i} className="s-row flex-wrap">
                    <Avatar name={member(t.from)?.name ?? '?'} size={30} />
                    <ArrowRight className="s-muted h-4 w-4" />
                    <Avatar name={payee?.name ?? '?'} size={30} />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{label(t.from)}</span> {t.from === me ? 'pay' : 'pays'} <span className="font-semibold">{label(t.to)}</span>
                      <div className="split-display text-xl">{inr(t.amount)}</div>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      {t.from === me && payee?.upiId && (
                        <a className="s-pill flex-1 sm:flex-none" href={upiLink(payee.upiId, payee.name, t.amount, detail.group.name)}>Pay via UPI</a>
                      )}
                      {t.to === me && (
                        <button type="button" className="s-pill flex-1 sm:flex-none" onClick={() => remind(t.from, t.amount)}>
                          <MessageCircle className="h-4 w-4" /> Remind
                        </button>
                      )}
                      <button type="button" className="s-pill s-pill-primary flex-1 sm:flex-none" disabled={action.isPending} onClick={() => record(t.from, t.to, t.amount)}>
                        <Check className="h-4 w-4" /> Mark as paid
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="s-card space-y-3 p-3">
          <p className="text-sm font-semibold">Record a different payment</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <select className="s-input text-sm" aria-label="From" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}>
              {people.map(p => <option key={p.id} value={p.id}>{label(p.id)}</option>)}
            </select>
            <ArrowRight className="s-muted h-4 w-4" />
            <select className="s-input text-sm" aria-label="To" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}>
              {people.map(p => <option key={p.id} value={p.id}>{label(p.id)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input className="s-input" inputMode="decimal" placeholder="₹ amount" aria-label="Amount" value={custom.amount}
              onChange={e => setCustom(c => ({ ...c, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
            <input className="s-input" placeholder="Note (optional)" aria-label="Note" value={custom.note} maxLength={200}
              onChange={e => setCustom(c => ({ ...c, note: e.target.value }))} />
          </div>
          <button
            type="button" className="s-pill w-full"
            disabled={action.isPending || !(parseFloat(custom.amount) > 0) || custom.from === custom.to}
            onClick={() => record(custom.from, custom.to, parseFloat(custom.amount), custom.note || undefined).then(() => setCustom(c => ({ ...c, amount: '', note: '' })))}
          >
            {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
          </button>
        </section>

        {detail.settlements.length > 0 && (
          <section>
            <p className="s-muted mb-2 text-xs font-semibold uppercase tracking-wide">Payments</p>
            <ul className="s-card">
              {detail.settlements.slice(0, 15).map(s => (
                <li key={s.id} className="s-row text-sm">
                  <span className="flex-1">
                    {label(s.from)} paid {label(s.to)} <strong>{inr(s.amount)}</strong>
                    <span className="s-muted"> · {prettyDate(s.date)}{s.note ? ` · ${s.note}` : ''}</span>
                  </span>
                  <button type="button" className="s-muted p-1" aria-label="Undo payment" onClick={() => undo(s.id)}><Undo2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </SplitSheet>
  );
}

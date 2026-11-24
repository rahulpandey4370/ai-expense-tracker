import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { resolveShares, type SplitMethod } from '@/lib/split/math';
import type { Expense, GroupDetail, SplitItem } from '@/lib/split/types';
import { useCategories, usePaymentMethods } from '@/hooks/use-finance-queries';
import { useToast } from '@/hooks/use-toast';
import { Avatar, SplitSheet, emojiFor, inr, todayYmd } from './bits';
import { useSplitAction } from './use-split';
import { toDataUri } from '@/lib/attachment';

const METHODS: { id: SplitMethod; label: string }[] = [
  { id: 'equal', label: 'Equally' },
  { id: 'exact', label: 'Exact ₹' },
  { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' },
  { id: 'items', label: 'Item by item' },
  { id: 'cover', label: 'One covers it' },
];

const SPENDING_KEY = 'split-spending-defaults';
type ExpenseType = 'need' | 'want' | 'investment' | 'investment_expense';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: GroupDetail;
  token?: string;
  asMember?: string | null;
  expense?: Expense | null;
  /** Prefill from "Say it" for review (a new expense, not an edit). */
  draft?: ExpenseDraft | null;
  /** Shown above the form (e.g. a group switcher). */
  header?: React.ReactNode;
  /** Prefill the owner's spending fields (from the transaction form / SMS). */
  spendingDefaults?: Partial<{ categoryId: string; paymentMethodId: string; expenseType: ExpenseType }>;
  onSaved?: (expenseId: string) => void;
}

export interface ExpenseDraft {
  description: string; amount: number | null; date: string | null; paidBy: string; method: SplitMethod; meta: Expense['meta'];
  /** Words it came from (voice/SMS/chat), kept for the receipt view. */
  said?: string;
  /** A photo to attach once saved (scan, AI entry receipt). */
  receiptDataUri?: string;
}

export function ExpenseSheet({ open, onOpenChange, detail, token, asMember, expense, draft, header, spendingDefaults, onSaved }: Props) {
  const { toast } = useToast();
  const action = useSplitAction(token);
  const people = detail.members.filter(m => !m.removed);
  const me = detail.meMemberId;
  const name = (id: string) => detail.members.find(m => m.id === id)?.name ?? '?';
  const label = (id: string) => (id === me ? 'You' : name(id));

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [paidBy, setPaidBy] = useState<string>('');
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [participants, setParticipants] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [items, setItems] = useState<{ name: string; amount: string; memberIds: string[] }[]>([]);
  const [coveredBy, setCoveredBy] = useState<string>('');
  const [inSpending, setInSpending] = useState(true);
  const [receipt, setReceipt] = useState<string | null>(null); // data URI waiting to be attached on save
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [spending, setSpending] = useState<{ categoryId: string; paymentMethodId: string; expenseType: ExpenseType }>({ categoryId: '', paymentMethodId: '', expenseType: 'want' });

  // Reset the form every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const all = people.map(m => m.id);
    const src = expense ?? draft;
    setAmount(src?.amount ? String(src.amount) : '');
    setDescription(src?.description ?? '');
    setDate(src?.date ?? todayYmd());
    setPaidBy(src?.paidBy ?? me ?? all[0] ?? '');
    setMethod(src?.method ?? 'equal');
    setParticipants(src?.meta.participants?.length ? src.meta.participants : all);
    setValues(Object.fromEntries(Object.entries(src?.meta.values ?? {}).map(([k, v]) => [k, String(v)])));
    setItems((src?.meta.items ?? []).map(i => ({ name: i.name, amount: String(i.amount), memberIds: i.memberIds })));
    setCoveredBy(src?.meta.coveredBy ?? '');
    setInSpending(!expense || expense.inMySpending);
    try {
      const saved = JSON.parse(localStorage.getItem(SPENDING_KEY) ?? 'null');
      if (saved) setSpending(saved);
    } catch {}
    if (spendingDefaults) setSpending(s => ({ ...s, ...Object.fromEntries(Object.entries(spendingDefaults).filter(([, v]) => v)) }));
    setReceipt(draft?.receiptDataUri ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id, draft]);

  // Quick-split rows mirror a transaction; the server rejects edits, so say where to make them.
  const bridged = !!expense?.id.startsWith('legacy_');
  const total = parseFloat(amount) || 0;
  const num = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, parseFloat(v) || 0]));
  const parsedItems: SplitItem[] = items.map(i => ({ name: i.name, amount: parseFloat(i.amount) || 0, memberIds: i.memberIds }));
  const preview = useMemo(
    () => resolveShares(total, method, { participants, values: num(values), items: parsedItems, coveredBy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, method, participants, values, items, coveredBy],
  );

  const owner = detail.isOwnerViewer;
  const ownerInvolved = owner && !!me && ((preview.shares[me] ?? 0) > 0 || paidBy === me);
  const showSpending = ownerInvolved && (!expense || !expense.inMySpending);
  const categories = useCategories(owner);
  const methods = usePaymentMethods(owner); // owner-only data; friends never fetch it
  const expenseCats = (categories.data ?? []).filter(c => c.type === 'expense');

  const toggle = (id: string) => setParticipants(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const save = async () => {
    if (!description.trim()) return toast({ title: 'Add a description', variant: 'destructive' });
    if (preview.error) return toast({ title: preview.error, variant: 'destructive' });
    const wantSpending = showSpending && inSpending;
    if (wantSpending && (!spending.categoryId || !spending.paymentMethodId)) {
      return toast({ title: 'Pick a category and payment method for your spending', variant: 'destructive' });
    }
    if (wantSpending) try { localStorage.setItem(SPENDING_KEY, JSON.stringify(spending)); } catch {}
    try {
      const res = await action.mutateAsync({
        op: 'saveExpense', groupId: detail.group.id, id: expense?.id, description: description.trim(), amount: total, date,
        emoji: emojiFor(description), method, paidBy, participants, values: num(values), items: parsedItems,
        coveredBy: coveredBy || undefined, asMember, spending: wantSpending ? spending : undefined,
        said: !expense ? draft?.said : undefined,
      });
      const savedId: string = res.id;
      if (receipt) {
        // The expense is saved either way; a failed upload just says so.
        await action.mutateAsync({ op: 'attachReceipt', groupId: detail.group.id, expenseId: savedId, dataUri: receipt })
          .catch((e: any) => toast({ title: `Saved, but the receipt didn't upload: ${e.message}`, variant: 'destructive' }));
      }
      toast({ title: expense ? 'Expense updated' : 'Expense added' });
      onOpenChange(false);
      onSaved?.(savedId);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!expense || !confirm(`Delete "${expense.description}"?`)) return;
    try {
      await action.mutateAsync({ op: 'deleteExpense', groupId: detail.group.id, expenseId: expense.id });
      toast({ title: 'Expense deleted' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={expense ? <>Edit <em>expense</em></> : <>Add an <em>expense</em></>}>
      <div className="space-y-5">
        {header}
        {/* Amount + what */}
        <div className="s-hero flex flex-col gap-3 p-4">
          <div className="flex items-baseline gap-1">
            <span className="split-display text-3xl s-muted">₹</span>
            <input
              inputMode="decimal" autoFocus={!expense} placeholder="0" aria-label="Amount"
              value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              className="split-display w-full bg-transparent text-5xl outline-none placeholder:text-[var(--s-sec)]/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>{emojiFor(description)}</span>
            <input className="s-input" placeholder="What was it for?" aria-label="Description" value={description} onChange={e => setDescription(e.target.value)} maxLength={120} />
          </div>
          <input type="date" className="s-input w-auto self-start text-sm" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {/* Paid by */}
        <section>
          <p className="s-muted mb-2 text-xs font-semibold uppercase tracking-wide">Paid by</p>
          <div className="flex flex-wrap gap-2">
            {people.map(m => (
              <button key={m.id} type="button" className="s-chip inline-flex items-center gap-1.5" data-on={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
                <Avatar name={m.name} size={18} /> {label(m.id)}
              </button>
            ))}
          </div>
        </section>

        {/* Split method */}
        <section>
          <p className="s-muted mb-2 text-xs font-semibold uppercase tracking-wide">Split</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m => (
              <button key={m.id} type="button" className="s-chip" data-on={method === m.id} onClick={() => setMethod(m.id)}>{m.label}</button>
            ))}
          </div>
        </section>

        {/* Method body */}
        {method === 'cover' ? (
          <section className="s-card p-3">
            <p className="s-muted mb-2 text-sm">Who covers the whole bill?</p>
            <div className="flex flex-wrap gap-2">
              {people.map(m => (
                <button key={m.id} type="button" className="s-chip" data-on={coveredBy === m.id} onClick={() => setCoveredBy(m.id)}>{label(m.id)}</button>
              ))}
            </div>
          </section>
        ) : method === 'items' ? (
          <section className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="s-card space-y-2 p-3">
                <div className="flex gap-2">
                  <input className="s-input" placeholder="Item" aria-label="Item name" value={it.name}
                    onChange={e => setItems(xs => xs.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                  <input className="s-input w-28" inputMode="decimal" placeholder="₹" aria-label="Item amount" value={it.amount}
                    onChange={e => setItems(xs => xs.map((x, i) => (i === idx ? { ...x, amount: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
                  <button type="button" aria-label="Remove item" className="s-muted px-1" onClick={() => setItems(xs => xs.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {people.map(m => (
                    <button key={m.id} type="button" className="s-chip" data-on={it.memberIds.includes(m.id)}
                      onClick={() => setItems(xs => xs.map((x, i) => (i === idx ? { ...x, memberIds: x.memberIds.includes(m.id) ? x.memberIds.filter(y => y !== m.id) : [...x.memberIds, m.id] } : x)))}>
                      {label(m.id)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="s-pill w-full" onClick={() => setItems(xs => [...xs, { name: '', amount: '', memberIds: people.map(p => p.id) }])}>
              <Plus className="h-4 w-4" /> Add item
            </button>
          </section>
        ) : (
          <section className="s-card">
            {people.map(m => {
              const on = participants.includes(m.id);
              return (
                <div key={m.id} className="s-row">
                  <button type="button" onClick={() => toggle(m.id)} className="flex flex-1 items-center gap-3 text-left" aria-pressed={on}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${on ? 'border-transparent bg-[var(--s-deep)] text-white' : 'border-[var(--s-line)]'}`}>{on ? '✓' : ''}</span>
                    <Avatar name={m.name} size={30} />
                    <span className="font-medium">{label(m.id)}</span>
                  </button>
                  {on && method !== 'equal' && (
                    <div className="flex items-center gap-1">
                      {method === 'exact' && <span className="s-muted text-sm">₹</span>}
                      <input className="s-input w-24 py-1.5 text-right" inputMode="decimal" aria-label={`${m.name} ${method}`}
                        placeholder={method === 'shares' ? '1' : '0'} value={values[m.id] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))} />
                      {method === 'percent' && <span className="s-muted text-sm">%</span>}
                      {method === 'shares' && <span className="s-muted text-sm">×</span>}
                    </div>
                  )}
                  <span className="w-20 text-right text-sm tabular-nums s-muted">{on && preview.shares[m.id] ? inr(preview.shares[m.id]) : ''}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* Review */}
        {total > 0 && (
          <section className="s-card p-3">
            <p className="s-muted mb-1 text-xs font-semibold uppercase tracking-wide">Review</p>
            {preview.error ? (
              <p className="s-owe text-sm font-medium">{preview.error}{method === 'items' && preview.error.includes('left') ? ' — tax or tip? add it as an item' : ''}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Object.entries(preview.shares).map(([id, v]) => (
                  <li key={id} className="flex justify-between">
                    <span>{label(id)}{id === paidBy ? ` paid ${inr(total)}` : ''}</span>
                    <span className="tabular-nums">{id === paidBy ? <span className="s-owed">gets back {inr(total - v)}</span> : <span className="s-owe">owes {inr(v)}</span>}</span>
                  </li>
                ))}
                {!(paidBy in preview.shares) && <li className="s-owed">{label(paidBy)} paid {inr(total)} and gets it all back</li>}
              </ul>
            )}
          </section>
        )}

        {/* Receipt photo */}
        {!bridged && (
          <section className="s-card flex items-center gap-3 p-3">
            {receipt ? (
              receipt.startsWith('data:application/pdf')
                ? <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--s-tint)] text-xs font-semibold">PDF</span>
                : <img src={receipt} alt="Receipt to attach" className="h-14 w-14 rounded-lg object-cover" />
            ) : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--s-tint)] text-2xl" aria-hidden>🧾</span>}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{receipt ? 'Receipt attached' : expense?.meta.receipt ? 'Has a receipt' : 'Receipt photo'}</p>
              <p className="s-muted text-xs">{receipt ? 'Saved with the expense; everyone in the group can view it.' : 'Optional. Everyone in the group can view it.'}</p>
            </div>
            <label className="s-pill cursor-pointer px-3 py-1.5 text-xs">
              {receiptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : receipt || expense?.meta.receipt ? 'Replace' : 'Add'}
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={async ev => {
                const f = ev.target.files?.[0]; if (!f) return;
                setReceiptBusy(true);
                try { setReceipt(await toDataUri(f)); } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
                finally { setReceiptBusy(false); ev.target.value = ''; }
              }} />
            </label>
          </section>
        )}

        {/* Owner: personal spending */}
        {showSpending && (
          <section className="s-card space-y-3 p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Add my share to my spending
              <input type="checkbox" className="h-5 w-5 accent-[var(--s-deep)]" checked={inSpending} onChange={e => setInSpending(e.target.checked)} />
            </label>
            {inSpending && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select className="s-input text-sm" aria-label="Category" value={spending.categoryId} onChange={e => setSpending(s => ({ ...s, categoryId: e.target.value }))}>
                  <option value="">Category…</option>
                  {expenseCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="s-input text-sm" aria-label="Payment method" value={spending.paymentMethodId} onChange={e => setSpending(s => ({ ...s, paymentMethodId: e.target.value }))}>
                  <option value="">Paid with…</option>
                  {(methods.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="s-input text-sm" aria-label="Expense type" value={spending.expenseType} onChange={e => setSpending(s => ({ ...s, expenseType: e.target.value as ExpenseType }))}>
                  <option value="need">Need</option>
                  <option value="want">Want</option>
                  <option value="investment_expense">Investment expense</option>
                </select>
              </div>
            )}
          </section>
        )}

        {bridged && (
          <p className="s-card s-muted p-3 text-sm">This came from a transaction. Edit or delete it on the <a className="s-owed font-semibold underline" href="/transactions">Transactions</a> page; settle it here.</p>
        )}
        <div className={bridged ? 'hidden' : 'flex gap-2'}>
          {expense && (
            <button type="button" className="s-pill" onClick={remove} disabled={action.isPending} aria-label="Delete expense"><Trash2 className="h-4 w-4" /></button>
          )}
          <button type="button" className="s-pill s-pill-primary flex-1 py-3 text-base" onClick={save} disabled={action.isPending || !total}>
            {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {expense ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </div>
    </SplitSheet>
  );
}

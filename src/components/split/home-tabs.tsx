import { useState } from 'react';
import { ChevronRight, Loader2, Plus, X } from 'lucide-react';
import type { GroupKind, HomeData } from '@/lib/split/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, BalanceText, EmptyState, KIND_EMOJI, KIND_LABEL, SplitSheet, inr, prettyDate } from './bits';
import { useSplitAction } from './use-split';

/** Home: the headline balance, then groups by recent activity. */
export function HomeTab({ data, onOpenGroup }: { data: HomeData; onOpenGroup: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const net = data.totals.owed - data.totals.owe;
  const active = data.groups.filter(g => !g.archived);
  const archived = data.groups.filter(g => g.archived);

  return (
    <div className="space-y-5">
      <section className="s-hero p-6">
        <p className="s-muted text-sm">Hi {data.me.name.split(' ')[0]}</p>
        {Math.abs(net) < 0.01 && data.totals.owed < 0.01 ? (
          <p className="split-display mt-1 text-4xl">You&apos;re all <em>square</em>.</p>
        ) : (
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <p className="split-display text-3xl">{net >= 0 ? <>You&apos;re <em>owed</em></> : <>You <em>owe</em></>}</p>
            <p className={`text-4xl font-bold tabular-nums ${net >= 0 ? 's-owed' : 's-owe'}`}>{inr(net)}</p>
          </div>
        )}
        {(data.totals.owed > 0 || data.totals.owe > 0) && (
          <p className="s-muted mt-2 text-sm">
            <span className="s-owed font-semibold">{inr(data.totals.owed)}</span> coming back · <span className="s-owe font-semibold">{inr(data.totals.owe)}</span> to pay
          </p>
        )}
        <button type="button" className="s-pill s-pill-primary mt-4" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New group</button>
      </section>

      {data.unlinked.length > 0 && (
        <section className="s-card p-4">
          <p className="text-sm font-semibold">Not in your spending yet</p>
          <p className="s-muted mb-2 text-xs">Friends added these and you have a share. Open one and save it to count it in your budget.</p>
          {data.unlinked.slice(0, 4).map(u => (
            <button key={u.expenseId} type="button" onClick={() => onOpenGroup(u.groupId)} className="flex w-full items-center justify-between py-1.5 text-left text-sm">
              <span className="truncate">{u.description} <span className="s-muted">· {u.groupName} · {prettyDate(u.date)}</span></span>
              <span className="s-owe font-semibold">{inr(u.myShare)}</span>
            </button>
          ))}
        </section>
      )}

      {active.length === 0 ? (
        <EmptyState title={<>Start a <em>group</em></>} body="A trip, your flat, a couple, or one dinner — add people and start logging who paid.">
          <button type="button" className="s-pill s-pill-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New group</button>
        </EmptyState>
      ) : (
        <ul className="s-card overflow-hidden">
          {active.map(g => (
            <li key={g.id}>
              <button type="button" className="s-row w-full text-left hover:bg-[var(--s-tint)]" onClick={() => onOpenGroup(g.id)}>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--s-tint)] text-2xl" aria-hidden>{g.emoji ?? KIND_EMOJI[g.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="s-muted block text-xs">{KIND_LABEL[g.kind]} · {g.memberCount} people · {inr(g.totalSpent)}</span>
                </span>
                <BalanceText value={g.myBalance} className="text-right text-xs" />
                <ChevronRight className="s-muted h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && <p className="s-muted text-center text-xs">{archived.length} archived group(s)</p>}
      <CreateGroupSheet open={creating} onOpenChange={setCreating} onCreated={onOpenGroup} />
    </div>
  );
}

/** People: net with each person across every shared group. */
export function PeopleTab({ data, onOpenGroup }: { data: HomeData; onOpenGroup: (id: string) => void }) {
  if (data.people.length === 0) {
    return <EmptyState title={<>No one owes <em>anyone</em></>} body="When a group has open balances, the people you owe and who owe you show up here." />;
  }
  return (
    <ul className="space-y-3">
      {data.people.map(p => (
        <li key={p.key} className="s-card p-4">
          <div className="flex items-center gap-3">
            <Avatar name={p.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <BalanceText value={p.net} className="text-sm" owedLabel="owes you" oweLabel="you owe" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.groups.map(g => (
              <button key={g.groupId} type="button" className="s-chip" onClick={() => onOpenGroup(g.groupId)}>
                {g.groupName}: <span className={g.net > 0 ? 's-owed' : 's-owe'}>{inr(g.net)}</span> · Settle
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Activity: newest expenses and payments across groups. */
export function ActivityTab({ data, onOpenGroup }: { data: HomeData; onOpenGroup: (id: string) => void }) {
  if (data.activity.length === 0) return <EmptyState title={<>All <em>quiet</em></>} body="Expenses and payments from your groups will show up here." />;
  return (
    <ul className="s-card overflow-hidden">
      {data.activity.map(a => (
        <li key={a.id}>
          <button type="button" onClick={() => onOpenGroup(a.groupId)} className="s-row w-full text-left hover:bg-[var(--s-tint)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--s-tint)]" aria-hidden>{a.kind === 'settlement' ? '💸' : '🧾'}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{a.kind === 'expense' ? `${a.who} added "${a.title}"` : a.title}</span>
              <span className="s-muted block text-xs">{a.groupName} · {new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {inr(a.amount)}</span>
            </span>
            {Math.abs(a.myImpact) >= 0.01 && (
              <span className={`text-xs font-semibold ${a.myImpact > 0 ? 's-owed' : 's-owe'}`}>
                {a.kind === 'settlement' ? (a.myImpact > 0 ? 'received ' : 'paid ') : a.myImpact > 0 ? 'lent ' : 'owe '}{inr(a.myImpact)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Insights: what my share came to, per month and per group. */
export function InsightsTab({ data }: { data: HomeData }) {
  const max = Math.max(1, ...data.spentByMonth.map(m => m.amount));
  const groups = [...data.groups].filter(g => g.myShareTotal > 0).sort((a, b) => b.myShareTotal - a.myShareTotal);
  const gmax = Math.max(1, ...groups.map(g => g.myShareTotal));
  if (data.spentByMonth.length === 0) return <EmptyState title={<>Nothing to <em>chart</em> yet</>} body="Once you're part of a few expenses, your share per month and per group appears here." />;
  const thisMonth = data.spentByMonth.at(-1)!;
  return (
    <div className="space-y-4">
      <section className="s-hero p-5">
        <p className="s-muted text-sm">Your share, {new Date(`${thisMonth.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long' })}</p>
        <p className="split-display text-4xl">{inr(thisMonth.amount)}</p>
      </section>
      <section className="s-card p-4">
        <p className="mb-3 text-sm font-semibold">Month by month</p>
        <div className="flex h-36 items-end gap-2" role="img" aria-label="Your share of group spending by month">
          {data.spentByMonth.map(m => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-md bg-[var(--s-accent)]" style={{ height: `${Math.max(4, (m.amount / max) * 100)}%` }} title={`${m.month}: ${inr(m.amount)}`} />
              <span className="s-muted text-[10px]">{new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="s-card p-4">
        <p className="mb-3 text-sm font-semibold">By group</p>
        <ul className="space-y-2">
          {groups.map(g => (
            <li key={g.id} className="text-sm">
              <div className="flex justify-between"><span>{g.emoji ?? KIND_EMOJI[g.kind]} {g.name}</span><span className="tabular-nums">{inr(g.myShareTotal)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-[var(--s-tint)]"><div className="h-2 rounded-full bg-[var(--s-accent)]" style={{ width: `${(g.myShareTotal / gmax) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const KINDS: GroupKind[] = ['trip', 'home', 'couple', 'other', 'direct'];

function CreateGroupSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const action = useSplitAction();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('trip');
  const [people, setPeople] = useState<{ name: string; email: string }[]>([{ name: '', email: '' }]);

  const create = async () => {
    const members = people.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), email: p.email.trim() || undefined }));
    const groupName = kind === 'direct' ? (members[0]?.name ?? '') : name.trim();
    if (!groupName) return toast({ title: kind === 'direct' ? 'Add the person' : 'Name the group', variant: 'destructive' });
    try {
      const { id } = await action.mutateAsync({ op: 'createGroup', name: groupName, kind, emoji: KIND_EMOJI[kind], members: kind === 'direct' ? members.slice(0, 1) : members });
      onOpenChange(false);
      setName(''); setPeople([{ name: '', email: '' }]);
      onCreated(id);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>New <em>group</em></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map(k => <button key={k} type="button" className="s-chip" data-on={kind === k} onClick={() => setKind(k)}>{KIND_EMOJI[k]} {KIND_LABEL[k]}</button>)}
        </div>
        {kind !== 'direct' && (
          <input className="s-input" placeholder={kind === 'trip' ? 'Goa trip' : kind === 'home' ? 'Flat 12' : 'Group name'} aria-label="Group name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        )}
        <section className="space-y-2">
          <p className="s-muted text-xs font-semibold uppercase tracking-wide">{kind === 'direct' ? 'Who with?' : 'People (you are added automatically)'}</p>
          {(kind === 'direct' ? people.slice(0, 1) : people).map((p, i) => (
            <div key={i} className="flex gap-2">
              <input className="s-input" placeholder="Name" aria-label={`Person ${i + 1} name`} value={p.name} maxLength={60}
                onChange={e => setPeople(xs => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="s-input" type="email" placeholder="Google email (optional)" aria-label={`Person ${i + 1} email`} value={p.email}
                onChange={e => setPeople(xs => xs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              {people.length > 1 && kind !== 'direct' && (
                <button type="button" aria-label="Remove person" className="s-muted px-1" onClick={() => setPeople(xs => xs.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          {kind !== 'direct' && (
            <button type="button" className="s-pill w-full" onClick={() => setPeople(xs => [...xs, { name: '', email: '' }])}><Plus className="h-4 w-4" /> Add person</button>
          )}
          <p className="s-muted text-xs">With an email, they can sign in with Google and see this group. Without one, share a private link later.</p>
        </section>
        <button type="button" className="s-pill s-pill-primary w-full py-3 text-base" onClick={create} disabled={action.isPending}>
          {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create
        </button>
      </div>
    </SplitSheet>
  );
}

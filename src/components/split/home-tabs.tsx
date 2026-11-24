import { useState } from 'react';
import { useEffect } from 'react';
import { ChevronDown, ChevronRight, FileUp, Loader2, Plus, X } from 'lucide-react';
import { ImportSheet } from './import-sheet';
import type { GroupKind, GroupSummary, HomeData } from '@/lib/split/types';
import { ExpenseSheet, type ExpenseDraft } from './expense-sheet';
import { VoiceSheet } from './voice-sheet';
import { useToast } from '@/hooks/use-toast';
import { Avatar, BalanceText, EmptyState, KIND_EMOJI, KIND_LABEL, SplitSheet, inr, monthLabel, prettyDate, todayYmd } from './bits';
import { useSplitAction, useSplitGroup } from './use-split';
import { feedMonths, filterActivity, monthRange, type FeedFilter } from '@/lib/split/feed';
import { EXAMPLE_LINES, FeedSheet, Hero } from './hero';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A chip that is a native select: the phone's own picker, no custom popover. */
function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="s-chip relative inline-flex shrink-0 items-center gap-1" data-on={value !== ''}>
      <span className="max-w-[9rem] truncate">{options.find(([v]) => v === value)?.[1] ?? options[0][1]}</span>
      <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      <select aria-label={label} className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Home: hero (balance, this week, capture buttons), groups strip, then a Settl-style feed. */
export function HomeTab({ data, onOpenGroup, onOpenExpense, query }: {
  data: HomeData; onOpenGroup: (id: string) => void; onOpenExpense: (groupId: string, expenseId: string) => void; query: string;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [capture, setCapture] = useState<CaptureMode>(null);
  const net = r2(data.totals.owed - data.totals.owe);
  const q = query.trim().toLowerCase();
  const groups = data.groups.filter(g => !g.archived && (!q || g.name.toLowerCase().includes(q)));
  const [filter, setFilter] = useState<FeedFilter>({});
  const [time, setTime] = useState(''); // '' any · 'YYYY-MM' · 'custom'
  const [limit, setLimit] = useState(40);
  const filtering = !!(filter.groupId || filter.person || filter.from || filter.to);
  const feed = filterActivity(data.activity, filter).filter(a => !q || `${a.title} ${a.groupName} ${a.who}`.toLowerCase().includes(q));
  const shown = filtering || q ? feed : feed.slice(0, limit);
  const months = feedMonths(data.activity);
  const thisMonth = todayYmd().slice(0, 7);
  const shownNet = r2(feed.reduce((s, a) => s + a.myImpact, 0));
  const pickTime = (v: string) => {
    setTime(v);
    setFilter(f => ({ ...f, ...(v === '' ? { from: undefined, to: undefined } : v === 'custom' ? {} : monthRange(v)) }));
  };
  const clear = () => { setFilter({}); setTime(''); };

  return (
    <div className="space-y-5">
      <Hero
        net={net}
        lines={[data.weekCount > 0 ? `${data.weekCount} ${data.weekCount === 1 ? 'expense' : 'expenses'} logged this week` : 'Nothing logged this week yet', ...EXAMPLE_LINES]}
        onScan={() => setCapture('scan')} onType={() => setCapture('type')} onVoice={() => setCapture('voice')}
      />

      <FeedSheet>
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-2" role="group" aria-label="Filter activity">
          <FilterChip label="Group" value={filter.groupId ?? ''} onChange={v => setFilter(f => ({ ...f, groupId: v || undefined }))}
            options={[['', 'All groups'], ...data.groups.map(g => [g.id, g.name] as [string, string])]} />
          <FilterChip label="Person" value={filter.person ?? ''} onChange={v => setFilter(f => ({ ...f, person: v || undefined }))}
            options={[['', 'Everyone'], ...data.people.map(p => [p.key, p.name] as [string, string])]} />
          <FilterChip label="When" value={time} onChange={pickTime}
            options={[['', 'Any time'], ...months.map(m => [m, m === thisMonth ? `This month` : monthLabel(`${m}-01`)] as [string, string]), ['custom', 'Custom dates…']]} />
          {filtering && <button type="button" className="s-chip inline-flex shrink-0 items-center gap-1" onClick={clear}><X className="h-3 w-3" />Clear</button>}
        </div>
        {time === 'custom' && (
          <div className="flex items-center gap-2 px-4 pb-1 pt-1 text-xs">
            <input type="date" className="s-input w-auto py-1.5 text-xs" aria-label="From date" value={filter.from ?? ''} max={filter.to}
              onChange={e => setFilter(f => ({ ...f, from: e.target.value || undefined }))} />
            <span className="s-muted">to</span>
            <input type="date" className="s-input w-auto py-1.5 text-xs" aria-label="To date" value={filter.to ?? ''} min={filter.from}
              onChange={e => setFilter(f => ({ ...f, to: e.target.value || undefined }))} />
          </div>
        )}
        {filtering && feed.length > 0 && (
          <p className="s-muted px-4 pt-1 text-xs">
            {feed.length} {feed.length === 1 ? 'entry' : 'entries'} · {Math.abs(shownNet) < 0.01 ? 'evens out' : shownNet > 0 ? <>you lent <span className="s-owed font-semibold">{inr(shownNet)}</span></> : <>you owe <span className="s-owe font-semibold">{inr(shownNet)}</span></>}
          </p>
        )}
        {feed.length === 0 ? (
          <p className="s-muted px-4 py-5 text-sm">{q || filtering ? 'Nothing matches.' : 'Expenses from your groups show up here.'}</p>
        ) : (
          <ul>
            {shown.map((a, idx, arr) => (
              <li key={a.id}>
                {(idx === 0 || arr[idx - 1].date.slice(0, 7) !== a.date.slice(0, 7)) && (
                  <p className="s-muted px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide">{monthLabel(a.date)}</p>
                )}
                <button type="button" className="s-row w-full text-left hover:bg-[var(--s-tint)]"
                  onClick={() => (a.kind === 'expense' ? onOpenExpense(a.groupId, a.id) : onOpenGroup(a.groupId))}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--s-line)] bg-[var(--s-card)] text-xl" aria-hidden>{a.emoji ?? '🧾'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.title}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="s-group-chip">{a.groupName}</span>
                      <span className="s-muted truncate">{a.kind === 'settlement' ? prettyDate(a.date) : `${a.paidByMe ? 'You' : a.who} paid ${inr(a.amount)} · ${prettyDate(a.date)}`}</span>
                    </span>
                  </span>
                  {Math.abs(a.myImpact) >= 0.01 && (
                    <span className="text-right">
                      <span className={`block text-sm font-bold tabular-nums ${a.myImpact > 0 ? 's-owed' : 's-owe'}`}>{inr(a.myImpact)}</span>
                      <span className="s-muted text-[11px]">{a.kind === 'settlement' ? (a.myImpact > 0 ? 'received' : 'paid back') : a.myImpact > 0 ? 'you lent' : 'you owe'}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown.length < feed.length && (
          <button type="button" className="s-muted w-full py-3 text-sm font-semibold" onClick={() => setLimit(l => l + 100)}>Show more</button>
        )}
      </FeedSheet>

      {data.unlinked.length > 0 && (
        <section className="s-card p-4">
          <p className="text-sm font-semibold">Not in your spending yet</p>
          <p className="s-muted mb-2 text-xs">Friends added these and you have a share. Open one and save it to count it in your budget.</p>
          {data.unlinked.slice(0, 4).map(u => (
            <button key={u.expenseId} type="button" onClick={() => onOpenExpense(u.groupId, u.expenseId)} className="flex w-full items-center justify-between py-1.5 text-left text-sm">
              <span className="truncate">{u.description} <span className="s-muted">· {u.groupName} · {prettyDate(u.date)}</span></span>
              <span className="s-owe font-semibold">{inr(u.myShare)}</span>
            </button>
          ))}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="s-muted text-xs font-semibold uppercase tracking-wide">Groups</p>
          <div className="flex gap-1">
            <button type="button" className="s-chip" onClick={() => setImporting(true)}><FileUp className="mr-1 inline h-3 w-3" />Splitwise</button>
            <button type="button" className="s-chip" onClick={() => setCreating(true)}><Plus className="mr-1 inline h-3 w-3" />New</button>
          </div>
        </div>
        {groups.length === 0 ? (
          <EmptyState title={<>Start a <em>group</em></>} body="A trip, your flat, a couple, or one dinner — add people and start logging who paid.">
            <button type="button" className="s-pill s-pill-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New group</button>
          </EmptyState>
        ) : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {groups.map(g => (
              <button key={g.id} type="button" onClick={() => onOpenGroup(g.id)} className="s-card w-40 shrink-0 snap-start p-3 text-left">
                <span className="text-2xl" aria-hidden>{g.emoji ?? KIND_EMOJI[g.kind]}</span>
                <span className="mt-1 block truncate font-semibold">{g.name}</span>
                <BalanceText value={g.myBalance} className="block truncate text-xs" />
              </button>
            ))}
          </div>
        )}
      </section>

      <CreateGroupSheet open={creating} onOpenChange={setCreating} onCreated={onOpenGroup} />
      <ImportSheet open={importing} onOpenChange={setImporting} onImported={onOpenGroup} myName={data.me.name} />
      <HomeCapture mode={capture} onClose={() => setCapture(null)} groups={data.groups.filter(g => !g.archived)} onNeedGroup={() => { setCapture(null); setCreating(true); }} />
    </div>
  );
}

type CaptureMode = null | 'voice' | 'scan' | 'type';
const LAST_GROUP = 'split-last-group';

/** Capture from Home: into the last-used group, with chips to switch. */
function HomeCapture({ mode, onClose, groups, onNeedGroup }: { mode: CaptureMode; onClose: () => void; groups: GroupSummary[]; onNeedGroup: () => void }) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const group = useSplitGroup(mode || reviewing ? groupId : null);

  useEffect(() => {
    if (!mode) return;
    if (groups.length === 0) { onNeedGroup(); return; }
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_GROUP); } catch {}
    setGroupId(groups.some(g => g.id === last) ? last : groups[0].id); // groups are newest-activity first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pick = (id: string) => {
    if (id === groupId) return;
    setGroupId(id);
    setDraft(null); // a draft's member ids belong to the old group
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
  const d = group.data;
  if (!d) return null;
  return (
    <>
      <VoiceSheet open={mode === 'voice' || mode === 'scan'} startWithPhoto={mode === 'scan'} onOpenChange={o => !o && onClose()} detail={d}
        header={switcher} onReview={v => { setDraft(v); onClose(); setReviewing(true); }} />
      <ExpenseSheet open={mode === 'type' || reviewing} onOpenChange={o => { if (!o) { onClose(); setReviewing(false); setDraft(null); } }}
        detail={d} draft={draft} header={switcher} />
    </>
  );
}

/** People: net with each person across every shared group. */
export function PeopleTab({ data, onOpenGroup, onOpenPerson }: { data: HomeData; onOpenGroup: (id: string) => void; onOpenPerson: (key: string) => void }) {
  if (data.people.length === 0) {
    return <EmptyState title={<>No one <em>yet</em></>} body="People you share a group with show up here, with their history by month." />;
  }
  return (
    <ul className="space-y-3">
      {data.people.map(p => (
        <li key={p.key} className="s-card p-4">
          <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => onOpenPerson(p.key)}>
            <Avatar name={p.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <BalanceText value={p.net} className="text-sm" owedLabel="owes you" oweLabel="you owe" />
            </div>
            <ChevronRight className="s-muted h-4 w-4" />
          </button>
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

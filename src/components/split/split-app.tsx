"use client";

import './split.css';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Bell, Check, FileUp, Home, Loader2, LogIn, LogOut, Search, User, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, EmptyState, SplitSheet, splitSerif } from './bits';
import { LOOKS, sidekickOf, useLook } from './looks';
import { ImportSheet } from './import-sheet';
import { GroupView } from './group-view';
import { ActivityTab, HomeTab, InsightsTab, PeopleTab } from './home-tabs';
import { useSplitHome } from './use-split';

type Tab = 'home' | 'people' | 'insights' | 'you';
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'people', label: 'People', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'you', label: 'You', icon: User },
];

/**
 * The split app for signed-in users. `owner` renders inside the FinWise shell (which has its own
 * bottom nav, so tabs sit on top); `friend` is the standalone app with a bottom tab bar.
 */
export function SplitApp({ mode }: { mode: 'owner' | 'friend' }) {
  const [look] = useLook();
  return (
    <div data-look={look} className={cn('split-ui min-h-full', splitSerif.variable, mode === 'friend' && 'min-h-dvh')}>
      <Suspense fallback={<Spinner />}>
        <SplitAppInner mode={mode} />
      </Suspense>
    </div>
  );
}

function SplitAppInner({ mode }: { mode: 'owner' | 'friend' }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const groupId = params.get('g');
  const expenseId = params.get('e');
  const [look] = useLook();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [bell, setBell] = useState(false);
  const tab = (params.get('tab') as Tab) || 'home';
  const home = useSplitHome();
  const { user, logout } = useAuth();

  const go = (next: { g?: string | null; tab?: Tab }) => {
    const sp = new URLSearchParams(params.toString());
    if ('g' in next) { next.g ? sp.set('g', next.g) : sp.delete('g'); sp.delete('e'); }
    if (next.tab) { sp.set('tab', next.tab); sp.delete('g'); sp.delete('e'); }
    router.push(`${pathname}${sp.size ? `?${sp}` : ''}`, { scroll: true });
  };
  const openGroup = (id: string) => go({ g: id });
  const openExpense = (g: string, e: string) => router.push(`${pathname}?g=${encodeURIComponent(g)}&e=${encodeURIComponent(e)}`, { scroll: true });
  const tabs = TABS;

  return (
    <div className={cn('mx-auto w-full max-w-2xl px-4 pt-4', mode === 'friend' ? 'pb-28' : 'pb-8')}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go({ tab: 'home' })} className="flex items-center gap-2" aria-label="Split home">
          <span className="text-2xl" aria-hidden>{sidekickOf(look)}</span>
          <span className="split-display text-[1.6rem]">finwise <em>split</em></span>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" className="s-icon-btn h-10 w-10" aria-label="Search" aria-pressed={searching}
            onClick={() => { setSearching(v => !v); setQuery(''); if (groupId) go({ g: null }); }}><Search className="h-4 w-4" /></button>
          <button type="button" className="s-icon-btn h-10 w-10" aria-label="Activity" onClick={() => setBell(true)}><Bell className="h-4 w-4" /></button>
        </div>
      </header>
      {searching && !groupId && (
        <div className="mb-4 flex items-center gap-2">
          <input autoFocus className="s-input" placeholder="Search expenses, groups, people" aria-label="Search" value={query} onChange={e => setQuery(e.target.value)} />
          <button type="button" className="s-icon-btn h-10 w-10 shrink-0" aria-label="Close search" onClick={() => { setSearching(false); setQuery(''); }}><X className="h-4 w-4" /></button>
        </div>
      )}

      {mode === 'owner' && !groupId && (
        <nav className="mb-4 flex gap-1 rounded-full border border-[var(--s-line)] bg-[var(--s-card)] p-1" aria-label="Split sections">
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => go({ tab: t.id })} data-on={tab === t.id}
              className="flex-1 rounded-full px-2 py-2 text-sm font-semibold text-[var(--s-sec)] data-[on=true]:bg-[var(--s-deep)] data-[on=true]:text-white dark:data-[on=true]:text-[#04201f]">
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {groupId ? (
        <GroupView groupId={groupId} openExpenseId={expenseId} onBack={() => go({ g: null })} />
      ) : tab === 'you' ? (
        <YouTab name={user?.name ?? ''} email={user?.email ?? ''} onLogout={mode === 'friend' ? logout : undefined} onImported={openGroup} />
      ) : home.isLoading ? (
        <Spinner />
      ) : !home.data ? (
        <EmptyState title={<>Couldn&apos;t <em>load</em></>} body={(home.error as Error)?.message ?? 'Please try again.'}>
          <button type="button" className="s-pill" onClick={() => home.refetch()}>Retry</button>
        </EmptyState>
      ) : tab === 'people' ? (
        <PeopleTab data={home.data} onOpenGroup={openGroup} />
      ) : tab === 'insights' ? (
        <InsightsTab data={home.data} />
      ) : (
        <HomeTab data={home.data} onOpenGroup={openGroup} onOpenExpense={openExpense} query={query} />
      )}

      <SplitSheet open={bell} onOpenChange={setBell} title={<>Recent <em>activity</em></>}>
        {home.data ? <ActivityTab data={home.data} onOpenGroup={id => { setBell(false); openGroup(id); }} /> : <Spinner />}
      </SplitSheet>

      {mode === 'friend' && (
        <nav className="s-tabbar fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]" aria-label="Split sections">
          <div className="mx-auto flex max-w-2xl">
            {tabs.map(t => (
              <button key={t.id} type="button" className="s-tab flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold"
                data-on={!groupId && tab === t.id} onClick={() => go({ tab: t.id })}>
                <t.icon className="h-5 w-5" /> {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function YouTab({ name, email, onLogout, onImported }: { name: string; email: string; onLogout?: () => void; onImported: (id: string) => void }) {
  const [look, setLook] = useLook();
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-5">
      <section className="s-hero flex items-center gap-4 p-5">
        <Avatar name={name || '?'} size={52} />
        <div className="min-w-0">
          <p className="split-display truncate text-2xl">{name}</p>
          <p className="s-muted truncate text-sm">{email}</p>
        </div>
      </section>

      <section>
        <p className="split-display mb-1 text-2xl">Four looks. Four <em>sidekicks</em>.</p>
        <p className="s-muted mb-3 text-sm">The whole split app re-dresses itself. Saved on this device.</p>
        <div className="grid grid-cols-2 gap-3">
          {LOOKS.map(l => (
            <button key={l.id} type="button" onClick={() => setLook(l.id)} aria-pressed={look === l.id}
              className={cn('relative flex min-h-[9.5rem] flex-col overflow-hidden rounded-[22px] p-4 text-left transition', look === l.id && 'ring-4 ring-offset-2 ring-[var(--s-accent)] ring-offset-[var(--s-bg)]')}
              style={{ background: l.bg, color: l.fg }}>
              <span className="text-[11px] font-semibold opacity-80">{l.name}</span>
              <span className="split-display mt-1 text-lg leading-snug">{l.tagline}</span>
              <span className="absolute -bottom-1 right-2 text-5xl drop-shadow" aria-hidden>{l.sidekick}</span>
              {look === l.id && <Check className="absolute right-3 top-3 h-4 w-4" />}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="s-pill w-full" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" /> Import a group from Splitwise</button>

      <section className="s-card space-y-2 p-4 text-sm">
        <p className="font-semibold">How it works</p>
        <p className="s-muted">Open a group and tap the mic to say what happened, the scan button to snap a receipt, or the pencil to type it. Balances update for everyone. <strong>Settle up</strong> shows the fewest payments; tap <strong>Mark as paid</strong> once money moves. No money moves through this app.</p>
      </section>
      {onLogout && <button type="button" className="s-pill w-full" onClick={onLogout}><LogOut className="h-4 w-4" /> Sign out</button>}
      <ImportSheet open={importing} onOpenChange={setImporting} onImported={onImported} myName={name} />
    </div>
  );
}

const Spinner = () => <div className="flex justify-center py-20"><Loader2 className="s-muted h-6 w-6 animate-spin" /></div>;

/** Share-link view: one group, no account. The visitor's "I am X" choice is remembered on this device. */
export function SplitGuest({ token }: { token: string }) {
  const key = `split-me:${token.slice(0, 12)}`;
  const [asMember, setAsMember] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    try { setAsMember(localStorage.getItem(key)); } catch {}
    setReady(true);
  }, [key]);

  const pick = (id: string | null) => {
    setAsMember(id);
    try { id ? localStorage.setItem(key, id) : localStorage.removeItem(key); } catch {}
  };

  const [look] = useLook();
  return (
    <div data-look={look} className={cn('split-ui min-h-dvh', splitSerif.variable)}>
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <p className="split-display text-2xl"><span className="mr-1" aria-hidden>{sidekickOf(look)}</span>finwise <em>split</em></p>
          {asMember ? (
            <button type="button" className="s-chip" onClick={() => pick(null)}>Not you?</button>
          ) : !isAuthenticated && (
            <a className="s-chip inline-flex items-center gap-1" href={`/login?next=${encodeURIComponent('/groups')}`}><LogIn className="h-3.5 w-3.5" /> Sign in</a>
          )}
        </header>
        {ready ? <GroupView groupId={null} token={token} asMember={asMember} onPickMember={pick} /> : <Spinner />}
      </div>
    </div>
  );
}

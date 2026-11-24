"use client";

import './split.css';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, BarChart3, Home, Loader2, LogIn, LogOut, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, EmptyState, splitSerif } from './bits';
import { GroupView } from './group-view';
import { ActivityTab, HomeTab, InsightsTab, PeopleTab } from './home-tabs';
import { useSplitHome } from './use-split';

type Tab = 'home' | 'people' | 'activity' | 'insights' | 'you';
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'people', label: 'People', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
];

/**
 * The split app for signed-in users. `owner` renders inside the FinWise shell (which has its own
 * bottom nav, so tabs sit on top); `friend` is the standalone app with a bottom tab bar.
 */
export function SplitApp({ mode }: { mode: 'owner' | 'friend' }) {
  return (
    <div className={cn('split-ui min-h-full', splitSerif.variable, mode === 'friend' && 'min-h-dvh')}>
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
  const tab = (params.get('tab') as Tab) || 'home';
  const home = useSplitHome();
  const { user, logout } = useAuth();

  const go = (next: { g?: string | null; tab?: Tab }) => {
    const sp = new URLSearchParams(params.toString());
    if ('g' in next) next.g ? sp.set('g', next.g) : sp.delete('g');
    if (next.tab) { sp.set('tab', next.tab); sp.delete('g'); }
    router.push(`${pathname}${sp.size ? `?${sp}` : ''}`, { scroll: true });
  };
  const openGroup = (id: string) => go({ g: id });
  const tabs = mode === 'friend' ? [...TABS, { id: 'you' as Tab, label: 'You', icon: User }] : TABS;

  return (
    <div className={cn('mx-auto w-full max-w-2xl px-4 pt-4', mode === 'friend' ? 'pb-28' : 'pb-8')}>
      {mode === 'friend' && (
        <header className="mb-4 flex items-center justify-between">
          <p className="split-display text-2xl">FinWise <em>split</em></p>
          {user && <Avatar name={user.name} size={34} />}
        </header>
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
        <GroupView groupId={groupId} onBack={() => go({ g: null })} />
      ) : tab === 'you' ? (
        <YouTab name={user?.name ?? ''} email={user?.email ?? ''} onLogout={logout} />
      ) : home.isLoading ? (
        <Spinner />
      ) : home.error || !home.data ? (
        <EmptyState title={<>Couldn&apos;t <em>load</em></>} body={(home.error as Error)?.message ?? 'Please try again.'}>
          <button type="button" className="s-pill" onClick={() => home.refetch()}>Retry</button>
        </EmptyState>
      ) : tab === 'people' ? (
        <PeopleTab data={home.data} onOpenGroup={openGroup} />
      ) : tab === 'activity' ? (
        <ActivityTab data={home.data} onOpenGroup={openGroup} />
      ) : tab === 'insights' ? (
        <InsightsTab data={home.data} />
      ) : (
        <HomeTab data={home.data} onOpenGroup={openGroup} />
      )}

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

function YouTab({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
  return (
    <div className="space-y-4">
      <section className="s-hero flex items-center gap-4 p-5">
        <Avatar name={name || '?'} size={52} />
        <div className="min-w-0">
          <p className="split-display truncate text-2xl">{name}</p>
          <p className="s-muted truncate text-sm">{email}</p>
        </div>
      </section>
      <section className="s-card space-y-2 p-4 text-sm">
        <p className="font-semibold">How it works</p>
        <p className="s-muted">Open a group, tap <strong>+</strong> to add what you paid and who it&apos;s for. Balances update for everyone. <strong>Settle up</strong> shows the fewest payments to clear it all; tap <strong>Mark as paid</strong> once money moves. No money moves through this app.</p>
      </section>
      <button type="button" className="s-pill w-full" onClick={onLogout}><LogOut className="h-4 w-4" /> Sign out</button>
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

  return (
    <div className={cn('split-ui min-h-dvh', splitSerif.variable)}>
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <p className="split-display text-2xl">FinWise <em>split</em></p>
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

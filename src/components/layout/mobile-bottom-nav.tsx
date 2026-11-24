"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, BarChart3, Bot, MessageSquareText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingCount } from '@/hooks/use-finance-queries';
import { useHideOnScroll } from '@/hooks/use-hide-on-scroll';

/**
 * Phone-first navigation (Inbox carries a count of SMS waiting for review). Without this, reaching any screen on mobile costs
 * two interactions (open the hamburger sheet, then tap) — for the five places
 * you actually go, that's the wrong cost. The sidebar sheet still exists for
 * the long tail (Portfolio, Savings, Split Expenses, Settings, …).
 */
const ITEMS = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/transactions', label: 'Activity', icon: ArrowRightLeft },
  { href: '/pending', label: 'Inbox', icon: MessageSquareText },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/split-expenses', label: 'FinWise Split', icon: Users },
  { href: '/chatbot', label: 'Ask AI', icon: Bot },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { data: pendingCount = 0 } = usePendingCount(!pathname.startsWith('/demo'));
  const hidden = useHideOnScroll();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Floating glass dock: low, see-through, slides away while scrolling down and back on scroll up.
        'fixed inset-x-4 bottom-[var(--dock-bottom)] z-40 mx-auto max-w-md md:hidden',
        'ml-[max(1rem,env(safe-area-inset-left))] mr-[max(1rem,env(safe-area-inset-right))]',
        'rounded-full border border-white/40 bg-background/45 shadow-[0_8px_24px_rgba(0,0,0,0.10)] backdrop-blur-2xl backdrop-saturate-150',
        'dark:border-white/10 dark:bg-background/40',
        'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
        hidden && 'pointer-events-none translate-y-[calc(100%+var(--dock-bottom)+0.5rem)] opacity-0'
      )}
    >
      <ul className="grid grid-cols-6 p-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={href === '/pending' && pendingCount > 0 ? `${label}, ${pendingCount} waiting` : label}
                title={label}
                className={cn(
                  // Icons only (the name is announced to screen readers and shown on long-press); 48px tall touch target.
                  'group flex h-12 items-center justify-center rounded-full transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('relative flex h-10 w-11 items-center justify-center rounded-full transition-colors', active && 'bg-primary/15 dark:bg-primary/25')}>
                    <Icon aria-hidden className={cn('h-[1.35rem] w-[1.35rem]', active && 'stroke-[2.4]')} />
                  {href === '/pending' && pendingCount > 0 && (
                    <span aria-hidden className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {pendingCount}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

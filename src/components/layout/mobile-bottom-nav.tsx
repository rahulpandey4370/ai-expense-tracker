"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, BarChart3, Bot, MessageSquareText } from 'lucide-react';
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
      <ul className="grid grid-cols-5 p-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 52px tall: above the 44px minimum touch target.
                  'group flex h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/15 dark:bg-primary/25')}>
                  <Icon className={cn('h-5 w-5', active && 'stroke-[2.4]')} />
                  {href === '/pending' && pendingCount > 0 && (
                    <span aria-label={`${pendingCount} waiting`} className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {pendingCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

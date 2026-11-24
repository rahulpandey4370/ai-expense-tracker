"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, BarChart3, Bot, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePendingCount } from '@/hooks/use-finance-queries';

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

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Floating dock: inset from the edges, lifted clear of the iOS home indicator.
        'fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden',
        'ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]',
        'rounded-[26px] border border-border/60 bg-background/85 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl'
      )}
    >
      <ul className="grid grid-cols-5 px-1.5 py-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 52px tall — comfortably above the 44px minimum touch target.
                  'group flex h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('relative flex h-8 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/10 dark:bg-primary/20')}>
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

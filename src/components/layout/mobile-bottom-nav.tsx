"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowRightLeft, BarChart3, LineChart, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phone-first navigation. Without this, reaching any screen on mobile costs
 * two interactions (open the hamburger sheet, then tap) — for the five places
 * you actually go, that's the wrong cost. The sidebar sheet still exists for
 * the long tail (Savings, Split Expenses, Settings, …).
 */
const ITEMS = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/transactions', label: 'Activity', icon: ArrowRightLeft },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/portfolio', label: 'Portfolio', icon: LineChart },
  { href: '/chatbot', label: 'Ask AI', icon: Bot },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm md:hidden',
        // Keeps the bar clear of the iOS home indicator.
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 56px tall — comfortably above the 44px minimum touch target.
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'stroke-[2.4]')} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

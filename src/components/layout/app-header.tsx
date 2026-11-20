"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from 'next/navigation';
import { ModelSelector } from '../model-selector';
import { PeriodPicker } from '../period-picker';
import { cn } from '@/lib/utils';
import { CommandMenu } from './command-menu';

/**
 * Routes where the global month/year selection actually changes what's on
 * screen. Everywhere else the control was still rendered, silently doing
 * nothing — Savings, Portfolio, Settings and Split Expenses aren't
 * month-scoped, so offering a month picker there is a lie about the UI.
 */
// /reports is deliberately absent: it has its own period selector that also
// offers "Annual", so showing the header one too gave two controls for the
// same idea that disagreed with each other.
const PERIOD_SCOPED_ROUTES = ['/', '/transactions', '/recurring'];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/recurring': 'Recurring',
  '/savings': 'Savings',
  '/portfolio': 'Portfolio',
  '/reports': 'Reports',
  '/yearly-overview': 'Yearly Overview',
  '/split-expenses': 'Split Expenses',
  '/settings': 'Settings',
  '/chatbot': 'AI Chatbot',
  '/ai-playground': 'AI Playground',
  '/about': 'About',
};

export default function AppHeader() {
  const pathname = usePathname();
  const isDemoRoute = pathname.startsWith('/demo');
  const showPeriod = PERIOD_SCOPED_ROUTES.includes(pathname);
  const title = PAGE_TITLES[pathname] ?? (pathname.startsWith('/portfolio') ? 'Portfolio' : '');

  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-x-2 border-b bg-background/85 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur-sm md:h-16 md:gap-x-3 md:px-6 md:pt-0">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        {/* The header never used to say where you were. On a phone the bottom
            nav already answers that, and the period control needs the room —
            so the title yields below `sm`. */}
        {title && (
          <h1 className={cn(
            'truncate text-sm font-semibold text-foreground md:text-base',
            showPeriod && 'hidden sm:block'
          )}>
            {title}
          </h1>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {!isDemoRoute && <CommandMenu />}
        {showPeriod && <PeriodPicker />}
        <ThemeToggle />
        {!isDemoRoute && <ModelSelector />}
        {!isDemoRoute && <UserNav />}
      </div>
    </header>
  );
}

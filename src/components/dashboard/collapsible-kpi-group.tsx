"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CollapsibleKpiGroupProps {
  /** Stable id used for the localStorage persistence key — must be unique per group. */
  id: string;
  title: string;
  icon?: ReactNode;
  /** Small count/summary shown next to the title, e.g. "5" or "₹12,400". */
  badge?: ReactNode;
  children: ReactNode;
  /** Collapsed the first time a user ever sees this group. Their choice is remembered after that. */
  defaultOpen?: boolean;
}

const STORAGE_PREFIX = 'finwise.kpiGroup.';

export function CollapsibleKpiGroup({ id, title, icon, badge, children, defaultOpen = false }: CollapsibleKpiGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_PREFIX + id) : null;
    if (stored !== null) setOpen(stored === 'open');
    setHydrated(true);
  }, [id]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_PREFIX + id, next ? 'open' : 'closed');
    }
  };

  // Avoid a hydration flash: render collapsed markup until we know the stored preference.
  const isOpen = hydrated ? open : defaultOpen;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className="rounded-lg border bg-card/60">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
          {badge !== undefined && <Badge variant="outline" className="ml-1 font-normal">{badge}</Badge>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="px-4 pb-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

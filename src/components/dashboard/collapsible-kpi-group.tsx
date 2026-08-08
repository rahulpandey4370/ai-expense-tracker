"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface KpiPanel {
  /** Stable id — also the localStorage key suffix for the open panel. */
  id: string;
  /** Used as the tooltip and the accessible name, since the tab shows only an icon. */
  title: string;
  icon: ReactNode;
  /**
   * Tailwind classes for the icon's tint when the panel is active. Each panel
   * gets its own hue so the row reads as three distinct things at a glance.
   */
  activeClassName: string;
  /** Small count/summary rendered beside the icon when there's something to say. */
  badge?: ReactNode;
  content: ReactNode;
}

interface CollapsibleKpiGroupProps {
  panels: KpiPanel[];
  /** Namespace for the persisted "which panel is open" preference. */
  storageKey?: string;
}

/**
 * One compact row of icon tabs with a single expanding panel beneath.
 *
 * This replaces three separately-collapsing cards stacked vertically, which
 * cost three full-width rows of chrome to say very little. Icons alone keep
 * the row to a single line; the title survives as the tooltip and the
 * accessible name, and appears as a heading once a panel is open.
 *
 * Nothing is open by default — these are secondary to the main KPIs above.
 */
export function CollapsibleKpiGroup({ panels, storageKey = 'finwise.kpiPanel' }: CollapsibleKpiGroupProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && panels.some(p => p.id === stored)) setOpenId(stored);
    setHydrated(true);
    // Panels are static per render of the dashboard; only the key matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next) window.localStorage.setItem(storageKey, next);
    else window.localStorage.removeItem(storageKey);
  };

  // Render closed until the stored preference is known, so the panel doesn't
  // flash open on hydration.
  const activeId = hydrated ? openId : null;
  const active = panels.find(p => p.id === activeId);

  return (
    <div className="rounded-lg border bg-card/60">
      <div className="flex items-center gap-1 p-1.5">
        {panels.map(panel => {
          const isActive = panel.id === activeId;
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => toggle(panel.id)}
              title={panel.title}
              aria-label={panel.title}
              aria-expanded={isActive}
              className={cn(
                'group relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive ? cn('bg-muted', panel.activeClassName) : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {panel.icon}
              {panel.badge !== undefined && panel.badge !== null && (
                <span className="text-[11px] font-medium tabular-nums opacity-80">{panel.badge}</span>
              )}
              {isActive && (
                <motion.span
                  layoutId={`${storageKey}-underline`}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-current"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key={active.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t"
          >
            <div className="p-3">
              {/* The title is hidden in the tab strip, so state it once here. */}
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {active.title}
              </p>
              {active.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

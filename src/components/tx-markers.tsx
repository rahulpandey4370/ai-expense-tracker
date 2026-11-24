"use client";

import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TYPE_COLORS, expenseKind } from '@/lib/type-colors';

/** Thin left-edge stripe in the expense type's colour. The parent must be `relative`. */
export function TypeStripe({ type }: { type?: string | null }) {
  const k = expenseKind(type);
  if (!k) return null;
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[3px]" style={{ background: k.color }} />
      <span className="sr-only">{k.label}.</span>
    </>
  );
}

/** "Split" tag: this transaction is shared, and lives in FinWise Split. */
export function SplitTag({ className }: { className?: string }) {
  return (
    <span title="Split, in FinWise Split" className={cn('inline-flex shrink-0 items-center gap-1 rounded-md bg-teal-500/15 px-1.5 py-px text-[11px] font-semibold leading-4 text-teal-700 dark:text-teal-300', className)}>
      <Users className="h-3 w-3" aria-hidden />Split
    </span>
  );
}

/** Type as a dot + word (desktop Type column). */
export function TypeDot({ type }: { type?: string | null }) {
  const k = expenseKind(type);
  if (!k) return null;
  return <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: k.color }} />{k.label}</span>;
}

const KINDS = [['need', 'Need', TYPE_COLORS.need], ['want', 'Want', TYPE_COLORS.want], ['investment', 'Investment', TYPE_COLORS.investment]] as const;

/** Legend that is also a filter: tap Need to show only needs, tap again to clear. */
export function TypeLegend({ expenseType, onExpenseType, split, onSplit }: {
  expenseType: string; onExpenseType: (v: string) => void; split: string; onSplit: (v: 'all' | 'split') => void;
}) {
  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const on = 'border-foreground/40 bg-muted text-foreground';
  const off = 'border-border text-muted-foreground hover:text-foreground';
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show only">
      {KINDS.map(([v, label, color]) => (
        <button key={v} type="button" aria-pressed={expenseType === v} onClick={() => onExpenseType(expenseType === v ? 'all' : v)} className={cn(chip, expenseType === v ? on : off)}>
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
        </button>
      ))}
      <button type="button" aria-pressed={split === 'split'} onClick={() => onSplit(split === 'split' ? 'all' : 'split')} className={cn(chip, split === 'split' ? on : off)}>
        <Users className="h-3 w-3 text-teal-600 dark:text-teal-400" aria-hidden />Split
      </button>
    </div>
  );
}

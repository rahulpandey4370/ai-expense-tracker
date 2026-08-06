"use client";

import type { LucideIcon } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Accent per KPI. Previously each card had a saturated pastel fill plus a
 * coloured border plus a purple glow, which made eight cards read as a
 * candy-store rather than a hierarchy. Now the surface is neutral and the
 * colour lives in a left rule, the icon, and (where it carries meaning) the
 * value — so colour signals *category*, not decoration.
 */
export type KpiTone = 'income' | 'expense' | 'investment' | 'outgoings' | 'savings' | 'rewards' | 'neutral';

const TONE_STYLES: Record<KpiTone, { rule: string; icon: string; value?: string }> = {
  income:      { rule: 'bg-green-500',  icon: 'text-green-600 dark:text-green-500' },
  expense:     { rule: 'bg-red-500',    icon: 'text-red-600 dark:text-red-400',    value: 'text-red-600 dark:text-red-400' },
  investment:  { rule: 'bg-blue-500',   icon: 'text-blue-600 dark:text-blue-400',  value: 'text-blue-600 dark:text-blue-400' },
  outgoings:   { rule: 'bg-orange-500', icon: 'text-orange-600 dark:text-orange-400' },
  savings:     { rule: 'bg-emerald-500',icon: 'text-emerald-600 dark:text-emerald-500' },
  rewards:     { rule: 'bg-amber-500',  icon: 'text-amber-600 dark:text-amber-500' },
  neutral:     { rule: 'bg-primary',    icon: 'text-primary' },
};

interface KpiCardProps {
  title: string;
  /** Preformatted display string (run it through @/lib/format first). */
  value: string;
  icon: LucideIcon;
  description?: string;
  tone?: KpiTone;
  /** Renders larger, for the two or three metrics that lead the page. */
  emphasis?: boolean;
  /** Override the tone's value colour, e.g. green when positive / red when negative. */
  valueClassName?: string;
  kpiKey: string;
  /** Explains what the number means; shown on hover/focus of the title. */
  insightText?: string;
  selectedMonth: number;
  selectedYear: number;
  /** Balances masked when false. */
  isVisible: boolean;
  /** Underlying amount; when 0/undefined the card has nothing to drill into. */
  numericValue?: number;
  className?: string;
}

/** Ratio KPIs have no row-level breakdown worth navigating to. */
const NON_NAVIGABLE = new Set(['savingsPercentage', 'investmentRate']);

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  tone = 'neutral',
  emphasis = false,
  valueClassName,
  kpiKey,
  insightText,
  selectedMonth,
  selectedYear,
  isVisible,
  numericValue,
  className,
}: KpiCardProps) {
  const router = useRouter();
  const styles = TONE_STYLES[tone];

  const hasData = numericValue === undefined ? true : numericValue !== 0;
  const isClickable = isVisible && hasData && !NON_NAVIGABLE.has(kpiKey);

  // Navigate immediately. The old implementation deferred every drill-down by
  // 250ms behind a setTimeout to disambiguate a double-click gesture that was
  // undiscoverable and didn't exist on touch — so every click just felt slow.
  const handleClick = () => {
    if (!isClickable) return;
    const params = new URLSearchParams({
      month: String(selectedMonth),
      year: String(selectedYear),
    });

    switch (kpiKey) {
      case 'totalIncome':
        params.set('type', 'income');
        break;
      case 'coreExpenses':
        params.set('type', 'expense');
        params.set('expenseTypes', 'need,want');
        break;
      case 'totalInvestmentsAmount':
        params.set('type', 'expense');
        params.set('expenseType', 'investment');
        break;
      case 'totalOutgoings':
        params.set('type', 'expense');
        break;
      case 'cashbackInterests':
        params.set('type', 'income');
        params.set('categoryNames', 'Cashback,Investment Income,Dividends');
        break;
      // cashSavings is derived from all activity for the month — no filter.
    }

    router.push(`/transactions?${params.toString()}`);
  };

  const displayValue = isVisible ? value : '•••••';
  const displayDescription = isVisible ? description : '•••••';

  // A clickable card is a button so keyboard and screen-reader users can reach
  // it; a non-clickable one is a plain region and shouldn't be in the tab order.
  const Wrapper: 'button' | 'div' = isClickable ? 'button' : 'div';

  const card = (
    <motion.div
      whileHover={isClickable ? { y: -2 } : undefined}
      whileTap={isClickable ? { scale: 0.99 } : undefined}
      transition={{ duration: 0.12 }}
      className="h-full"
    >
      <Wrapper
        {...(isClickable
          ? {
              onClick: handleClick,
              type: 'button' as const,
              'aria-label': `${title}: ${displayValue}. View matching transactions.`,
            }
          : {})}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm',
          'transition-colors',
          isClickable && 'cursor-pointer hover:border-accent/40 hover:bg-accent/[0.03]',
          isClickable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          emphasis ? 'p-4 sm:p-5' : 'p-3 sm:p-4',
          className
        )}
      >
        {/* Category accent — replaces the old full-card colour wash. */}
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', styles.rule)} />

        <div className="flex items-start justify-between gap-2 pl-2">
          <span className={cn(
            'font-medium text-muted-foreground',
            emphasis ? 'text-sm' : 'text-xs sm:text-sm'
          )}>
            {title}
          </span>
          <Icon className={cn('shrink-0', styles.icon, emphasis ? 'h-5 w-5' : 'h-4 w-4')} />
        </div>

        <div className="mt-1.5 flex flex-1 flex-col justify-end pl-2">
          <span
            className={cn(
              'font-bold tabular-nums leading-tight text-foreground',
              emphasis ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl',
              !isVisible && 'tracking-widest text-muted-foreground',
              isVisible && (valueClassName ?? styles.value)
            )}
          >
            {displayValue}
          </span>

          {displayDescription && (
            <span className="mt-1 flex items-center gap-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              <span className="truncate">{displayDescription}</span>
              {isClickable && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
            </span>
          )}
        </div>
      </Wrapper>
    </motion.div>
  );

  if (!insightText) return card;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          {insightText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

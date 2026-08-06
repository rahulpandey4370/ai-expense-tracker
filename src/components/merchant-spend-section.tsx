"use client";

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, ChevronDown, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { AppTransaction } from '@/lib/types';
import { detectMerchant, MERCHANT_GROUP_LABELS, type MerchantGroup } from '@/lib/merchants';
import { formatCurrencyWhole, formatCurrencyCompact, formatDelta, percentChange, formatCount } from '@/lib/format';
import { isSameCalendarMonth } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface MerchantSpendSectionProps {
  /** Every transaction the dashboard has loaded — this month AND last month. */
  transactions: AppTransaction[];
  selectedMonth: number;
  selectedYear: number;
  selectedMonthName: string;
  /** Whether balances are unmasked; merchant amounts follow the same privacy toggle. */
  isVisible: boolean;
}

interface MerchantTotal {
  id: string;
  name: string;
  group: MerchantGroup;
  total: number;
  count: number;
  previousTotal: number;
  /** null when there's no prior-month baseline to compare against. */
  change: number | null;
}

const INITIAL_VISIBLE = 8;

export function MerchantSpendSection({
  transactions,
  selectedMonth,
  selectedYear,
  selectedMonthName,
  isVisible,
}: MerchantSpendSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { merchants, totalTracked, grandTotal } = useMemo(() => {
    const prevMonthDate = new Date(selectedYear, selectedMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();

    const current = new Map<string, MerchantTotal>();
    const previous = new Map<string, number>();
    let allExpenseThisMonth = 0;

    for (const t of transactions) {
      // Merchant spend is money going out on goods and services. Investment
      // outflows aren't "spending at a merchant", so they're excluded — this
      // keeps the strip comparable to the Core Expenses KPI above it.
      if (t.type !== 'expense') continue;
      if (t.expenseType !== 'need' && t.expenseType !== 'want') continue;

      const inCurrent = isSameCalendarMonth(t.date, selectedMonth, selectedYear);
      const inPrevious = isSameCalendarMonth(t.date, prevMonth, prevYear);
      if (!inCurrent && !inPrevious) continue;

      if (inCurrent) allExpenseThisMonth += t.amount;

      const merchant = detectMerchant(t.description);
      if (!merchant) continue;

      if (inCurrent) {
        const entry = current.get(merchant.id) ?? {
          id: merchant.id, name: merchant.name, group: merchant.group,
          total: 0, count: 0, previousTotal: 0, change: null,
        };
        entry.total += t.amount;
        entry.count += 1;
        current.set(merchant.id, entry);
      } else {
        previous.set(merchant.id, (previous.get(merchant.id) ?? 0) + t.amount);
      }
    }

    // Only merchants with spend THIS month get a tile. A merchant you didn't
    // use in March shouldn't leave an empty ₹0 card sitting on the March view.
    const list = [...current.values()].map(m => {
      const prev = previous.get(m.id) ?? 0;
      return { ...m, previousTotal: prev, change: percentChange(m.total, prev) };
    }).sort((a, b) => b.total - a.total);

    return {
      merchants: list,
      totalTracked: list.reduce((s, m) => s + m.total, 0),
      grandTotal: allExpenseThisMonth,
    };
  }, [transactions, selectedMonth, selectedYear]);

  // Nothing to show is a real state, not an error — render nothing rather than
  // an empty card taking up a screenful on mobile.
  if (merchants.length === 0) return null;

  const visible = expanded ? merchants : merchants.slice(0, INITIAL_VISIBLE);
  const hidden = merchants.length - visible.length;
  const shareOfSpend = grandTotal > 0 ? (totalTracked / grandTotal) * 100 : 0;

  const handleDrillDown = (merchant: MerchantTotal) => {
    const params = new URLSearchParams({
      month: String(selectedMonth),
      year: String(selectedYear),
      type: 'expense',
      merchant: merchant.id,
    });
    router.push(`/transactions?${params.toString()}`);
  };

  return (
    <Card className="bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-primary">
              <Store className="h-5 w-5 text-accent" />
              Where your money went
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              {merchants.length} merchant{merchants.length === 1 ? '' : 's'} in {selectedMonthName} {selectedYear}
              {isVisible && shareOfSpend > 0 && (
                <> · {formatCurrencyWhole(totalTracked)} ({shareOfSpend.toFixed(0)}% of spend)</>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {visible.map((m, i) => (
              <motion.button
                key={m.id}
                type="button"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, delay: Math.min(i, INITIAL_VISIBLE) * 0.02 }}
                onClick={() => handleDrillDown(m)}
                aria-label={`${m.name}: ${formatCurrencyWhole(m.total)} across ${m.count} transactions. View transactions.`}
                className={cn(
                  'group flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3 text-left',
                  'transition-colors hover:border-accent/50 hover:bg-accent/5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="truncate text-xs font-medium text-muted-foreground" title={m.name}>
                    {m.name}
                  </span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-accent" />
                </div>

                <span className="text-base font-semibold tabular-nums text-foreground sm:text-lg">
                  {isVisible ? formatCurrencyCompact(m.total) : '•••••'}
                </span>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{formatCount(m.count)} txn{m.count === 1 ? '' : 's'}</span>
                  {isVisible && <ChangeChip change={m.change} isNew={m.previousTotal === 0} />}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>

        {merchants.length > INITIAL_VISIBLE && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(v => !v)}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('mr-1 h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Show less' : `Show ${hidden} more merchant${hidden === 1 ? '' : 's'}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Month-over-month movement. "New" is distinct from "+100%" — a merchant you
 * used for the first time has no baseline, and showing a percentage there
 * would be arithmetic theatre.
 */
function ChangeChip({ change, isNew }: { change: number | null; isNew: boolean }) {
  if (isNew) {
    return <Badge variant="outline" className="h-4 border-accent/40 px-1 text-[10px] font-normal text-accent">new</Badge>;
  }
  if (change === null) return null;

  const rounded = Math.round(change);
  if (rounded === 0) {
    return <span className="flex items-center gap-0.5 text-muted-foreground"><Minus className="h-3 w-3" />flat</span>;
  }

  // Up is bad here: this is spending, not income.
  const up = rounded > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('flex items-center gap-0.5 tabular-nums', up ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-500')}>
      <Icon className="h-3 w-3" />
      {formatDelta(change, 0)}
    </span>
  );
}

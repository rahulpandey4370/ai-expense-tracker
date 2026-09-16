"use client";

import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import type { AppTransaction } from '@/lib/types';
import { getCalendarDateParts, isSameCalendarMonth } from '@/lib/date-utils';
import { netAmount } from '@/lib/split-utils';
import { formatCurrencyCompact, formatCurrencyWhole } from '@/lib/format';

interface DailySpendSectionProps {
  transactions: AppTransaction[];
  selectedMonth: number;
  selectedYear: number;
  selectedMonthName: string;
  isVisible: boolean;
}

/** A calendar-day view of the selected month, including quiet days. */
export function DailySpendSection({
  transactions,
  selectedMonth,
  selectedYear,
  selectedMonthName,
  isVisible,
}: DailySpendSectionProps) {
  const { data, totalSpent, transactionCount, activeDays, highestDay, daysInMonth } = useMemo(() => {
    const days = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const daily = Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      label: String(index + 1),
      spent: 0,
      transactions: 0,
    }));

    for (const transaction of transactions) {
      if (!isSameCalendarMonth(transaction.date, selectedMonth, selectedYear)) continue;
      const parts = getCalendarDateParts(transaction.date);
      if (!parts) continue;
      // Transaction frequency includes income and expenses; spending itself is
      // expense-only and honours the user's share of split transactions.
      daily[parts.day - 1].transactions += 1;
      if (transaction.type === 'expense') daily[parts.day - 1].spent += netAmount(transaction);
    }

    const total = daily.reduce((sum, entry) => sum + entry.spent, 0);
    const count = daily.reduce((sum, entry) => sum + entry.transactions, 0);
    const active = daily.filter(entry => entry.spent > 0).length;
    const peak = daily.reduce((best, entry) => entry.spent > best.spent ? entry : best, daily[0]);
    return { data: daily, totalSpent: total, transactionCount: count, activeDays: active, highestDay: peak, daysInMonth: days };
  }, [transactions, selectedMonth, selectedYear]);

  const averagePerDay = totalSpent / daysInMonth;
  const averageActiveDay = activeDays > 0 ? totalSpent / activeDays : 0;

  if (transactionCount === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No transactions recorded for {selectedMonthName} {selectedYear}.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={Wallet} label="Spent" value={isVisible ? formatCurrencyWhole(totalSpent) : '•••••'} />
        <Metric icon={CalendarDays} label="Average / day" value={isVisible ? formatCurrencyCompact(averagePerDay) : '•••••'} />
        <Metric icon={ReceiptText} label="Transactions" value={String(transactionCount)} />
        <Metric icon={TrendingUp} label="Most spent" value={isVisible ? `Day ${highestDay.day} · ${formatCurrencyCompact(highestDay.spent)}` : `Day ${highestDay.day} · •••••`} />
      </div>

      <div className="h-60 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="spent" tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="count" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={24} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.45 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as typeof data[number];
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-semibold">{selectedMonthName} {item.day}</p>
                    <p className="text-emerald-600 dark:text-emerald-400">Spent: {isVisible ? formatCurrencyWhole(item.spent) : '•••••'}</p>
                    <p className="text-muted-foreground">Transactions: {item.transactions}</p>
                  </div>
                );
              }}
            />
            <Bar yAxisId="spent" dataKey="spent" name="Spent" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Line yAxisId="count" type="monotone" dataKey="transactions" name="Transactions" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Bars show daily spending; the line shows transaction count. You spent on {activeDays} of {daysInMonth} days, averaging {isVisible ? formatCurrencyWhole(averageActiveDay) : '•••••'} on days with spending.
      </p>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5 text-accent" />{label}</div>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground" title={value}>{value}</p>
    </div>
  );
}


"use client";

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  className?: string;
  valueClassName?: string;
  kpiKey: string;
  insightText: string;
  selectedMonth: number;
  selectedYear: number;
  secondaryTitle?: string; // Title to show on double-click
  secondaryValue?: string; // Value to show on double-click
}

const glowClass = "shadow-card-glow";

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  className,
  valueClassName,
  kpiKey,
  insightText,
  selectedMonth,
  selectedYear,
  secondaryTitle,
  secondaryValue,
}: KpiCardProps) {
  const router = useRouter();
  const [showSecondary, setShowSecondary] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleCardClick = () => {
    // If a double-click timeout is pending, clear it (this is a single click)
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    // Set a timeout to handle single click. If double click happens, this will be cleared.
    const newTimeout = setTimeout(() => {
      const queryParams = new URLSearchParams();
      queryParams.append('month', selectedMonth.toString());
      queryParams.append('year', selectedYear.toString());

      if (kpiKey === 'totalIncome') {
        queryParams.append('type', 'income');
      } else if (kpiKey === 'coreExpenses') {
        queryParams.append('type', 'expense');
        // For core expenses, we might want to filter out investment_expense
        // queryParams.append('expenseType', 'need'); // Example, can be more complex
        // queryParams.append('expenseType', 'want');
      } else if (kpiKey === 'totalInvestmentsAmount') {
        queryParams.append('type', 'expense');
        queryParams.append('expenseType', 'investment_expense');
      } else if (kpiKey === 'cashbackInterests') {
        queryParams.append('type', 'income');
        // More specific category filtering could be added if needed
      } else if (kpiKey === 'savingsPercentage' || kpiKey === 'netMonthlyCashflow' || kpiKey === 'totalOutgoings' || kpiKey === 'availableToSaveInvest') {
        // For these derived metrics, show all transactions for context
        // No specific type filter applied by default
      }
      router.push(`/transactions?${queryParams.toString()}`);
      setClickTimeout(null);
    }, 250); // 250ms delay to detect double click

    setClickTimeout(newTimeout);
  };

  const handleDoubleClick = () => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }
    if (secondaryValue) {
      setShowSecondary(true);
      setTimeout(() => {
        setShowSecondary(false);
      }, 3000); // Show secondary info for 3 seconds
    }
  };

  const displayTitle = showSecondary && secondaryTitle ? secondaryTitle : title;
  const displayValue = showSecondary && secondaryValue ? secondaryValue : value;

  return (
    <motion.div
      className={cn(
        "shadow-lg h-full flex flex-col cursor-pointer",
        glowClass,
        className
      )}
      onClick={handleCardClick}
      onDoubleClick={handleDoubleClick}
      whileHover={{ scale: 1.02, transition: { duration: 0.1 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {displayTitle}
          </CardTitle>
          <Icon className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className={cn("text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words", valueClassName)}>
            {typeof displayValue === 'number' ? displayValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : displayValue}
          </div>
          {description && !showSecondary && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
          {showSecondary && secondaryValue && <p className="text-xs text-accent pt-1 animate-pulse">Showing total including investments</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}


"use client";

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

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
  secondaryTitle?: string;
  secondaryValue?: string;
  isVisible: boolean; // New prop to control visibility
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
  isVisible,
}: KpiCardProps) {
  const router = useRouter();
  const [showSecondary, setShowSecondary] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  const handleCardClick = () => {
    if (!isClient) return;
    if (!isVisible) return; // Don't navigate if not visible

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    // Specific KPIs where single click navigation is disabled
    if (kpiKey === "savingsPercentage" || kpiKey === "investmentRate" || kpiKey === "cashSavings") {
      return; 
    }

    const newTimeout = setTimeout(() => {
      const queryParams = new URLSearchParams();
      queryParams.append('month', selectedMonth.toString());
      queryParams.append('year', selectedYear.toString());

      if (kpiKey === 'totalIncome') {
        queryParams.append('type', 'income');
      } else if (kpiKey === 'coreExpenses') {
        queryParams.append('type', 'expense');
        // Optionally add filters for 'need' and 'want' if desired
        // queryParams.append('expenseType', 'need');
        // queryParams.append('expenseType', 'want');
      } else if (kpiKey === 'totalInvestmentsAmount') {
        queryParams.append('type', 'expense');
        queryParams.append('expenseType', 'investment_expense');
      } else if (kpiKey === 'cashbackInterests') {
        queryParams.append('type', 'income');
        // Consider adding category filter for 'Cashback', 'Investment Income', 'Dividends'
      }
      // For 'totalOutgoings', 'availableToSaveInvest', 'savingsPercentage', 'netMonthlyCashflow', we show all transactions for context.

      router.push(`/transactions?${queryParams.toString()}`);
      setClickTimeout(null);
    }, 250); 

    setClickTimeout(newTimeout);
  };

  const handleDoubleClick = () => {
    if (!isClient) return;
    if (!isVisible) return; // Don't allow double click if not visible

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }
    if (secondaryValue && kpiKey === "savingsPercentage") {
      setShowSecondary(true);
      setTimeout(() => {
        setShowSecondary(false);
      }, 3000); 
    }
  };

  const displayTitle = showSecondary && secondaryTitle ? secondaryTitle : title;
  const displayValue = isVisible ? (showSecondary && secondaryValue ? secondaryValue : value) : '•••••';
  const displayDescription = isVisible ? (showSecondary ? 'Total Saved + Invested' : description) : '•••••';


  return (
    <motion.div
      className={cn(
        "shadow-lg h-full flex flex-col",
        isVisible ? "cursor-pointer" : "cursor-default",
        glowClass,
        className
      )}
      onClick={handleCardClick}
      onDoubleClick={handleDoubleClick}
      whileHover={isVisible ? { scale: 1.02, transition: { duration: 0.1 } } : {}}
      whileTap={isVisible ? { scale: 0.98 } : {}}
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
            {displayValue}
          </div>
          {displayDescription && <p className={cn("text-xs text-muted-foreground pt-1")}>{displayDescription}</p>}
           {showSecondary && secondaryValue && kpiKey === "savingsPercentage" && (
            <p className="text-xs text-accent pt-1 animate-pulse">Showing total saved/invested %</p>
           )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

    
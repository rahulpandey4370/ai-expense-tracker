
"use client";

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from 'next/navigation';

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
}

const glowClass = "shadow-[var(--card-glow)]"; // Removed dark:shadow-part for simplicity if not defined in globals

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
  selectedYear
}: KpiCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    const queryParams = new URLSearchParams();
    queryParams.append('month', selectedMonth.toString());
    queryParams.append('year', selectedYear.toString());

    // Updated kpiKey logic
    if (kpiKey === 'totalIncome') {
      queryParams.append('type', 'income');
    } else if (kpiKey === 'coreExpenses') { // Changed from totalExpenses
      queryParams.append('type', 'expense');
      // Optionally, filter out investment_expense if you want to be strict
      // queryParams.append('expenseType', 'need'); 
      // queryParams.append('expenseType', 'want'); // This is tricky with multi-select via URL
    } else if (kpiKey === 'totalInvestments') { // New key
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'investmentPercentage') { // For consistency if this key remains
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'cashbackInterests') {
      queryParams.append('type', 'income');
      // Further filtering by category for cashback/interests would require more complex logic
      // in transactions page or a dedicated filter key.
    }
    // For 'availableToSaveInvest' and 'netMonthlyCashflow', navigation might not be direct transaction filters
    // as they are derived values. Could navigate to a general view or a report.
    // For now, they won't navigate or will navigate to a general transaction view for the month.
    if (kpiKey !== 'availableToSaveInvest' && kpiKey !== 'netMonthlyCashflow') {
       router.push(`/transactions?${queryParams.toString()}`);
    } else {
      // Optionally handle navigation for these derived KPIs differently or not at all
      console.log(`KPI clicked: ${kpiKey} - Navigation not specifically implemented for this derived KPI.`);
      router.push(`/transactions?${queryParams.toString()}`); // Default to general month view
    }
  };

  return (
    <motion.div
      className={cn(
        "shadow-lg h-full flex flex-col cursor-pointer",
        glowClass,
        className
      )}
      onClick={handleCardClick}
      whileHover={{ scale: 1.02, transition: { duration: 0.1 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className={cn("text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words", valueClassName)}>
            {typeof value === 'number' ? value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : value}
          </div>
          {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}


    
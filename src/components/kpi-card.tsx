
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

const glowClass = "shadow-card-glow"; 

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  className,
  valueClassName,
  kpiKey,
  insightText, // insightText is kept for potential future re-introduction of hover effects
  selectedMonth,
  selectedYear
}: KpiCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    const queryParams = new URLSearchParams();
    queryParams.append('month', selectedMonth.toString());
    queryParams.append('year', selectedYear.toString());

    if (kpiKey === 'totalIncome') {
      queryParams.append('type', 'income');
    } else if (kpiKey === 'coreExpenses') { 
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'need'); // Default to needs, can add more later or remove for general expense
      // Add more for 'want' if needed: queryParams.append('expenseType', 'want');
    } else if (kpiKey === 'totalInvestmentsAmount') { // Updated to handle new key
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'investmentPercentage') { 
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'cashbackInterests') {
      queryParams.append('type', 'income');
      // For more specific filtering for "Cashback", "Investment Income", "Dividends"
      // you might need a different strategy, as queryParams for multiple category OR is complex.
      // For now, it shows all income transactions for the month.
    }
    // For 'availableToSaveInvest', 'netMonthlyCashflow', and 'totalOutgoings' (new), 
    // these are derived values, so navigating to a general view for the month is appropriate.
    // No specific type/expenseType filters are applied for these.
    
    router.push(`/transactions?${queryParams.toString()}`);
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

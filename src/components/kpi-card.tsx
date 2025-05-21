
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
  insightText: string; // Kept for prop consistency, but not displayed
  selectedMonth: number;
  selectedYear: number;
}

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  className,
  valueClassName,
  kpiKey,
  insightText, // Not visually used anymore
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
    } else if (kpiKey === 'totalExpenses') {
      queryParams.append('type', 'expense');
    } else if (kpiKey === 'investmentPercentage') {
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'cashbackInterests') {
      // For 'cashbackInterests', we might want to filter by income type and relevant categories
      // However, simple filtering by type 'income' is a start.
      // The transactions page doesn't currently support multiple category pre-filters via URL.
      queryParams.append('type', 'income');
    }
    // Add more specific kpiKey conditions if needed for other KPIs that navigate

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
      whileHover={{ scale: 1.02, transition: { duration: 0.1 } }} // Optional: subtle hover scale
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
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}


"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap, LineChart, Target, Handshake } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput } from "@/ai/flows/spending-insights";
import type { AppTransaction } from "@/lib/types"; // Using AppTransaction
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';
import { ScrollArea } from './ui/scroll-area';

interface SpendingInsightsProps {
  currentMonthTransactions: AppTransaction[];
  currentMonthCoreSpending: number;
  currentMonthInvestmentSpending: number;
  lastMonthCoreSpending: number;
  lastMonthSpendingByCategory: Record<string, number>;
  selectedMonthName: string;
  selectedMonth: number;
  selectedYear: number;
}

type InsightType = 'default' | 'cost_cutter' | 'growth_investor';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function SpendingInsights({
  currentMonthTransactions,
  currentMonthCoreSpending,
  currentMonthInvestmentSpending,
  lastMonthCoreSpending,
  lastMonthSpendingByCategory,
  selectedMonthName,
  selectedMonth,
  selectedYear,
}: SpendingInsightsProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentInsightType, setCurrentInsightType] = useState<InsightType>('default');

  const monthlyMetrics = useMemo(() => {
    const income = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const spendingByCategory = currentMonthTransactions
      .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && t.category?.name)
      .reduce((acc, t) => {
        const categoryName = t.category!.name;
        acc[categoryName] = (acc[categoryName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return { income, spendingByCategory };
  }, [currentMonthTransactions]);


  const generateInsights = useCallback(async (insightType: InsightType = 'default') => {
    setIsLoading(true);
    setError(null);
    setInsights(null);
    setCurrentInsightType(insightType);
      
    const input: SpendingInsightsInput = {
      currentMonthIncome: monthlyMetrics.income,
      currentMonthCoreSpending: currentMonthCoreSpending,
      currentMonthInvestmentSpending: currentMonthInvestmentSpending,
      lastMonthCoreSpending: lastMonthCoreSpending,
      spendingByCategory: monthlyMetrics.spendingByCategory,
      lastMonthSpendingByCategory: lastMonthSpendingByCategory,
      insightType: insightType,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear,
    };

    try {
      const result = await getSpendingInsights(input);
      setInsights(result.insights);
    } catch (err) {
      console.error("Error generating insights:", err);
      setError("Failed to generate insights. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [monthlyMetrics, currentMonthCoreSpending, currentMonthInvestmentSpending, lastMonthCoreSpending, lastMonthSpendingByCategory, selectedMonth, selectedYear]);
  
  useEffect(() => {
    // Automatically generate insights if there's spending data for the selected month
    if (currentMonthTransactions.length > 0 && currentMonthCoreSpending > 0) {
      generateInsights(currentInsightType);
    } else {
      // Clear insights if there's no data
      setInsights(null);
      setError(null);
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthCoreSpending, selectedMonth, selectedYear]); // Re-run when spending or selected period changes

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg flex flex-col h-[500px]", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lightbulb className="h-6 w-6 text-accent" /> AI Spending Insights
          </CardTitle>
          <CardDescription>Insights for {selectedMonthName} {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
          <ScrollArea className="flex-grow pr-4">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {insights && !isLoading && (
              <div className="text-sm space-y-2 p-3 bg-accent/10 border border-accent/30 rounded-md whitespace-pre-wrap">
                <p className="text-foreground">{insights}</p>
              </div>
            )}
            {!insights && !isLoading && !error && (currentMonthTransactions.length === 0 || currentMonthCoreSpending === 0) && (
              <p className="text-sm text-muted-foreground p-3 text-center">No core spending data for {selectedMonthName} {selectedYear} to generate insights.</p>
            )}
          </ScrollArea>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => generateInsights('default')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'default' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <Handshake className="mr-2 h-4 w-4" /> Default
            </Button>
             <Button onClick={() => generateInsights('cost_cutter')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'cost_cutter' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <Target className="mr-2 h-4 w-4" /> Cost Cutter
            </Button>
             <Button onClick={() => generateInsights('growth_investor')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'growth_investor' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <LineChart className="mr-2 h-4 w-4" /> Growth Advisor
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

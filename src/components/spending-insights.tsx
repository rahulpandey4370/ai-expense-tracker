
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput } from "@/ai/flows/spending-insights";
import type { AppTransaction } from "@/lib/types"; // Using AppTransaction
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';
import { ScrollArea } from './ui/scroll-area';

interface SpendingInsightsProps {
  currentMonthTransactions: AppTransaction[];
  lastMonthTotalSpending: number; 
  selectedMonthName: string;
  selectedYear: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const buttonHoverTap = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function SpendingInsights({ currentMonthTransactions, lastMonthTotalSpending, selectedMonthName, selectedYear }: SpendingInsightsProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const monthlyMetrics = useMemo(() => {
    const income = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const spending = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const spendingByCategory = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.category?.name)
      .reduce((acc, t) => {
        const categoryName = t.category!.name;
        acc[categoryName] = (acc[categoryName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return { income, spending, spendingByCategory };
  }, [currentMonthTransactions]);


  const generateInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setInsights(null);
      
    const input: SpendingInsightsInput = {
      currentMonthIncome: monthlyMetrics.income,
      currentMonthSpending: monthlyMetrics.spending,
      lastMonthSpending: lastMonthTotalSpending,
      spendingByCategory: monthlyMetrics.spendingByCategory,
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
  }, [monthlyMetrics, lastMonthTotalSpending]);
  
  useEffect(() => {
    // Automatically generate insights if there's spending data
    if (currentMonthTransactions.length > 0 && monthlyMetrics.spending > 0) {
      generateInsights();
    } else {
      // Clear insights if there's no data
      setInsights(null);
      setError(null);
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyMetrics.spending, currentMonthTransactions.length, generateInsights]);

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
              <div className="text-sm space-y-2 p-3 bg-accent/10 border border-accent/30 rounded-md">
                {insights.split('\n').map((line, index) => (
                  <p key={index} className="text-foreground">{line.replace(/^- /, '• ').replace(/^\d+\.\s/, '• ')}</p>
                ))}
              </div>
            )}
            {!insights && !isLoading && !error && (currentMonthTransactions.length === 0 || monthlyMetrics.spending === 0) && (
              <p className="text-sm text-muted-foreground p-3 text-center">No spending data for {selectedMonthName} {selectedYear} to generate insights.</p>
            )}
          </ScrollArea>
          <motion.div {...buttonHoverTap}>
            <Button onClick={generateInsights} disabled={isLoading || monthlyMetrics.spending === 0} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4">
              <Zap className="mr-2 h-4 w-4" />
              {isLoading ? "Generating..." : "Refresh Insights"}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

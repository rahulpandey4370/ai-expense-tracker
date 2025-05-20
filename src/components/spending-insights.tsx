
"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput } from "@/ai/flows/spending-insights";
import type { Transaction } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';

interface SpendingInsightsProps {
  currentMonthTransactions: Transaction[];
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

  const monthlySpending = currentMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const getTopCategory = useCallback(() => {
    const categorySpending: Record<string, number> = {};
    currentMonthTransactions
      .filter(t => t.type === 'expense' && t.category)
      .forEach(t => {
        categorySpending[t.category!] = (categorySpending[t.category!] || 0) + t.amount;
      });
    
    if (Object.keys(categorySpending).length === 0) return { name: 'N/A', amount: 0 };

    const sortedCategories = Object.entries(categorySpending).sort(([, a], [, b]) => b - a);
    return { name: sortedCategories[0][0], amount: sortedCategories[0][1] };
  }, [currentMonthTransactions]);

  const generateInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setInsights(null);
    
    const topCategoryData = getTopCategory();
    const topCategoryName = topCategoryData.name;
    const topCategorySpending = topCategoryData.amount;

    const comparisonWithLastMonth = monthlySpending > lastMonthTotalSpending
      ? `you spent ₹${(monthlySpending - lastMonthTotalSpending).toFixed(2)} more than the previous month.`
      : monthlySpending < lastMonthTotalSpending
      ? `you spent ₹${(lastMonthTotalSpending - monthlySpending).toFixed(2)} less than the previous month.`
      : `your spending was about the same as the previous month.`;
      
    const input: SpendingInsightsInput = {
      monthlySpending,
      lastMonthSpending: lastMonthTotalSpending,
      topCategory: topCategoryName,
      topCategorySpending,
      comparisonWithLastMonth,
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
  }, [monthlySpending, lastMonthTotalSpending, getTopCategory]);
  
  useEffect(() => {
    if (currentMonthTransactions.length > 0 && monthlySpending > 0) {
      generateInsights();
    } else {
      setInsights(null);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlySpending, lastMonthTotalSpending, selectedMonthName, selectedYear, currentMonthTransactions.length]); // Added currentMonthTransactions.length

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg flex flex-col h-[500px]", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lightbulb className="h-6 w-6 text-accent" /> AI Spending Insights
          </CardTitle>
          <CardDescription>Insights for {selectedMonthName} {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="flex-grow overflow-auto pr-2">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {insights && !isLoading && (
              <div className="text-sm space-y-2 p-3 bg-accent/10 border border-accent/30 rounded-md">
                {insights.split('\n').map((line, index) => (
                  <p key={index} className="text-foreground">{line.replace(/^- /, '• ')}</p>
                ))}
              </div>
            )}
            {!insights && !isLoading && !error && (currentMonthTransactions.length === 0 || monthlySpending === 0) && (
              <p className="text-sm text-muted-foreground">No spending data for {selectedMonthName} {selectedYear} to generate insights.</p>
            )}
          </div>
          <motion.div {...buttonHoverTap}>
            <Button onClick={generateInsights} disabled={isLoading || currentMonthTransactions.length === 0 || monthlySpending === 0} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4">
              <Zap className="mr-2 h-4 w-4" />
              {isLoading ? "Generating..." : "Refresh Insights"}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

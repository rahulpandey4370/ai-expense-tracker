
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap, LineChart, Target, Handshake, CheckCheck, AlertTriangle, TrendingUp, ShoppingCart } from "lucide-react";
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

const InsightPoint = ({ text }: { text: string }) => {
  const getIcon = () => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('warning') || lowerText.includes('risk of')) return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    if (lowerText.includes('investment') || lowerText.includes('investing')) return <TrendingUp className="h-5 w-5 text-blue-500" />;
    if (lowerText.includes('shopping')) return <ShoppingCart className="h-5 w-5 text-purple-500" />;
    if (lowerText.includes('discretionary') || lowerText.includes('decent start')) return <CheckCheck className="h-5 w-5 text-green-500" />;
    return <Lightbulb className="h-5 w-5 text-accent" />;
  };

  // Remove the leading number and period (e.g., "1. ")
  const formattedText = text.replace(/^\d+\.\s*/, '');

  return (
    <li className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-1">{getIcon()}</div>
      <p className="flex-1 text-foreground/90">{formattedText}</p>
    </li>
  );
};


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
      lastMonthSpendingByCategory: lastMonthSpendingByCategory || {}, // Ensure this is always an object
      insightType: insightType,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear,
    };

    try {
      const result = await getSpendingInsights(input);
       if (result.insights.includes("The AI returned an empty response") || result.insights.includes("error occurred") || result.insights.trim() === '') {
        const errorMessage = result.insights.includes("The AI returned an empty response") 
            ? "I'm sorry, I couldn't generate insights for the current data. The AI returned an empty response."
            : `I'm sorry, an unexpected error occurred while generating insights: ${result.insights}`;
        setError(errorMessage);
        setInsights(null);
      } else {
        setInsights(result.insights);
      }
    } catch (err: any) {
      console.error("Error generating insights:", err);
      setError(`Failed to generate insights. ${err.message || 'Please try again.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [monthlyMetrics, currentMonthCoreSpending, currentMonthInvestmentSpending, lastMonthCoreSpending, lastMonthSpendingByCategory, selectedMonth, selectedYear]);
  
  const parsedInsights = useMemo(() => {
    if (!insights) return [];
    return insights.split('\n').map(line => line.trim()).filter(line => line.length > 0 && /^\d+\./.test(line));
  }, [insights]);
  
  useEffect(() => {
    // Clear insights when the month/year changes to prompt user to regenerate
    setInsights(null);
    setError(null);
    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

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
            {parsedInsights.length > 0 && !isLoading && (
              <ul className="text-sm space-y-4 p-3 bg-accent/5 border border-accent/20 rounded-md">
                {parsedInsights.map((insight, index) => (
                  <InsightPoint key={index} text={insight} />
                ))}
              </ul>
            )}
            {parsedInsights.length === 0 && !isLoading && !error && (
              <p className="text-sm text-muted-foreground p-3 text-center">
                {currentMonthCoreSpending > 0 
                  ? "Select an analysis type below to generate insights." 
                  : `No core spending data for ${selectedMonthName} ${selectedYear} to generate insights.`
                }
              </p>
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

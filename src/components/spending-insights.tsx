
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingDown, TrendingUp, Handshake, AlertTriangle } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput, type SpendingInsightsOutput } from "@/ai/flows/spending-insights";
import type { AppTransaction } from "@/lib/types";
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

const InsightPoint = ({ text, type }: { text: string; type: 'positive' | 'improvement' | 'takeaway' }) => {
  const colorClass = {
    positive: 'bg-green-500',
    improvement: 'bg-yellow-500',
    takeaway: 'bg-primary',
  }[type];

  return (
    <li className="flex items-start gap-3">
      <div className={cn("mt-1.5 h-2 w-2 rounded-full flex-shrink-0", colorClass)} />
      <p className="flex-1 text-foreground/90">{text}</p>
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
  const [insights, setInsights] = useState<SpendingInsightsOutput | null>(null);
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
      lastMonthSpendingByCategory: lastMonthSpendingByCategory || {},
      insightType: insightType,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear,
    };

    try {
      const result = await getSpendingInsights(input);
       if (!result.keyTakeaway && (!result.positiveObservations || result.positiveObservations.length === 0) && (!result.areasForImprovement || result.areasForImprovement.length === 0)) {
        const errorMessage = "I'm sorry, I encountered an issue generating spending insights. The AI returned an empty response.";
        setError(errorMessage);
        setInsights(null);
      } else {
        setInsights(result);
      }
    } catch (err: any) {
      console.error("Error generating insights:", err);
      setError(`Failed to generate insights. ${err.message || 'Please try again.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [monthlyMetrics, currentMonthCoreSpending, currentMonthInvestmentSpending, lastMonthCoreSpending, lastMonthSpendingByCategory, selectedMonth, selectedYear]);
  
  useEffect(() => {
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
              <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                 <div className="pt-4 space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            )}
            {error && !isLoading && (
              <div className="text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
            
            {insights && !isLoading && !error && (
              <div className="text-sm space-y-4">
                {insights.positiveObservations && insights.positiveObservations.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-green-600 dark:text-green-400 mb-2">What's Going Well</h3>
                    <ul className="space-y-2">
                      {insights.positiveObservations.map((obs, i) => <InsightPoint key={`pos-${i}`} text={obs} type="positive" />)}
                    </ul>
                  </div>
                )}
                {insights.areasForImprovement && insights.areasForImprovement.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">What to Improve</h3>
                    <ul className="space-y-2">
                      {insights.areasForImprovement.map((imp, i) => <InsightPoint key={`imp-${i}`} text={imp} type="improvement" />)}
                    </ul>
                  </div>
                )}
                {insights.keyTakeaway && (
                  <div>
                    <h3 className="font-semibold text-primary mb-2">Bottom Line</h3>
                    <InsightPoint text={insights.keyTakeaway} type="takeaway" />
                  </div>
                )}
              </div>
            )}

            {!insights && !isLoading && !error && (
              <div className="h-full flex items-center justify-center">
                 <p className="text-sm text-muted-foreground text-center">
                    {currentMonthCoreSpending > 0 
                    ? "Select an analysis type below to generate insights." 
                    : `No core spending data for ${selectedMonthName} ${selectedYear} to generate insights.`
                    }
                </p>
              </div>
            )}
          </ScrollArea>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => generateInsights('default')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'default' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <Handshake className="mr-2 h-4 w-4" /> Default
            </Button>
             <Button onClick={() => generateInsights('cost_cutter')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'cost_cutter' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <TrendingDown className="mr-2 h-4 w-4" /> Cost Cutter
            </Button>
             <Button onClick={() => generateInsights('growth_investor')} disabled={isLoading || currentMonthCoreSpending === 0} className={cn("flex-1", currentInsightType === 'growth_investor' && !isLoading ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80')} withMotion>
              <TrendingUp className="mr-2 h-4 w-4" /> Growth Advisor
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}


"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingDown, TrendingUp, Handshake, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput, type SpendingInsightsOutput } from "@/ai/flows/spending-insights";
import type { AppTransaction } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';

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

interface FormattedInsight {
  type: 'positive' | 'improvement' | 'takeaway';
  text: string;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const carouselVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
  }),
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
  const [insights, setInsights] = useState<SpendingInsightsOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentInsightType, setCurrentInsightType] = useState<InsightType>('default');
  
  // Carousel state
  const [[currentInsightIndex, direction], setCurrentInsightIndex] = useState([0, 0]);


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
    setCurrentInsightIndex([0, 0]); // Reset carousel on new generation
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
  
  const allInsights: FormattedInsight[] = useMemo(() => {
    if (!insights) return [];
    const combined: FormattedInsight[] = [];
    if (insights.positiveObservations) {
      combined.push(...insights.positiveObservations.map(text => ({ type: 'positive' as const, text })));
    }
    if (insights.areasForImprovement) {
      combined.push(...insights.areasForImprovement.map(text => ({ type: 'improvement' as const, text })));
    }
    if (insights.keyTakeaway) {
      combined.push({ type: 'takeaway' as const, text: insights.keyTakeaway });
    }
    return combined;
  }, [insights]);

  const paginate = (newDirection: number) => {
    if (!allInsights.length) return;
    const newIndex = (currentInsightIndex + newDirection + allInsights.length) % allInsights.length;
    setCurrentInsightIndex([newIndex, newDirection]);
  };

  const currentFormattedInsight = allInsights[currentInsightIndex];


  useEffect(() => {
    setInsights(null);
    setError(null);
    setCurrentInsightIndex([0, 0]);
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
        <CardContent className="flex-1 flex flex-col justify-between overflow-hidden">
            <div className="relative flex-1 flex items-center justify-center">
                 {isLoading && (
                    <div className="w-full px-4 space-y-4">
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
                    <div className="text-sm text-destructive flex items-start gap-2 p-4">
                        <AlertTriangle className="h-4 w-4 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}
                 {!isLoading && !error && allInsights.length > 0 && currentFormattedInsight && (
                    <>
                        <AnimatePresence initial={false} custom={direction}>
                            <motion.div
                                key={currentInsightIndex}
                                custom={direction}
                                variants={carouselVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 }
                                }}
                                className="absolute w-full h-full p-4 flex flex-col items-center justify-center text-center"
                            >
                                <Card className="border-none shadow-none bg-transparent w-full">
                                    <CardHeader className="pb-2">
                                        <CardTitle className={cn(
                                            "text-lg font-semibold",
                                            currentFormattedInsight.type === 'positive' && 'text-green-600 dark:text-green-400',
                                            currentFormattedInsight.type === 'improvement' && 'text-yellow-600 dark:text-yellow-400',
                                            currentFormattedInsight.type === 'takeaway' && 'text-primary'
                                        )}>
                                            {currentFormattedInsight.type === 'positive' && "What's Going Well"}
                                            {currentFormattedInsight.type === 'improvement' && "Area for Improvement"}
                                            {currentFormattedInsight.type === 'takeaway' && "Key Takeaway"}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-foreground/90">{currentFormattedInsight.text}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </AnimatePresence>
                         {allInsights.length > 1 && (
                            <>
                                <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => paginate(-1)}>
                                    <ChevronLeft className="h-6 w-6"/>
                                </Button>
                                 <Button variant="ghost" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2" onClick={() => paginate(1)}>
                                    <ChevronRight className="h-6 w-6"/>
                                </Button>
                            </>
                         )}
                    </>
                )}
                 {!isLoading && !error && allInsights.length === 0 && (
                    <div className="text-center p-4">
                        <p className="text-sm text-muted-foreground">
                            {currentMonthCoreSpending > 0 
                            ? "Select an analysis type below to generate insights." 
                            : `No core spending data for ${selectedMonthName} ${selectedYear} to generate insights.`
                            }
                        </p>
                    </div>
                )}
            </div>
             {allInsights.length > 1 && (
                <div className="text-center text-xs text-muted-foreground pt-2">
                    {currentInsightIndex + 1} of {allInsights.length}
                </div>
            )}
          <div className="flex flex-wrap gap-2 pt-4 border-t mt-auto">
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

    
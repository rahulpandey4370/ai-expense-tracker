"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Handshake,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getSpendingInsights,
  type SpendingInsightsInput,
  type SpendingInsightsOutput,
} from "@/ai/flows/spending-insights";
import type { AppTransaction } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

type InsightType = "default" | "cost_cutter" | "growth_investor";

interface FormattedInsight {
  type: "positive" | "improvement" | "takeaway";
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

const glowClass =
  "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

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
  const [currentInsightType, setCurrentInsightType] =
    useState<InsightType>("default");

  // Carousel state: [index, direction]
  const [[currentInsightIndex, direction], setCurrentInsightIndex] = useState<
    [number, number]
  >([0, 0]);

  const monthlyMetrics = useMemo(() => {
    const income = currentMonthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const spendingByCategory = currentMonthTransactions
      .filter(
        (t) =>
          t.type === "expense" &&
          (t.expenseType === "need" || t.expenseType === "want") &&
          t.category?.name
      )
      .reduce((acc, t) => {
        const categoryName = t.category!.name;
        acc[categoryName] = (acc[categoryName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return { income, spendingByCategory };
  }, [currentMonthTransactions]);

  const generateInsights = useCallback(
    async (insightType: InsightType = "default") => {
      setIsLoading(true);
      setError(null);
      setInsights(null);
      setCurrentInsightIndex([0, 0]); // Reset carousel on new generation
      setCurrentInsightType(insightType);

      const input: SpendingInsightsInput = {
        currentMonthIncome: monthlyMetrics.income,
        currentMonthCoreSpending,
        currentMonthInvestmentSpending,
        lastMonthCoreSpending,
        spendingByCategory: monthlyMetrics.spendingByCategory,
        lastMonthSpendingByCategory: lastMonthSpendingByCategory || {},
        insightType,
        selectedMonth,
        selectedYear,
      };

      try {
        const result = await getSpendingInsights(input);

        const hasAnyInsights =
          (result.positiveObservations &&
            result.positiveObservations.length > 0) ||
          (result.areasForImprovement &&
            result.areasForImprovement.length > 0) ||
          !!result.keyTakeaway;

        if (!hasAnyInsights) {
          const errorMessage =
            "I'm sorry, I encountered an issue generating spending insights. The AI returned an empty response.";
          setError(errorMessage);
          setInsights(null);
        } else {
          setInsights(result);
        }
      } catch (err: any) {
        console.error("Error generating insights:", err);
        setError(
          `Failed to generate insights. ${
            err?.message || "Please try again."
          }`
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      monthlyMetrics,
      currentMonthCoreSpending,
      currentMonthInvestmentSpending,
      lastMonthCoreSpending,
      lastMonthSpendingByCategory,
      selectedMonth,
      selectedYear,
    ]
  );

  const allInsights: FormattedInsight[] = useMemo(() => {
    if (!insights) return [];
    const combined: FormattedInsight[] = [];

    if (insights.positiveObservations && insights.positiveObservations.length) {
      combined.push(
        ...insights.positiveObservations.map((text) => ({
          type: "positive" as const,
          text,
        }))
      );
    }

    if (
      insights.areasForImprovement &&
      insights.areasForImprovement.length
    ) {
      combined.push(
        ...insights.areasForImprovement.map((text) => ({
          type: "improvement" as const,
          text,
        }))
      );
    }

    if (insights.keyTakeaway && insights.keyTakeaway.trim().length > 0) {
      combined.push({
        type: "takeaway" as const,
        text: insights.keyTakeaway,
      });
    }

    return combined;
  }, [insights]);

  const paginate = (newDirection: number) => {
    if (!allInsights.length) return;
    const newIndex =
      (currentInsightIndex + newDirection + allInsights.length) %
      allInsights.length;
    setCurrentInsightIndex([newIndex, newDirection]);
  };

  const currentFormattedInsight =
    allInsights.length > 0 ? allInsights[currentInsightIndex] : undefined;

  useEffect(() => {
    // Reset when user changes month/year
    setInsights(null);
    setError(null);
    setCurrentInsightIndex([0, 0]);
    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

  const getBadgeLabel = (type: FormattedInsight["type"]) => {
    if (type === "positive") return "What's Going Well";
    if (type === "improvement") return "What to Improve";
    return "Key Takeaway";
  };

  const getBadgeClasses = (type: FormattedInsight["type"]) =>
    cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
      type === "positive" &&
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
      type === "improvement" &&
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
      type === "takeaway" &&
        "bg-primary/10 text-primary-foreground/90 dark:bg-primary/20"
    );

  const getAccentBarClasses = (type: FormattedInsight["type"]) =>
    cn(
      "w-1 rounded-full h-full",
      type === "positive" &&
        "bg-emerald-500/80 dark:bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]",
      type === "improvement" &&
        "bg-amber-500/80 dark:bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]",
      type === "takeaway" &&
        "bg-primary shadow-[0_0_12px_rgba(59,130,246,0.6)]"
    );

  const getBackgroundTintClasses = (type: FormattedInsight["type"]) =>
    cn(
      "rounded-xl border px-4 py-3 text-left",
      type === "positive" &&
        "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-100/60 dark:border-emerald-800/60",
      type === "improvement" &&
        "bg-amber-50/70 dark:bg-amber-950/40 border-amber-100/60 dark:border-amber-800/60",
      type === "takeaway" &&
        "bg-primary/5 dark:bg-primary/15 border-primary/20"
    );

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg flex flex-col h-[500px]", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lightbulb className="h-6 w-6 text-accent" /> AI Spending Insights
          </CardTitle>
          <CardDescription>
            Insights for {selectedMonthName} {selectedYear}.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="relative flex-1 flex items-center justify-center px-2">
            {/* Loading skeleton */}
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

            {/* Error state */}
            {error && !isLoading && (
              <div className="text-sm text-destructive flex items-start gap-2 p-4">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Carousel with colored blocks */}
            {!isLoading &&
              !error &&
              allInsights.length > 0 &&
              currentFormattedInsight && (
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
                        opacity: { duration: 0.2 },
                      }}
                      className="absolute w-full h-full px-4 flex flex-col items-center justify-center"
                    >
                      <div className="w-full max-w-xl space-y-3">
                        {/* Label chip */}
                        <div className="flex justify-center">
                          <span
                            className={getBadgeClasses(
                              currentFormattedInsight.type
                            )}
                          >
                            {getBadgeLabel(currentFormattedInsight.type)}
                          </span>
                        </div>

                        {/* Colored block + text */}
                        <div className="flex gap-3 items-stretch">
                          {/* Vertical color block */}
                          <div
                            className={getAccentBarClasses(
                              currentFormattedInsight.type
                            )}
                          />

                          {/* Content inside tinted card */}
                          <div
                            className={getBackgroundTintClasses(
                              currentFormattedInsight.type
                            )}
                          >
                            <p className="text-sm text-foreground/90 leading-relaxed">
                              {currentFormattedInsight.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Carousel controls – always visible, disabled if only one */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-0 top-1/2 -translate-y-1/2"
                    onClick={() => paginate(-1)}
                    disabled={allInsights.length <= 1}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-1/2 -translate-y-1/2"
                    onClick={() => paginate(1)}
                    disabled={allInsights.length <= 1}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

            {/* Empty state */}
            {!isLoading && !error && allInsights.length === 0 && (
              <div className="text-center p-4">
                <p className="text-sm text-muted-foreground">
                  {currentMonthCoreSpending > 0
                    ? "Select an analysis type below to generate insights."
                    : `No core spending data for ${selectedMonthName} ${selectedYear} to generate insights.`}
                </p>
              </div>
            )}
          </div>

          {/* Carousel counter */}
          {allInsights.length > 0 && (
            <div className="text-center text-xs text-muted-foreground pt-2">
              {allInsights.length > 1
                ? `${currentInsightIndex + 1} of ${allInsights.length}`
                : "1 of 1 insight"}
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t mt-auto">
            <Button
              onClick={() => generateInsights("default")}
              disabled={isLoading || currentMonthCoreSpending === 0}
              className={cn(
                "flex-1",
                currentInsightType === "default" && !isLoading
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              withMotion
            >
              <Handshake className="mr-2 h-4 w-4" /> Default
            </Button>
            <Button
              onClick={() => generateInsights("cost_cutter")}
              disabled={isLoading || currentMonthCoreSpending === 0}
              className={cn(
                "flex-1",
                currentInsightType === "cost_cutter" && !isLoading
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              withMotion
            >
              <TrendingDown className="mr-2 h-4 w-4" /> Cost Cutter
            </Button>
            <Button
              onClick={() => generateInsights("growth_investor")}
              disabled={isLoading || currentMonthCoreSpending === 0}
              className={cn(
                "flex-1",
                currentInsightType === "growth_investor" && !isLoading
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
              withMotion
            >
              <TrendingUp className="mr-2 h-4 w-4" /> Growth Advisor
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

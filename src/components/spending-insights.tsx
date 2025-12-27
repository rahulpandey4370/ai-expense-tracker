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
import { useAIModel } from "@/contexts/AIModelContext";

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

interface ParsedInsight {
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

/**
 * Parse the numbered insights string:
 * "1. Foo\n2. Bar\n3. Baz"
 *  → ["Foo", "Bar", "Baz"]
 */
function parseInsightsString(raw: string | undefined | null): ParsedInsight[] {
  if (!raw) return [];

  const text = raw.trim();
  if (!text) return [];

  const results: ParsedInsight[] = [];
  const regex = /\d+\.\s+([\s\S]*?)(?=(?:\n\d+\.\s)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const insightText = match[1].trim();
    if (insightText) {
      results.push({ text: insightText });
    }
  }

  // Fallback: if regex failed (no numbering), treat whole thing as one insight
  if (results.length === 0) {
    results.push({ text });
  }

  return results;
}

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
  const { selectedModel } = useAIModel();

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
        model: selectedModel,
      };

      try {
        const result = await getSpendingInsights(input);

        if (!result.insights || result.insights.trim().length === 0) {
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
      selectedModel,
    ]
  );

  const allInsights: ParsedInsight[] = useMemo(
    () => parseInsightsString(insights?.insights),
    [insights]
  );

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

  // Single-style badge / colors (no positive/improvement distinction now)
  const badgeClasses =
    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";

  const accentBarClasses =
    "w-1 rounded-full h-full bg-primary shadow-[0_0_12px_rgba(59,130,246,0.6)]";

  const backgroundTintClasses =
    "rounded-xl border px-4 py-3 text-left bg-primary/5 dark:bg-primary/15 border-primary/20";

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
                          <span className={badgeClasses}>Insight</span>
                        </div>

                        {/* Colored block + text */}
                        <div className="flex gap-3 items-stretch">
                          {/* Vertical color block */}
                          <div className={accentBarClasses} />

                          {/* Content inside tinted card */}
                          <div className={backgroundTintClasses}>
                            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
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

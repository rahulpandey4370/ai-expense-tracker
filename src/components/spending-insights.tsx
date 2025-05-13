"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput } from "@/ai/flows/spending-insights";
import type { Transaction } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingInsightsProps {
  currentMonthTransactions: Transaction[]; // Pre-filtered for selected month/year
  lastMonthTotalSpending: number; 
  selectedMonthName: string;
  selectedYear: number;
}

export function SpendingInsights({ currentMonthTransactions, lastMonthTotalSpending, selectedMonthName, selectedYear }: SpendingInsightsProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const monthlySpending = currentMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const getTopCategory = () => {
    const categorySpending: Record<string, number> = {};
    currentMonthTransactions // Use pre-filtered transactions
      .filter(t => t.type === 'expense' && t.category)
      .forEach(t => {
        categorySpending[t.category!] = (categorySpending[t.category!] || 0) + t.amount;
      });
    
    if (Object.keys(categorySpending).length === 0) return { name: 'N/A', amount: 0 };

    const sortedCategories = Object.entries(categorySpending).sort(([, a], [, b]) => b - a);
    return { name: sortedCategories[0][0], amount: sortedCategories[0][1] };
  };

  const topCategoryData = getTopCategory();
  const topCategoryName = topCategoryData.name;
  const topCategorySpending = topCategoryData.amount;

  const generateInsights = async () => {
    setIsLoading(true);
    setError(null);
    setInsights(null);

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
  };
  
  useEffect(() => {
    if (currentMonthTransactions.length > 0 && monthlySpending > 0) {
      generateInsights();
    } else {
      setInsights(null); // Clear insights if no relevant data
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthTransactions, monthlySpending, lastMonthTotalSpending]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Lightbulb className="h-6 w-6 text-accent" /> AI Spending Insights
        </CardTitle>
        <CardDescription>Insights for {selectedMonthName} {selectedYear}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <Button onClick={generateInsights} disabled={isLoading || currentMonthTransactions.length === 0 || monthlySpending === 0} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
          <Zap className="mr-2 h-4 w-4" />
          {isLoading ? "Generating..." : "Refresh Insights"}
        </Button>
      </CardContent>
    </Card>
  );
}

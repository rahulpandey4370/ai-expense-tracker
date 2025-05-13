"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Zap } from "lucide-react";
import { getSpendingInsights, type SpendingInsightsInput } from "@/ai/flows/spending-insights";
import type { Transaction } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingInsightsProps {
  transactions: Transaction[];
  // For simplicity, last month's spending is mocked. In a real app, this would come from data.
  lastMonthTotalSpending?: number; 
}

export function SpendingInsights({ transactions, lastMonthTotalSpending = 1800 }: SpendingInsightsProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlySpending = transactions
    .filter(t => t.type === 'expense' && t.date.getMonth() === currentMonth && t.date.getFullYear() === currentYear)
    .reduce((sum, t) => sum + t.amount, 0);

  const getTopCategory = () => {
    const categorySpending: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense' && t.category && t.date.getMonth() === currentMonth && t.date.getFullYear() === currentYear)
      .forEach(t => {
        categorySpending[t.category!] = (categorySpending[t.category!] || 0) + t.amount;
      });
    
    if (Object.keys(categorySpending).length === 0) return { name: 'N/A', amount: 0 };

    return Object.entries(categorySpending)
      .sort(([, a], [, b]) => b - a)[0];
  };

  const topCategoryData = getTopCategory();
  const topCategoryName = topCategoryData ? topCategoryData[0] : 'N/A';
  const topCategorySpending = topCategoryData ? topCategoryData[1] : 0;


  const generateInsights = async () => {
    setIsLoading(true);
    setError(null);
    setInsights(null);

    const comparisonWithLastMonth = monthlySpending > lastMonthTotalSpending
      ? `you spent $${(monthlySpending - lastMonthTotalSpending).toFixed(2)} more.`
      : monthlySpending < lastMonthTotalSpending
      ? `you spent $${(lastMonthTotalSpending - monthlySpending).toFixed(2)} less.`
      : `your spending was about the same.`;
      
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
  
  // Auto-generate insights on load if there's data
  useEffect(() => {
    if (transactions.length > 0 && monthlySpending > 0) {
      generateInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]); // Dependency on transactions is important

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Lightbulb className="h-6 w-6 text-accent" /> AI Spending Insights
        </CardTitle>
        <CardDescription>Discover patterns and tips from your spending.</CardDescription>
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
        {!insights && !isLoading && !error && transactions.length > 0 && monthlySpending > 0 && (
           <p className="text-sm text-muted-foreground">Click the button to generate insights.</p>
        )}
         {!insights && !isLoading && !error && (transactions.length === 0 || monthlySpending === 0) && (
           <p className="text-sm text-muted-foreground">Add some transactions to get insights.</p>
        )}
        <Button onClick={generateInsights} disabled={isLoading || transactions.length === 0 || monthlySpending === 0} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
          <Zap className="mr-2 h-4 w-4" />
          {isLoading ? "Generating..." : "Refresh Insights"}
        </Button>
      </CardContent>
    </Card>
  );
}

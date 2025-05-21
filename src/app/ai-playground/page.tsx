
"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FlaskConical, Wand2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { getTransactions } from '@/lib/actions/transactions';
import type { AppTransaction, GoalForecasterInput, GoalForecasterOutput } from '@/lib/types';
import { forecastFinancialGoal } from '@/ai/flows/goal-forecaster-flow';
import { subMonths, getMonth, getYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

export default function AIPlaygroundPage() {
  const { toast } = useToast();
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [goalDescription, setGoalDescription] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalDurationMonths, setGoalDurationMonths] = useState<string>('');

  const [isAILoading, setIsAILoading] = useState<boolean>(false);
  const [aiForecast, setAiForecast] = useState<GoalForecasterOutput | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchTransactionsCallback = useCallback(async () => {
    setIsLoadingTransactions(true);
    try {
      const fetchedTransactions = await getTransactions();
      setAllTransactions(fetchedTransactions.map(t => ({ ...t, date: new Date(t.date) })));
    } catch (error) {
      console.error("Failed to fetch transactions for AI Playground:", error);
      toast({
        title: "Error Loading Transaction Data",
        description: "Could not fetch necessary transaction data for AI analysis.",
        variant: "destructive",
      });
      setAllTransactions([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTransactionsCallback();
  }, [fetchTransactionsCallback]);

  const calculateAverages = useCallback(() => {
    const today = new Date();
    let totalIncomeLast6Months = 0;
    let totalExpensesLast6Months = 0;
    const monthSet = new Set<string>(); // To count unique months with data

    for (let i = 0; i < 6; i++) { // Look at last 6 months
      const targetDate = subMonths(today, i);
      const monthKey = `${getYear(targetDate)}-${getMonth(targetDate)}`;
      
      let monthHasData = false;
      allTransactions.forEach(t => {
        const transactionDate = new Date(t.date);
        if (transactionDate.getFullYear() === getYear(targetDate) && transactionDate.getMonth() === getMonth(targetDate)) {
          monthHasData = true;
          if (t.type === 'income') totalIncomeLast6Months += t.amount;
          if (t.type === 'expense') totalExpensesLast6Months += t.amount;
        }
      });
      if (monthHasData) monthSet.add(monthKey);
    }
    
    const numberOfMonthsWithData = monthSet.size > 0 ? monthSet.size : 1; // Avoid division by zero

    const averageMonthlyIncome = totalIncomeLast6Months / numberOfMonthsWithData;
    const averageMonthlyExpenses = totalExpensesLast6Months / numberOfMonthsWithData;
    const currentSavingsRate = averageMonthlyIncome > 0 ? ((averageMonthlyIncome - averageMonthlyExpenses) / averageMonthlyIncome) * 100 : 0;

    return {
      averageMonthlyIncome: parseFloat(averageMonthlyIncome.toFixed(2)),
      averageMonthlyExpenses: parseFloat(averageMonthlyExpenses.toFixed(2)),
      currentSavingsRate: parseFloat(currentSavingsRate.toFixed(1)),
    };
  }, [allTransactions]);

  const handleGetForecast = async () => {
    if (!goalDescription.trim() || !goalAmount || !goalDurationMonths) {
      toast({ title: "Missing Information", description: "Please fill in all goal details.", variant: "destructive" });
      return;
    }
    const amountNum = parseFloat(goalAmount);
    const durationNum = parseInt(goalDurationMonths, 10);

    if (isNaN(amountNum) || amountNum <= 0 || isNaN(durationNum) || durationNum <= 0) {
      toast({ title: "Invalid Input", description: "Goal amount and duration must be positive numbers.", variant: "destructive" });
      return;
    }

    if (allTransactions.length < 10 && !isLoadingTransactions) { // Check if enough data for meaningful average
        toast({ title: "Insufficient Data", description: "Not enough transaction history (need at least a few months) for an accurate forecast. Please add more transactions.", variant: "default" });
        // Optionally, allow proceeding but with a warning or default values for averages
        // For now, we prevent proceeding.
        // return; 
    }


    setIsAILoading(true);
    setAiForecast(null);
    setAiError(null);

    const averages = calculateAverages();
    if (averages.averageMonthlyIncome <=0 && allTransactions.length > 0) {
        toast({ title: "Data Issue", description: "Average monthly income could not be calculated (is it zero or negative?). Please check your recent transaction data.", variant: "destructive"});
        setIsAILoading(false);
        return;
    }


    const input: GoalForecasterInput = {
      goalDescription,
      goalAmount: amountNum,
      goalDurationMonths: durationNum,
      averageMonthlyIncome: averages.averageMonthlyIncome || 1, // Prevent 0 for AI model, it will be handled by prompt
      averageMonthlyExpenses: averages.averageMonthlyExpenses || 0,
      currentSavingsRate: averages.currentSavingsRate || 0,
    };

    try {
      const result = await forecastFinancialGoal(input);
      if (result.feasibilityAssessment === "Error") {
        setAiError(result.suggestedActions.join(' '));
        toast({title: "AI Forecast Error", description: result.suggestedActions.join(' ') || "Could not generate forecast.", variant: "destructive"})
      } else {
        setAiForecast(result);
      }
    } catch (err: any) {
      console.error("Error getting AI forecast:", err);
      const message = err.message || "Failed to get AI forecast.";
      setAiError(message);
      toast({ title: "AI Error", description: message, variant: "destructive" });
    } finally {
      setIsAILoading(false);
    }
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <FlaskConical className="w-7 h-7 md:w-8 md:h-8 text-accent transform rotate-[-3deg]" />
              AI Financial Goal Planner
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Define your financial goal and let AI help you plan for it.
              Analysis is based on your average income/expenses from the last 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.div variants={cardVariants} className="space-y-4 p-4 border rounded-lg bg-background/50 border-primary/20">
              <div>
                <Label htmlFor="goalDescription" className="text-foreground/90">What's your financial goal?</Label>
                <Textarea
                  id="goalDescription"
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="e.g., Save for a down payment on a new car, Trip to Bali, New Gaming Laptop"
                  className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="goalAmount" className="text-foreground/90">Target Amount (₹)</Label>
                  <Input
                    id="goalAmount"
                    type="number"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="e.g., 50000"
                    className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  />
                </div>
                <div>
                  <Label htmlFor="goalDurationMonths" className="text-foreground/90">Target Duration (Months)</Label>
                  <Input
                    id="goalDurationMonths"
                    type="number"
                    value={goalDurationMonths}
                    onChange={(e) => setGoalDurationMonths(e.target.value)}
                    placeholder="e.g., 12"
                    className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>
              <Button onClick={handleGetForecast} disabled={isAILoading || isLoadingTransactions} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" withMotion>
                {isAILoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                {isLoadingTransactions ? "Loading transaction data..." : (isAILoading ? "Forecasting..." : "Get AI Forecast")}
              </Button>
            </motion.div>

            {isAILoading && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-background/50 border-primary/20">
                <CardTitle className="text-lg text-primary mb-2">AI Analyzing Your Goal...</CardTitle>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4 bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-5/6 bg-muted" />
                </div>
              </motion.div>
            )}

            {aiError && !isAILoading && (
              <motion.div variants={cardVariants}>
                <Alert variant="destructive" className="shadow-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>AI Forecast Error</AlertTitle>
                  <AlertDescription>{aiError}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {aiForecast && !isAILoading && !aiError && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-accent/10 border-accent/30">
                <CardTitle className="text-lg text-accent dark:text-accent-foreground mb-3">FinWise AI Forecast &amp; Plan</CardTitle>
                <div className="space-y-3 text-sm">
                  <p><strong className="text-foreground">Goal:</strong> {goalDescription}</p>
                  <p><strong className="text-foreground">Target:</strong> ₹{parseFloat(goalAmount).toLocaleString()} in {goalDurationMonths} months</p>
                  <hr className="border-accent/30 my-2"/>
                  <p><strong className="text-foreground">Feasibility:</strong> <span className={cn(
                      aiForecast.feasibilityAssessment.includes("Feasible") ? "text-green-600 dark:text-green-400" :
                      aiForecast.feasibilityAssessment.includes("Challenging") ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    )}>{aiForecast.feasibilityAssessment}</span>
                  </p>
                  {aiForecast.projectedMonthsToGoal && (
                     <p><strong className="text-foreground">Projected time with current habits:</strong> {aiForecast.projectedMonthsToGoal} months</p>
                  )}
                  <p><strong className="text-foreground">Required Monthly Savings for Goal:</strong> <span className="font-semibold text-primary">₹{aiForecast.requiredMonthlySavings.toLocaleString()}</span></p>
                  
                  <div className="mt-2">
                    <strong className="text-foreground block mb-1">Actionable Suggestions:</strong>
                    <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/90">
                      {aiForecast.suggestedActions.map((action, index) => (
                        <li key={index}>{action}</li>
                      ))}
                    </ul>
                  </div>
                  {aiForecast.motivationalMessage && (
                    <p className="mt-3 pt-2 border-t border-accent/20 italic text-accent/80 dark:text-accent-foreground/80">{aiForecast.motivationalMessage}</p>
                  )}
                </div>
              </motion.div>
            )}
             {(!aiForecast && !isAILoading && !aiError && !isLoadingTransactions && allTransactions.length < 1) && (
                <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                    <FlaskConical className="h-4 w-4"/>
                    <AlertTitle>Start Planning!</AlertTitle>
                    <AlertDescription>
                        Enter your goal details above. The AI needs some transaction history (ideally a few months) to provide the best forecast. If you've just started, add some transactions first!
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

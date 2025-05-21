
"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FlaskConical, Wand2, AlertTriangle, PiggyBank } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { getTransactions, getCategories as fetchCategories } from '@/lib/actions/transactions';
import type { AppTransaction, GoalForecasterInput, GoalForecasterOutput, BudgetingAssistantInput, BudgetingAssistantOutput, Category } from '@/lib/types';
import { forecastFinancialGoal } from '@/ai/flows/goal-forecaster-flow';
import { suggestBudgetPlan } from '@/ai/flows/budgeting-assistant-flow';
import { subMonths, getMonth, getYear, startOfMonth, endOfMonth } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";
const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"]; // From yearly-overview

export default function AIPlaygroundPage() {
  const { toast } = useToast();
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  // Goal Planner State
  const [goalDescription, setGoalDescription] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalDurationMonths, setGoalDurationMonths] = useState<string>('');
  const [isAILoadingGoal, setIsAILoadingGoal] = useState<boolean>(false);
  const [aiForecast, setAiForecast] = useState<GoalForecasterOutput | null>(null);
  const [aiGoalError, setAiGoalError] = useState<string | null>(null);

  // Budgeting Assistant State
  const [statedMonthlyIncome, setStatedMonthlyIncome] = useState<string>('');
  const [savingsGoalPercentage, setSavingsGoalPercentage] = useState<string>('');
  const [isAILoadingBudget, setIsAILoadingBudget] = useState<boolean>(false);
  const [aiBudgetPlan, setAiBudgetPlan] = useState<BudgetingAssistantOutput | null>(null);
  const [aiBudgetError, setAiBudgetError] = useState<string | null>(null);


  const fetchInitialDataCallback = useCallback(async () => {
    setIsLoadingTransactions(true);
    try {
      const [fetchedTransactions, fetchedCategories] = await Promise.all([
        getTransactions(),
        fetchCategories()
      ]);
      setAllTransactions(fetchedTransactions.map(t => ({ ...t, date: new Date(t.date) })));
      setAllCategories(fetchedCategories);
    } catch (error) {
      console.error("Failed to fetch initial data for AI Playground:", error);
      toast({
        title: "Error Loading Initial Data",
        description: "Could not fetch transaction or category data for AI analysis.",
        variant: "destructive",
      });
      setAllTransactions([]);
      setAllCategories([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialDataCallback();
  }, [fetchInitialDataCallback]);

  const calculateGoalPlannerAverages = useCallback(() => {
    const today = new Date();
    let totalIncomeLast6Months = 0;
    let totalExpensesLast6Months = 0;
    const monthSet = new Set<string>(); 

    for (let i = 0; i < 6; i++) { 
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
    
    const numberOfMonthsWithData = monthSet.size > 0 ? monthSet.size : 1;

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

    if (allTransactions.length < 3 && !isLoadingTransactions) { 
        toast({ title: "Insufficient Data", description: "Not enough transaction history for an accurate forecast. Please add more transactions.", variant: "default" });
    }

    setIsAILoadingGoal(true);
    setAiForecast(null);
    setAiGoalError(null);

    const averages = calculateGoalPlannerAverages();
    if (averages.averageMonthlyIncome <=0 && allTransactions.length > 0) {
        toast({ title: "Data Issue", description: "Average monthly income could not be calculated (is it zero or negative?). Please check your recent transaction data.", variant: "destructive"});
        setIsAILoadingGoal(false);
        return;
    }

    const input: GoalForecasterInput = {
      goalDescription,
      goalAmount: amountNum,
      goalDurationMonths: durationNum,
      averageMonthlyIncome: averages.averageMonthlyIncome || 1, 
      averageMonthlyExpenses: averages.averageMonthlyExpenses || 0,
      currentSavingsRate: Math.max(0, Math.min(100, averages.currentSavingsRate || 0)), // Ensure rate is 0-100
    };

    try {
      const result = await forecastFinancialGoal(input);
      if (result.feasibilityAssessment === "Error" || result.feasibilityAssessment === "Input Error") {
        setAiGoalError(result.suggestedActions.join(' '));
        toast({title: "AI Forecast Error", description: result.suggestedActions.join(' ') || "Could not generate forecast.", variant: "destructive"})
      } else {
        setAiForecast(result);
      }
    } catch (err: any) {
      console.error("Error getting AI forecast:", err);
      const message = err.message || "Failed to get AI forecast.";
      setAiGoalError(message);
      toast({ title: "AI Error", description: message, variant: "destructive" });
    } finally {
      setIsAILoadingGoal(false);
    }
  };

  const calculateBudgetingAssistantInputs = useCallback(() => {
    const today = new Date();
    let totalExpensesLast3Months = 0;
    const spendingByTypeLast3Months: Record<ExpenseType, number> = { need: 0, want: 0, investment_expense: 0 };
    const spendingByCategoryLast3Months: Record<string, number> = {};
    const monthSet = new Set<string>();

    for (let i = 0; i < 3; i++) { // Look at last 3 full months
      const targetMonthDate = subMonths(today, i + 1); // i+1 to get previous full months
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);
      
      let monthHasData = false;
      allTransactions.forEach(t => {
        const transactionDate = new Date(t.date);
        if (transactionDate >= monthStart && transactionDate <= monthEnd) {
          monthHasData = true;
          if (t.type === 'expense') {
            totalExpensesLast3Months += t.amount;
            if (t.expenseType) {
              spendingByTypeLast3Months[t.expenseType] = (spendingByTypeLast3Months[t.expenseType] || 0) + t.amount;
            }
            if (t.category?.name) {
              spendingByCategoryLast3Months[t.category.name] = (spendingByCategoryLast3Months[t.category.name] || 0) + t.amount;
            }
          }
        }
      });
      if (monthHasData) monthSet.add(`${getYear(monthStart)}-${getMonth(monthStart)}`);
    }
    
    const numberOfMonthsWithData = monthSet.size > 0 ? monthSet.size : 1;
    const averagePastMonthlyExpenses = totalExpensesLast3Months / numberOfMonthsWithData;

    const topCategories = Object.entries(spendingByCategoryLast3Months)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3) // Top 3 categories
      .map(([name, total]) => `${name}: ₹${(total / numberOfMonthsWithData).toFixed(0)}`)
      .join(', ');

    const pastSpendingBreakdown = `Average spending over last ${numberOfMonthsWithData} month(s): Needs: ₹${(spendingByTypeLast3Months.need / numberOfMonthsWithData).toFixed(0)}, Wants: ₹${(spendingByTypeLast3Months.want / numberOfMonthsWithData).toFixed(0)}, Investments (as expense): ₹${(spendingByTypeLast3Months.investment_expense / numberOfMonthsWithData).toFixed(0)}. Top categories: ${topCategories || 'N/A'}.`;
    
    return { averagePastMonthlyExpenses, pastSpendingBreakdown };
  }, [allTransactions]);


  const handleGetBudgetPlan = async () => {
    const incomeNum = parseFloat(statedMonthlyIncome);
    const savingsGoalNum = parseFloat(savingsGoalPercentage);

    if (isNaN(incomeNum) || incomeNum <= 0) {
        toast({ title: "Invalid Income", description: "Monthly income must be a positive number.", variant: "destructive" });
        return;
    }
    if (isNaN(savingsGoalNum) || savingsGoalNum < 0 || savingsGoalNum > 100) {
        toast({ title: "Invalid Savings Goal", description: "Savings goal percentage must be between 0 and 100.", variant: "destructive" });
        return;
    }
     if (allTransactions.length < 3 && !isLoadingTransactions) { 
        toast({ title: "Insufficient Data", description: "Not enough transaction history for budgeting. Please add more transactions.", variant: "default" });
    }

    setIsAILoadingBudget(true);
    setAiBudgetPlan(null);
    setAiBudgetError(null);

    const { averagePastMonthlyExpenses, pastSpendingBreakdown } = calculateBudgetingAssistantInputs();

    const input: BudgetingAssistantInput = {
      statedMonthlyIncome: incomeNum,
      statedMonthlySavingsGoalPercentage: savingsGoalNum,
      averagePastMonthlyExpenses: averagePastMonthlyExpenses || 0,
      pastSpendingBreakdown: pastSpendingBreakdown || "No significant past spending data available.",
    };

    try {
      const result = await suggestBudgetPlan(input);
      if (result.analysisSummary.includes("Could not generate budget") || result.analysisSummary.includes("error occurred")) {
        setAiBudgetError(result.analysisSummary + " " + (result.detailedSuggestions?.categoryAdjustments?.join(' ') || ''));
        toast({title: "AI Budgeting Error", description: result.analysisSummary, variant: "destructive"})
      } else {
        setAiBudgetPlan(result);
      }
    } catch (err: any) {
      console.error("Error getting AI budget plan:", err);
      const message = err.message || "Failed to get AI budget plan.";
      setAiBudgetError(message);
      toast({ title: "AI Error", description: message, variant: "destructive" });
    } finally {
      setIsAILoadingBudget(false);
    }
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 bg-background/80 backdrop-blur-sm">
      {/* AI Financial Goal Planner Section */}
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
              <Button onClick={handleGetForecast} disabled={isAILoadingGoal || isLoadingTransactions} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" withMotion>
                {isAILoadingGoal ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                {isLoadingTransactions ? "Loading data..." : (isAILoadingGoal ? "Forecasting..." : "Get AI Forecast")}
              </Button>
            </motion.div>

            {isAILoadingGoal && (
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

            {aiGoalError && !isAILoadingGoal && (
              <motion.div variants={cardVariants}>
                <Alert variant="destructive" className="shadow-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>AI Goal Forecast Error</AlertTitle>
                  <AlertDescription>{aiGoalError}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {aiForecast && !isAILoadingGoal && !aiGoalError && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-accent/10 border-accent/30">
                <CardTitle className="text-lg text-accent dark:text-accent-foreground mb-3">FinWise AI Goal Forecast &amp; Plan</CardTitle>
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
             {(!aiForecast && !isAILoadingGoal && !aiGoalError && !isLoadingTransactions && allTransactions.length < 1) && (
                <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                    <FlaskConical className="h-4 w-4"/>
                    <AlertTitle>Start Planning!</AlertTitle>
                    <AlertDescription>
                        Enter your goal details above. The AI needs some transaction history (ideally a few months) for an accurate forecast. If you've just started, add some transactions first!
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* AI Budgeting Assistant Section */}
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="mt-8">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <PiggyBank className="w-7 h-7 md:w-8 md:h-8 text-accent transform scale-x-[-1]" />
              AI Budgeting Assistant
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Get a personalized budget plan based on your income, savings goals, and past spending (avg. last 3 months).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.div variants={cardVariants} className="space-y-4 p-4 border rounded-lg bg-background/50 border-primary/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="statedMonthlyIncome" className="text-foreground/90">Your Stated Monthly Income (₹)</Label>
                  <Input
                    id="statedMonthlyIncome"
                    type="number"
                    value={statedMonthlyIncome}
                    onChange={(e) => setStatedMonthlyIncome(e.target.value)}
                    placeholder="e.g., 60000"
                    className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  />
                </div>
                <div>
                  <Label htmlFor="savingsGoalPercentage" className="text-foreground/90">Monthly Savings Goal (%)</Label>
                  <Input
                    id="savingsGoalPercentage"
                    type="number"
                    value={savingsGoalPercentage}
                    onChange={(e) => setSavingsGoalPercentage(e.target.value)}
                    placeholder="e.g., 20 for 20%"
                    min="0" max="100"
                    className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>
              <Button onClick={handleGetBudgetPlan} disabled={isAILoadingBudget || isLoadingTransactions} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" withMotion>
                {isAILoadingBudget ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                {isLoadingTransactions ? "Loading data..." : (isAILoadingBudget ? "Generating Budget..." : "Get AI Budget Plan")}
              </Button>
            </motion.div>

            {isAILoadingBudget && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-background/50 border-primary/20">
                <CardTitle className="text-lg text-primary mb-2">AI Crafting Your Budget...</CardTitle>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4 bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-5/6 bg-muted" />
                </div>
              </motion.div>
            )}

            {aiBudgetError && !isAILoadingBudget && (
              <motion.div variants={cardVariants}>
                <Alert variant="destructive" className="shadow-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>AI Budgeting Error</AlertTitle>
                  <AlertDescription>{aiBudgetError}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {aiBudgetPlan && !isAILoadingBudget && !aiBudgetError && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-accent/10 border-accent/30">
                <CardTitle className="text-lg text-accent dark:text-accent-foreground mb-3">FinWise AI Budget Plan</CardTitle>
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Recommended Monthly Budget (₹):</h4>
                    <ul className="list-disc list-inside pl-4 space-y-1 text-foreground/90">
                      <li>Needs: ₹{aiBudgetPlan.recommendedMonthlyBudget.needs.toLocaleString()}</li>
                      <li>Wants: ₹{aiBudgetPlan.recommendedMonthlyBudget.wants.toLocaleString()}</li>
                      <li>Investments (as Spending): ₹{aiBudgetPlan.recommendedMonthlyBudget.investmentsAsSpending.toLocaleString()}</li>
                      <li>Target Savings: ₹{aiBudgetPlan.recommendedMonthlyBudget.targetSavings.toLocaleString()}</li>
                      <li>Discretionary/Extra Savings: ₹{aiBudgetPlan.recommendedMonthlyBudget.discretionarySpendingOrExtraSavings.toLocaleString()}</li>
                    </ul>
                  </div>
                  <hr className="border-accent/30 my-2"/>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Analysis & Summary:</h4>
                    <p className="text-foreground/90 whitespace-pre-wrap">{aiBudgetPlan.analysisSummary}</p>
                  </div>
                   <div>
                    <h4 className="font-semibold text-foreground mb-1">Detailed Suggestions:</h4>
                    {aiBudgetPlan.detailedSuggestions.categoryAdjustments.length > 0 && (
                        <>
                            <p className="text-foreground/80 italic text-xs">Category Adjustments:</p>
                            <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/90">
                            {aiBudgetPlan.detailedSuggestions.categoryAdjustments.map((action, index) => (
                                <li key={`cat-${index}`}>{action}</li>
                            ))}
                            </ul>
                        </>
                    )}
                    {aiBudgetPlan.detailedSuggestions.generalTips.length > 0 && (
                        <>
                             <p className="text-foreground/80 italic text-xs mt-2">General Tips:</p>
                            <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/90">
                            {aiBudgetPlan.detailedSuggestions.generalTips.map((tip, index) => (
                                <li key={`tip-${index}`}>{tip}</li>
                            ))}
                            </ul>
                        </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
             {(!aiBudgetPlan && !isAILoadingBudget && !aiBudgetError && !isLoadingTransactions && allTransactions.length < 1) && (
                <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                    <PiggyBank className="h-4 w-4"/>
                    <AlertTitle>Start Budgeting!</AlertTitle>
                    <AlertDescription>
                        Enter your income and savings goal. The AI needs some transaction history (ideally 3 months) for a good plan. If you've just started, add some transactions first!
                    </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

    </main>
  );
}

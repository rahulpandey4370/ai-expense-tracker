
"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FlaskConical, Wand2, AlertTriangle, PiggyBank, Target, Trash2, Wallet, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { getTransactions } from '@/lib/actions/transactions';
import { addGoal, getGoals, updateGoalProgress, deleteGoal, type Goal } from '@/lib/actions/goals';
import type { AppTransaction, GoalForecasterInput, GoalForecasterOutput, BudgetingAssistantInput, BudgetingAssistantOutput, GoalInput, FinancialHealthCheckInput, FinancialHealthCheckOutput } from '@/lib/types';
import { forecastFinancialGoal } from '@/ai/flows/goal-forecaster-flow';
import { suggestBudgetPlan } from '@/ai/flows/budgeting-assistant-flow';
import { getFinancialHealthCheck } from '@/ai/flows/financial-health-check-flow';
import { subMonths, getMonth, getYear, startOfMonth, endOfMonth, format, addMonths, differenceInMonths, startOfWeek, endOfWeek } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";
type HealthCheckPeriodType = 'current_week' | 'current_month';

export default function AIPlaygroundPage() {
  const { toast } = useToast();
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  // Goal Planner State
  const [goalDescription, setGoalDescription] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>(''); // User input, can be empty
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

  // Saved Goals State
  const [savedGoals, setSavedGoals] = useState<Goal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  // Financial Health Check State
  const [healthCheckPeriodType, setHealthCheckPeriodType] = useState<HealthCheckPeriodType>('current_week');
  const [isAILoadingHealthCheck, setIsAILoadingHealthCheck] = useState<boolean>(false);
  const [aiHealthCheckSummary, setAiHealthCheckSummary] = useState<FinancialHealthCheckOutput | null>(null);
  const [aiHealthCheckError, setAiHealthCheckError] = useState<string | null>(null);


  const fetchInitialDataCallback = useCallback(async () => {
    setIsLoadingTransactions(true);
    setIsLoadingGoals(true);
    try {
      const [fetchedTransactions, fetchedGoals] = await Promise.all([
        getTransactions(),
        getGoals()
      ]);
      setAllTransactions(fetchedTransactions.map(t => ({ ...t, date: new Date(t.date) })));
      setSavedGoals(fetchedGoals.map(g => ({...g, createdAt: new Date(g.createdAt), updatedAt: new Date(g.updatedAt) })));
    } catch (error) {
      console.error("Failed to fetch initial data for AI Playground:", error);
      toast({
        title: "Error Loading Initial Data",
        description: "Could not fetch transaction or goal data.",
        variant: "destructive",
      });
      setAllTransactions([]);
      setSavedGoals([]);
    } finally {
      setIsLoadingTransactions(false);
      setIsLoadingGoals(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialDataCallback();
  }, [fetchInitialDataCallback]);

  const calculateGoalPlannerAverages = useCallback(() => {
    const today = new Date();
    let totalIncomeLast6Months = 0;
    let totalCoreExpensesLast6Months = 0; // Changed to core expenses
    const monthSet = new Set<string>();
    const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];


    for (let i = 0; i < 6; i++) {
      const targetDate = subMonths(today, i);
      const monthKey = `${getYear(targetDate)}-${getMonth(targetDate)}`;

      let monthHasData = false;
      allTransactions.forEach(t => {
        const transactionDate = new Date(t.date);
        if (transactionDate.getFullYear() === getYear(targetDate) && transactionDate.getMonth() === getMonth(targetDate)) {
          monthHasData = true;
          if (t.type === 'income') totalIncomeLast6Months += t.amount;
          if (t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && !(t.category && investmentCategoryNames.includes(t.category.name))) {
             totalCoreExpensesLast6Months += t.amount;
          }
        }
      });
      if (monthHasData) monthSet.add(monthKey);
    }

    const numberOfMonthsWithData = monthSet.size > 0 ? monthSet.size : 1;

    const averageMonthlyIncome = totalIncomeLast6Months / numberOfMonthsWithData;
    const averageMonthlyCoreExpenses = totalCoreExpensesLast6Months / numberOfMonthsWithData; // Changed
    const currentSavingsRate = averageMonthlyIncome > 0 ? ((averageMonthlyIncome - averageMonthlyCoreExpenses) / averageMonthlyIncome) * 100 : 0;

    return {
      averageMonthlyIncome: parseFloat(averageMonthlyIncome.toFixed(2)),
      averageMonthlyExpenses: parseFloat(averageMonthlyCoreExpenses.toFixed(2)), // Renamed from averageMonthlyCoreExpenses
      currentSavingsRate: parseFloat(currentSavingsRate.toFixed(1)),
    };
  }, [allTransactions]);

  const handleGetForecast = async () => {
    if (!goalDescription.trim() || !goalDurationMonths) { // Amount is now optional
      toast({ title: "Missing Information", description: "Please fill in goal description and duration.", variant: "destructive" });
      return;
    }
    const amountNum = goalAmount ? parseFloat(goalAmount) : undefined; // Pass undefined if empty
    const durationNum = parseInt(goalDurationMonths, 10);

    if (amountNum !== undefined && (isNaN(amountNum) || amountNum <= 0)) {
      toast({ title: "Invalid Input", description: "If providing a target amount, it must be a positive number.", variant: "destructive" });
      return;
    }
     if (isNaN(durationNum) || durationNum <= 0) {
      toast({ title: "Invalid Input", description: "Goal duration must be a positive number.", variant: "destructive" });
      return;
    }


    if (allTransactions.length < 3 && !isLoadingTransactions) {
      toast({ title: "Insufficient Data", description: "Not enough transaction history for an accurate forecast. Please add more transactions.", variant: "default" });
    }

    setIsAILoadingGoal(true);
    setAiForecast(null);
    setAiGoalError(null);

    const averages = calculateGoalPlannerAverages();
     if (averages.averageMonthlyIncome <= 0 && allTransactions.length > 0 && (!amountNum || amountNum <=0)) { // Check if AI needs to estimate amount but no income
      toast({ title: "Data Issue", description: "Average monthly income is zero or negative. AI cannot estimate goal amount or forecast without income data. Please check your recent transaction data.", variant: "destructive" });
      setIsAILoadingGoal(false);
      return;
    }

    const input: GoalForecasterInput = {
      goalDescription,
      goalAmount: amountNum, // Can be undefined
      goalDurationMonths: durationNum,
      averageMonthlyIncome: averages.averageMonthlyIncome || 0.01, // Send a tiny amount if zero to avoid AI issues, flow handles 0 better
      averageMonthlyExpenses: averages.averageMonthlyExpenses || 0,
      currentSavingsRate: Math.max(0, Math.min(100, averages.currentSavingsRate || 0)),
    };

    try {
      const result = await forecastFinancialGoal(input);
      if (result.feasibilityAssessment === "Error" || result.feasibilityAssessment === "Input Error" || result.feasibilityAssessment.toLowerCase().includes("error")) {
        const errorMsg = result.suggestedActions.join(' ') || result.motivationalMessage || "Could not generate forecast.";
        setAiGoalError(errorMsg);
        toast({ title: "AI Forecast Error", description: errorMsg, variant: "destructive" })
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

  const handleSaveGoal = async () => {
    if (!aiForecast || !goalDescription.trim() || !goalDurationMonths) {
      toast({ title: "No Forecast to Save", description: "Please generate an AI forecast first.", variant: "destructive" });
      return;
    }
    setIsSavingGoal(true);
    const goalData: GoalInput = {
      description: goalDescription,
      targetAmount: aiForecast.estimatedOrProvidedGoalAmount, // Use amount from AI forecast
      targetDurationMonths: parseInt(goalDurationMonths, 10),
      initialRequiredMonthlySavings: aiForecast.requiredMonthlySavings,
    };
    try {
      await addGoal(goalData);
      toast({ title: "Goal Saved!", description: `'${goalDescription}' has been added to your goals.` });
      fetchInitialDataCallback();
      setAiForecast(null);
      setGoalDescription('');
      setGoalAmount('');
      setGoalDurationMonths('');
    } catch (error: any) {
      toast({ title: "Error Saving Goal", description: error.message || "Could not save the goal.", variant: "destructive" });
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleAllocateSavings = async (goalId: string) => {
    const amountStr = allocationAmounts[goalId];
    if (!amountStr) {
      toast({ title: "No Amount Entered", description: "Please enter an amount to allocate.", variant: "destructive" });
      return;
    }
    const amountToAllocate = parseFloat(amountStr);
    if (isNaN(amountToAllocate) || amountToAllocate <= 0) {
      toast({ title: "Invalid Amount", description: "Allocation amount must be a positive number.", variant: "destructive" });
      return;
    }

    setIsLoadingGoals(true);
    try {
      await updateGoalProgress(goalId, amountToAllocate);
      toast({ title: "Savings Allocated!", description: `₹${amountToAllocate} allocated to your goal.` });
      setAllocationAmounts(prev => ({ ...prev, [goalId]: '' }));
      fetchInitialDataCallback();
    } catch (error: any) {
      toast({ title: "Allocation Error", description: error.message || "Could not allocate savings.", variant: "destructive" });
      setIsLoadingGoals(false);
    }
  };

  const handleDeleteGoal = async (goalId: string, goalDesc: string) => {
    setIsLoadingGoals(true);
    try {
      await deleteGoal(goalId);
      toast({ title: "Goal Deleted", description: `'${goalDesc}' has been removed.` });
      fetchInitialDataCallback();
    } catch (error: any) {
      toast({ title: "Deletion Error", description: error.message || "Could not delete goal.", variant: "destructive" });
      setIsLoadingGoals(false);
    }
  };

  const calculateBudgetingAssistantInputs = useCallback(() => {
    const today = new Date();
    let totalCoreExpensesLast3Months = 0;
    const spendingByTypeLast3Months: Record<string, number> = { need: 0, want: 0, investment_expense: 0 };
    const spendingByCategoryLast3Months: Record<string, number> = {};
    const monthSet = new Set<string>();
    const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];

    for (let i = 0; i < 3; i++) {
      const targetMonthDate = subMonths(today, i + 1); // Analyze last 3 full months
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);

      let monthHasData = false;
      allTransactions.forEach(t => {
        const transactionDate = new Date(t.date);
        if (transactionDate >= monthStart && transactionDate <= monthEnd) {
          monthHasData = true;
          if (t.type === 'expense') {
            if (t.expenseType === 'need' || t.expenseType === 'want') {
                if (!(t.category && investmentCategoryNames.includes(t.category.name))) {
                     totalCoreExpensesLast3Months += t.amount;
                }
            }
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
    const averagePastMonthlyCoreExpenses = totalCoreExpensesLast3Months / numberOfMonthsWithData;

    const topCategories = Object.entries(spendingByCategoryLast3Months)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, total]) => `${name}: ₹${(total / numberOfMonthsWithData).toFixed(0)}`)
      .join(', ');

    const pastSpendingBreakdown = `Average spending over last ${numberOfMonthsWithData} month(s): Needs: ₹${(spendingByTypeLast3Months.need / numberOfMonthsWithData).toFixed(0)}, Wants: ₹${(spendingByTypeLast3Months.want / numberOfMonthsWithData).toFixed(0)}, Investments (as expense): ₹${(spendingByTypeLast3Months.investment_expense / numberOfMonthsWithData).toFixed(0)}. Top categories: ${topCategories || 'N/A'}.`;

    return { averagePastMonthlyExpenses: averagePastMonthlyCoreExpenses, pastSpendingBreakdown };
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
      toast({ title: "Insufficient Data", description: "Not enough transaction history (ideally 3 months) for meaningful budgeting. Please add more transactions.", variant: "default" });
    }

    setIsAILoadingBudget(true);
    setAiBudgetPlan(null);
    setAiBudgetError(null);

    const { averagePastMonthlyExpenses, pastSpendingBreakdown } = calculateBudgetingAssistantInputs();

    const input: BudgetingAssistantInput = {
      statedMonthlyIncome: incomeNum,
      statedMonthlySavingsGoalPercentage: savingsGoalNum,
      averagePastMonthlyExpenses: averagePastMonthlyExpenses || 0,
      pastSpendingBreakdown: pastSpendingBreakdown || "No significant past spending data available from the last 3 months.",
    };

    try {
      const result = await suggestBudgetPlan(input);
       if (result.analysisSummary.toLowerCase().includes("error") || result.analysisSummary.toLowerCase().includes("could not generate budget")) {
        setAiBudgetError(result.analysisSummary + " " + (result.detailedSuggestions?.categoryAdjustments?.join(' ') || ''));
        toast({ title: "AI Budgeting Error", description: result.analysisSummary, variant: "destructive" })
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

  const getTransactionsForDateRange = (startDate: Date, endDate: Date): AppTransaction[] => {
    return allTransactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  };

  const summarizeSpendingForAI = (transactions: AppTransaction[]): string => {
    if (transactions.length === 0) return "No spending in this period.";
    const spendingByType: Record<string, number> = { need: 0, want: 0, investment_expense: 0 };
    const spendingByCategory: Record<string, number> = {};

    transactions.filter(t => t.type === 'expense').forEach(t => {
      if (t.expenseType) spendingByType[t.expenseType] = (spendingByType[t.expenseType] || 0) + t.amount;
      if (t.category?.name) spendingByCategory[t.category.name] = (spendingByCategory[t.category.name] || 0) + t.amount;
    });

    const topCategoriesString = Object.entries(spendingByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([name, total]) => `${name}: ₹${total.toFixed(0)}`)
      .join(', ');

    return `Needs: ₹${spendingByType.need.toFixed(0)}, Wants: ₹${spendingByType.want.toFixed(0)}, Investments_Expenses: ₹${spendingByType.investment_expense.toFixed(0)}. Top categories: ${topCategoriesString || 'N/A'}.`;
  };

  const handleGetHealthCheck = async () => {
    setIsAILoadingHealthCheck(true);
    setAiHealthCheckSummary(null);
    setAiHealthCheckError(null);

    const today = new Date();
    let currentPeriodStart: Date, currentPeriodEnd: Date;
    let previousPeriodStart: Date, previousPeriodEnd: Date;
    let periodDescription = "";
    const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];


    if (healthCheckPeriodType === 'current_week') {
      currentPeriodStart = startOfWeek(today, { weekStartsOn: 1 }); 
      currentPeriodEnd = endOfWeek(today, { weekStartsOn: 1 }); 
      previousPeriodStart = startOfWeek(subMonths(currentPeriodStart, 0.25), { weekStartsOn: 1 }); 
      previousPeriodEnd = endOfWeek(previousPeriodStart, { weekStartsOn: 1 }); 
      periodDescription = `This Week (${format(currentPeriodStart, "MMM d")} - ${format(currentPeriodEnd, "MMM d, yyyy")})`;
    } else { 
      currentPeriodStart = startOfMonth(today);
      currentPeriodEnd = endOfMonth(today);
      const prevMonthDate = subMonths(today,1);
      previousPeriodStart = startOfMonth(prevMonthDate);
      previousPeriodEnd = endOfMonth(prevMonthDate);
      periodDescription = `This Month (${format(currentPeriodStart, "MMMM yyyy")})`;
    }

    const currentTransactions = getTransactionsForDateRange(currentPeriodStart, currentPeriodEnd);
    const previousTransactions = getTransactionsForDateRange(previousPeriodStart, previousPeriodEnd);

    if (currentTransactions.length === 0) {
        setAiHealthCheckError(`No transactions found for ${periodDescription} to generate a health check.`);
        toast({title: "Insufficient Data", description: `No transactions for ${periodDescription}.`, variant:"default"});
        setIsAILoadingHealthCheck(false);
        return;
    }
    
    const currentCoreExpenses = currentTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && !(t.category && investmentCategoryNames.includes(t.category.name)))
        .reduce((sum, t) => sum + t.amount, 0);
    const previousCoreExpenses = previousTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && !(t.category && investmentCategoryNames.includes(t.category.name)))
        .reduce((sum, t) => sum + t.amount, 0);


    const input: FinancialHealthCheckInput = {
      periodDescription,
      currentTotalIncome: currentTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      currentTotalExpenses: currentCoreExpenses, // Use core expenses
      currentSpendingBreakdown: summarizeSpendingForAI(currentTransactions.filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && !(t.category && investmentCategoryNames.includes(t.category.name)))), // Pass only core expenses for breakdown
      previousTotalIncome: previousTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      previousTotalExpenses: previousCoreExpenses, // Use core expenses
    };

    try {
      const result = await getFinancialHealthCheck(input);
      if (result.healthSummary.toLowerCase().includes("error") || result.healthSummary.toLowerCase().includes("could not generate")) {
        setAiHealthCheckError(result.healthSummary);
        toast({ title: "AI Health Check Error", description: result.healthSummary, variant: "destructive" });
      } else {
        setAiHealthCheckSummary(result);
      }
    } catch (err: any) {
      console.error("Error getting AI health check:", err);
      const message = err.message || "Failed to get AI health check.";
      setAiHealthCheckError(message);
      toast({ title: "AI Error", description: message, variant: "destructive" });
    } finally {
      setIsAILoadingHealthCheck(false);
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
              Define your financial goal, get an AI forecast, and save it for tracking.
              Analysis is based on your average income/core expenses from the last 6 months.
              Target amount is optional; AI will estimate if left blank.
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
                  placeholder="e.g., Save for a down payment on a new car, Trip to Bali for 2, New Gaming Laptop"
                  className="mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="goalAmount" className="text-foreground/90">Target Amount (₹) <span className="text-xs text-muted-foreground">(Optional - AI will estimate if blank)</span></Label>
                  <Input
                    id="goalAmount"
                    type="number"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="e.g., 50000 (or leave blank)"
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
                  <p><strong className="text-foreground">Target:</strong> ₹{aiForecast.estimatedOrProvidedGoalAmount.toLocaleString()} in {goalDurationMonths} months
                    {aiForecast.wasAmountEstimatedByAI && <span className="text-xs text-muted-foreground italic ml-1">(AI Estimated Amount)</span>}
                  </p>
                  <hr className="border-accent/30 my-2" />
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
                 <Button onClick={handleSaveGoal} disabled={isSavingGoal} className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white" withMotion>
                  {isSavingGoal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
                  Save This Goal
                </Button>
              </motion.div>
            )}
            {(!aiForecast && !isAILoadingGoal && !aiGoalError && !isLoadingTransactions && allTransactions.length < 1) && (
              <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                <FlaskConical className="h-4 w-4" />
                <AlertTitle>Start Planning!</AlertTitle>
                <AlertDescription>
                  Enter your goal details above. The AI needs some transaction history (ideally a few months) for an accurate forecast. If you've just started, add some transactions first!
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Saved Goals Section */}
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="mt-8">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <Target className="w-7 h-7 md:w-8 md:h-8 text-accent" />
              Your Saved Financial Goals
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Track your progress and allocate savings to your financial goals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingGoals && !savedGoals.length && (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p>Loading your saved goals...</p>
              </div>
            )}
            {!isLoadingGoals && savedGoals.length === 0 && (
              <Alert variant="default" className="border-primary/20 bg-primary/5">
                <Target className="h-5 w-5 text-primary" />
                <AlertTitle className="text-primary">No Saved Goals Yet</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Use the AI Goal Planner above to create and save your first financial goal!
                </AlertDescription>
              </Alert>
            )}
            {savedGoals.map((goal) => {
              const progress = goal.targetAmount > 0 ? (goal.amountSavedSoFar / goal.targetAmount) * 100 : 0;
              const targetDate = addMonths(new Date(goal.createdAt), goal.targetDurationMonths);
              const monthsRemaining = differenceInMonths(targetDate, new Date());

              return (
                <motion.div
                  key={goal.id}
                  variants={cardVariants}
                  className="p-4 border rounded-lg bg-background/50 border-primary/20 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-accent">{goal.description}</h3>
                      <p className="text-xs text-muted-foreground">
                        Target: ₹{goal.targetAmount.toLocaleString()} by {format(targetDate, "MMM yyyy")} ({goal.targetDurationMonths} months)
                      </p>
                      {goal.initialRequiredMonthlySavings && (
                        <p className="text-xs text-muted-foreground">
                          AI Suggested Monthly Saving: ₹{goal.initialRequiredMonthlySavings.toLocaleString()}
                        </p>
                      )}
                    </div>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 p-1 h-7 w-7">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete Goal</span>
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Goal: {goal.description}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete your goal and its progress.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteGoal(goal.id, goal.description)} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress: ₹{goal.amountSavedSoFar.toLocaleString()} saved</span>
                      <span>{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-3 [&>div]:bg-accent" />
                     {goal.status === 'completed' && <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Goal Completed!</p>}
                     {goal.status === 'active' && monthsRemaining < 0 && goal.amountSavedSoFar < goal.targetAmount && (
                       <p className="text-xs text-orange-500 dark:text-orange-400">Target date passed.</p>
                     )}
                     {goal.status === 'active' && monthsRemaining >= 0 && (
                        <p className="text-xs text-muted-foreground">{monthsRemaining} month(s) remaining.</p>
                     )}
                  </div>
                  {goal.status !== 'completed' && (
                    <div className="flex flex-col sm:flex-row items-end gap-2 pt-2">
                      <div className="flex-grow w-full sm:w-auto">
                        <Label htmlFor={`allocate-${goal.id}`} className="text-xs text-foreground/80">Allocate Savings (₹)</Label>
                        <Input
                          id={`allocate-${goal.id}`}
                          type="number"
                          placeholder="e.g., 500"
                          value={allocationAmounts[goal.id] || ''}
                          onChange={(e) => setAllocationAmounts(prev => ({ ...prev, [goal.id]: e.target.value }))}
                          className="mt-1 h-9 text-sm bg-background/80 border-border/60 focus:border-accent"
                        />
                      </div>
                      <Button
                        onClick={() => handleAllocateSavings(goal.id)}
                        disabled={isLoadingGoals || !allocationAmounts[goal.id]?.trim()}
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto whitespace-nowrap"
                        withMotion
                      >
                        {isLoadingGoals && allocationAmounts[goal.id]?.trim() ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wallet className="mr-1.5 h-4 w-4" />}
                        Allocate
                      </Button>
                    </div>
                  )}
                </motion.div>
              )
            })}
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
              Get a personalized budget plan based on your income, savings goals, and past core spending (avg. last 3 months).
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
                  <hr className="border-accent/30 my-2" />
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
                <PiggyBank className="h-4 w-4" />
                <AlertTitle>Start Budgeting!</AlertTitle>
                <AlertDescription>
                  Enter your income and savings goal. The AI needs some transaction history (ideally 3 months) for a good plan. If you've just started, add some transactions first!
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

       {/* AI Financial Health Check Section */}
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="mt-8">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <Activity className="w-7 h-7 md:w-8 md:h-8 text-accent" />
              AI Financial Health Check
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Get a quick AI summary of your financial activity for the current week or month. Includes top spends and optimization tips.
              Analysis based on core expenses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.div variants={cardVariants} className="space-y-4 p-4 border rounded-lg bg-background/50 border-primary/20">
              <div>
                <Label htmlFor="healthCheckPeriod" className="text-foreground/90">Select Period</Label>
                <Select value={healthCheckPeriodType} onValueChange={(value) => setHealthCheckPeriodType(value as HealthCheckPeriodType)}>
                  <SelectTrigger id="healthCheckPeriod" className="w-full md:w-[200px] mt-1 bg-background/70 border-border/70 focus:border-primary focus:ring-primary">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_week">Current Week</SelectItem>
                    <SelectItem value="current_month">Current Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGetHealthCheck} disabled={isAILoadingHealthCheck || isLoadingTransactions} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" withMotion>
                {isAILoadingHealthCheck ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                {isLoadingTransactions ? "Loading data..." : (isAILoadingHealthCheck ? "Generating Summary..." : "Get Health Check")}
              </Button>
            </motion.div>

            {isAILoadingHealthCheck && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-background/50 border-primary/20">
                <CardTitle className="text-lg text-primary mb-2">AI Analyzing Your Financials...</CardTitle>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                  <Skeleton className="h-4 w-5/6 bg-muted" />
                </div>
              </motion.div>
            )}

            {aiHealthCheckError && !isAILoadingHealthCheck && (
              <motion.div variants={cardVariants}>
                <Alert variant="destructive" className="shadow-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>AI Health Check Error</AlertTitle>
                  <AlertDescription>{aiHealthCheckError}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            {aiHealthCheckSummary && !isAILoadingHealthCheck && !aiHealthCheckError && (
              <motion.div variants={cardVariants} className="p-4 border rounded-lg bg-accent/10 border-accent/30">
                <CardTitle className="text-lg text-accent dark:text-accent-foreground mb-3">FinWise AI Health Summary</CardTitle>
                <div className="space-y-2 text-sm text-foreground/90 whitespace-pre-wrap">
                  {aiHealthCheckSummary.healthSummary.split('\n').map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </motion.div>
            )}
             {(!aiHealthCheckSummary && !isAILoadingHealthCheck && !aiHealthCheckError && !isLoadingTransactions && allTransactions.length === 0) && (
              <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                <Activity className="h-4 w-4" />
                <AlertTitle>Start Your Health Check!</AlertTitle>
                <AlertDescription>
                  Select a period. The AI needs some transaction data to generate a summary.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

    </main>
  );
}


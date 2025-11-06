
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from "framer-motion";
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import { ExpenseTypeSplitChart } from "@/components/charts/expense-type-split-chart";
import type { AppTransaction, Category } from '@/lib/types';
import { getTransactions, getCategories } from '@/lib/actions/transactions';
import { Banknote, TrendingDown, PiggyBank, Percent, AlertTriangle, Loader2, HandCoins, Target, Landmark, LineChart, Wallet, Sigma, Plus, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { useToast } from "@/hooks/use-toast";
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { IncomeDistributionChart } from '@/components/charts/income-distribution-chart';
import { BudgetTrackerCard } from '@/components/budget-tracker-card';
import { useBudgetAlerts } from '@/hooks/use-budget-alerts';
import { Button } from '@/components/ui/button';
import { subMonths } from 'date-fns';
import { IncomeAllocationBar } from '@/components/income-allocation-bar';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
    },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";
const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];
const cashbackAndInterestAndDividendCategoryNames = ["Cashback", "Investment Income", "Dividends"];

const hardcodedBudgets = [
    { id: 'want-type', name: 'Wants (Expense Type)', amount: 10000, type: 'expenseType' as const, categoryId: 'want' },
    { id: 'groceries-cat', name: 'Groceries', amount: 5000, type: 'category' as const, categoryId: '' },
    { id: 'food-cat', name: 'Food and Dining', amount: 5000, type: 'category' as const, categoryId: '' },
    { id: 'transport-cat', name: 'Auto & Transportation', amount: 2000, type: 'category' as const, categoryId: '' },
];


export default function DashboardPage() {
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [kpisVisible, setKpisVisible] = useState(false);
  const addTransactionRef = useRef<HTMLDivElement>(null);

  const { selectedDate, selectedMonth, selectedYear, monthNamesList } = useDateSelection();
  const { toast } = useToast();

  const handleScrollToForm = () => {
    addTransactionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchAndSetData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [fetchedTransactions, fetchedCategories] = await Promise.all([
        getTransactions({ limit: 5000 }),
        getCategories(),
      ]);
      setTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)})));
      setAllCategories(fetchedCategories);
    } catch (error) {
      console.error("Failed to fetch data for dashboard:", error);
      toast({
        title: "Error Loading Data",
        description: error instanceof Error ? error.message : "Could not fetch data. Please try refreshing.",
        variant: "destructive",
      });
      setTransactions([]);
      setAllCategories([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    setIsClient(true);
    fetchAndSetData();
  }, [fetchAndSetData]);

  const handleAddTransactionCallback = async () => {
    try {
        await fetchAndSetData();
    } catch (error) {
        console.error("Error after attempting to add/update transaction:", error);
        toast({ title: "Data Sync Error", description: "Could not refresh data after the last operation.", variant: "destructive" });
    }
  };

  const currentMonthTransactions = useMemo(() => {
    return transactions.filter(
      t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() === selectedMonth && transactionDate.getFullYear() === selectedYear;
      }
    );
  }, [transactions, selectedMonth, selectedYear]);

  const monthlyMetrics = useMemo(() => {
    const income = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const needsExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.expenseType === 'need')
      .reduce((sum, t) => sum + t.amount, 0);

    const wantsExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.expenseType === 'want')
      .reduce((sum, t) => sum + t.amount, 0);

    const coreExpenses = needsExpenses + wantsExpenses;
    
    const totalInvestments = currentMonthTransactions
      .filter(t => t.type === 'expense' && 
                   (t.expenseType === 'investment' || 
                    (t.category && investmentCategoryNames.includes(t.category.name)))
      )
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalOutgoings = coreExpenses + totalInvestments;
    const availableToSaveOrInvest = income - coreExpenses; 
    const netMonthlyCashflow = income - totalOutgoings;
    const investmentPercentage = income > 0 ? (totalInvestments / income) * 100 : 0;
    const totalCashbackInterestsDividends = currentMonthTransactions
      .filter(t => t.type === 'income' && t.category && cashbackAndInterestAndDividendCategoryNames.includes(t.category.name))
      .reduce((sum, t) => sum + t.amount, 0);
    const cashSavingsPercentage = income > 0 ? (netMonthlyCashflow / income) * 100 : 0;
    const totalSavingsAndInvestmentPercentage = income > 0 ? ((income - coreExpenses) / income) * 100 : 0;

    return { 
      income,
      needsExpenses,
      wantsExpenses, 
      coreExpenses,
      totalInvestments,
      totalOutgoings,
      availableToSaveOrInvest,
      netMonthlyCashflow,
      investmentPercentage,
      totalCashbackInterestsDividends,
      cashSavingsPercentage,
      totalSavingsAndInvestmentPercentage
    };
  }, [currentMonthTransactions]);

  const previousMonthMetrics = useMemo(() => {
    const prevMonthDate = subMonths(selectedDate, 1);
    const lastMonth = prevMonthDate.getMonth();
    const yearForLastMonth = prevMonthDate.getFullYear();

    const lastMonthTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() === lastMonth && transactionDate.getFullYear() === yearForLastMonth;
    });

    const lastMonthCoreExpenses = lastMonthTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want'))
        .reduce((sum, t) => sum + t.amount, 0) || 0;

    const lastMonthSpendingByCategory = lastMonthTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && t.category?.name)
        .reduce((acc, t) => {
            const categoryName = t.category!.name;
            acc[categoryName] = (acc[categoryName] || 0) + t.amount;
            return acc;
        }, {} as Record<string, number>);

    return { lastMonthCoreExpenses, lastMonthSpendingByCategory };
  }, [transactions, selectedDate]);


  const budgetData = useMemo(() => {
        const resolvedBudgets = hardcodedBudgets.map(b => {
            if (b.type === 'category' && !b.categoryId) {
                const category = allCategories.find(c => c.name === b.name);
                return { ...b, categoryId: category?.id || '' };
            }
            return b;
        }).filter(b => b.categoryId); // Ensure we have an ID

        return resolvedBudgets.map(budget => {
            const spent = currentMonthTransactions
                .filter(t => {
                    if (budget.type === 'expenseType') return t.expenseType === budget.categoryId;
                    if (budget.type === 'category') return t.category?.id === budget.categoryId;
                    return false;
                })
                .reduce((sum, t) => sum + t.amount, 0);
            return {
                id: budget.id,
                name: budget.name,
                budgetAmount: budget.amount,
                spentAmount: spent,
            };
        });
    }, [currentMonthTransactions, allCategories]);

    useBudgetAlerts(budgetData);

  if (!isClient || isLoadingData) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse bg-background/30 backdrop-blur-sm">
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="ml-4 text-lg text-primary">Loading FinWise AI dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
        <motion.div 
          variants={sectionVariants} 
          initial="hidden" 
          animate="visible" 
          className="mb-6"
        >
            <IncomeAllocationBar 
                income={monthlyMetrics.income}
                needs={monthlyMetrics.needsExpenses}
                wants={monthlyMetrics.wantsExpenses}
                investments={monthlyMetrics.totalInvestments}
            />
        </motion.div>
        
        <div className="flex justify-end mb-4">
            <Button onClick={() => setKpisVisible(!kpisVisible)} variant="outline" size="icon" withMotion>
                {kpisVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                <span className="sr-only">{kpisVisible ? 'Hide Balances' : 'Show Balances'}</span>
            </Button>
        </div>
        
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Total Income" 
              value={`₹${monthlyMetrics.income.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={Banknote} 
              description={`${monthNamesList[selectedMonth]} ${selectedYear}`} 
              className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 dark:border-green-700/50 dark:bg-green-900/20 dark:hover:bg-green-800/30"
              kpiKey="totalIncome"
              insightText="Total earnings received this month from all sources."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Core Expenses" 
              value={`₹${monthlyMetrics.coreExpenses.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={TrendingDown} 
              description="Needs & Wants this month"
              valueClassName="text-red-500 dark:text-red-400" 
              className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 dark:border-red-700/50 dark:bg-red-900/20 dark:hover:bg-red-800/30"
              kpiKey="coreExpenses"
              insightText="Spending on daily necessities and discretionary items."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
           <motion.div variants={itemVariants}>
            <KpiCard 
              title="Total Investments" 
              value={`₹${monthlyMetrics.totalInvestments.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={Landmark} 
              description="Dedicated investment outflows"
              valueClassName="text-blue-500 dark:text-blue-400"
              className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-700/50 dark:bg-blue-900/20 dark:hover:bg-blue-800/30"
              kpiKey="totalInvestmentsAmount"
              insightText="Outflows towards investment assets like stocks, mutual funds, etc."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Total Outgoings" 
              value={`₹${monthlyMetrics.totalOutgoings.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={Sigma} 
              description={`Core: ₹${monthlyMetrics.coreExpenses.toFixed(0)} + Invest: ₹${monthlyMetrics.totalInvestments.toFixed(0)}`}
              valueClassName="text-orange-500 dark:text-orange-400" 
              className="border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 dark:border-orange-700/50 dark:bg-orange-900/20 dark:hover:bg-orange-800/30"
              kpiKey="totalOutgoings"
              insightText="Sum of all spending: daily expenses plus investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
             <KpiCard
              title="Cash Savings %"
              value={`${monthlyMetrics.cashSavingsPercentage.toFixed(1)}%`}
              isVisible={kpisVisible}
              icon={Percent}
              description={`Of total income: ₹${monthlyMetrics.income.toFixed(0)}`}
              valueClassName={monthlyMetrics.cashSavingsPercentage >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}
              className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 dark:border-green-400/50 dark:bg-green-800/20 dark:hover:bg-green-700/30"
              kpiKey="savingsPercentage" 
              insightText="Percentage of income saved as cash after all expenses and investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              secondaryTitle="Total Saved/Invested %"
              secondaryValue={`${monthlyMetrics.totalSavingsAndInvestmentPercentage.toFixed(1)}%`}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Cashback/Interests" 
              value={`₹${monthlyMetrics.totalCashbackInterestsDividends.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={HandCoins} 
              description={`${monthNamesList[selectedMonth]} ${selectedYear}`} 
              className="border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:hover:bg-yellow-800/30"
              kpiKey="cashbackInterests"
              insightText="Extra income from rewards, interest, and dividends."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Investment Rate %" 
              value={`${monthlyMetrics.investmentPercentage.toFixed(1)}%`} 
              isVisible={kpisVisible}
              icon={Target} 
              description={`Amount: ₹${monthlyMetrics.totalInvestments.toFixed(2)}`}
              valueClassName="text-indigo-500 dark:text-indigo-400"
              className="border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:hover:bg-indigo-800/30"
              kpiKey="investmentRate"
              insightText="Percentage of total income allocated to investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard 
              title="Cash Savings" 
              value={`₹${monthlyMetrics.netMonthlyCashflow.toFixed(2)}`} 
              isVisible={kpisVisible}
              icon={Wallet} 
              description="Actual cash saved after all outgoings"
              valueClassName={monthlyMetrics.netMonthlyCashflow >=0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"} 
              className="border-green-600/30 bg-green-600/10 hover:bg-green-600/20 dark:border-green-500/50 dark:bg-green-800/20 dark:hover:bg-green-700/30"
              kpiKey="cashSavings" 
              insightText="Actual cash saved after all income and all outgoings (including investments)."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
        </motion.div>

         {(kpisVisible && monthlyMetrics.totalOutgoings) > monthlyMetrics.income && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Alert 
              variant="destructive" 
              className={cn(
                "shadow-md border-destructive/50 bg-red-500/10 dark:bg-destructive/20", 
                glowClass
              )}
            >
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <AlertTitle className="text-red-700 dark:text-red-300">Spending Alert!</AlertTitle>
              <AlertDescription className="text-red-600 dark:text-red-400">
                Your total outgoings (core expenses + investments) exceeded your income in {monthNamesList[selectedMonth]} {selectedYear}.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
        
        {kpisVisible && (
            <motion.div variants={sectionVariants} initial="hidden" animate="visible">
                <BudgetTrackerCard budgets={budgetData} />
            </motion.div>
        )}

        <div ref={addTransactionRef} className="scroll-mt-20">
          <Card className={cn("p-0 sm:p-0 bg-card/80", glowClass)}>
            <TransactionForm onTransactionAdded={handleAddTransactionCallback} />
          </Card>
        </div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <SpendingInsights
              currentMonthTransactions={currentMonthTransactions}
              currentMonthCoreSpending={monthlyMetrics.coreExpenses}
              currentMonthInvestmentSpending={monthlyMetrics.totalInvestments}
              lastMonthCoreSpending={previousMonthMetrics.lastMonthCoreExpenses}
              lastMonthSpendingByCategory={previousMonthMetrics.lastMonthSpendingByCategory}
              selectedMonthName={monthNamesList[selectedMonth]}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <FinancialChatbot allTransactions={transactions} />
          </motion.div>
        </motion.div>

        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <RecentTransactionsList transactions={currentMonthTransactions} count={15} />
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-6" 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <IncomeDistributionChart
              transactions={currentMonthTransactions}
              selectedMonthName={monthNamesList[selectedMonth]}
              selectedYear={selectedYear}
              chartHeightClass="max-h-[350px] sm:max-h-[400px] min-h-[300px] sm:min-h-[350px] md:min-h-[400px]"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <ExpenseTypeSplitChart 
              transactions={currentMonthTransactions} 
              selectedMonthName={monthNamesList[selectedMonth]} 
              selectedYear={selectedYear}
              chartHeightClass="max-h-[350px] sm:max-h-[400px] min-h-[300px] sm:min-h-[350px] md:min-h-[400px]"
            />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <MonthlySpendingTrendChart transactions={transactions} numberOfMonths={3} />
            </motion.div>
            <motion.div variants={itemVariants}>
              <IncomeExpenseTrendChart transactions={transactions} numberOfMonths={3} />
            </motion.div>
          </div>
        </motion.div>
      </main>
      
      <Button 
        onClick={handleScrollToForm}
        className="md:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full bg-accent shadow-lg text-accent-foreground z-40"
        size="icon"
        aria-label="Add Transaction"
      >
        <Plus className="h-8 w-8" />
      </Button>
    </>
  );
}

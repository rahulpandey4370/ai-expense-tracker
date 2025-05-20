
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from "framer-motion";
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { ExpensePaymentMethodChart } from "@/components/charts/expense-payment-method-chart";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import type { AppTransaction } from '@/lib/types'; 
import { getTransactions } from '@/lib/actions/transactions'; 
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Percent, AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { useToast } from "@/hooks/use-toast";
import { Card } from '@/components/ui/card'; 
import { cn } from '@/lib/utils';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const { selectedDate, selectedMonth, selectedYear, monthNamesList } = useDateSelection();
  const { toast } = useToast();

  const fetchAndSetTransactions = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const fetchedTransactions = await getTransactions();
      setTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)})));
    } catch (error) {
      console.error("Failed to fetch transactions for dashboard:", error);
      toast({
        title: "Error Loading Data",
        description: error instanceof Error ? error.message : "Could not fetch transactions. Please try refreshing.",
        variant: "destructive",
      });
      setTransactions([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    setIsClient(true);
    fetchAndSetTransactions();
  }, [fetchAndSetTransactions]);

  const handleAddTransactionCallback = async () => { 
    try {
        await fetchAndSetTransactions(); 
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
    const spending = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const savings = income - spending;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    return { income, spending, savings, savingsRate };
  }, [currentMonthTransactions]);

  const lastMonthTotalSpending = useMemo(() => {
    const prevMonthDate = new Date(selectedDate);
    prevMonthDate.setDate(1); 
    prevMonthDate.setMonth(selectedDate.getMonth() - 1);

    const lastMonth = prevMonthDate.getMonth();
    const yearForLastMonth = prevMonthDate.getFullYear();

    return transactions
      .filter(t => {
        const transactionDate = new Date(t.date);
        return t.type === 'expense' && transactionDate.getMonth() === lastMonth && transactionDate.getFullYear() === yearForLastMonth;
      })
      .reduce((sum, t) => sum + t.amount, 0) || 0;
  }, [transactions, selectedDate]);


  if (!isClient || isLoadingData) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse bg-background/30 backdrop-blur-sm">
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="ml-4 text-lg text-primary">Loading dashboard data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
      <motion.div
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <KpiCard title="Total Income" value={`₹${monthlyMetrics.income.toFixed(2)}`} icon={DollarSign} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 dark:border-green-700/50 dark:bg-green-900/20 dark:hover:bg-green-800/30"/>
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard title="Total Expenses" value={`₹${monthlyMetrics.spending.toFixed(2)}`} icon={TrendingDown} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName="text-red-500 dark:text-red-400" className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 dark:border-red-700/50 dark:bg-red-900/20 dark:hover:bg-red-800/30"/>
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard title="Net Savings" value={`₹${monthlyMetrics.savings.toFixed(2)}`} icon={PiggyBank} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savings >= 0 ? "text-blue-500 dark:text-blue-400" : "text-orange-500 dark:text-orange-400"} className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-700/50 dark:bg-blue-900/20 dark:hover:bg-blue-800/30" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard title="Savings Rate" value={`${monthlyMetrics.savingsRate.toFixed(1)}%`} icon={Percent} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savingsRate >=0 ? "text-purple-500 dark:text-purple-400" : "text-yellow-500 dark:text-yellow-400"} className="border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 dark:border-purple-700/50 dark:bg-purple-900/20 dark:hover:bg-purple-800/30"/>
        </motion.div>
      </motion.div>

       {monthlyMetrics.spending > monthlyMetrics.income && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Alert variant="destructive" className={cn("shadow-md border-red-700/50 bg-red-600/20 text-red-100 dark:bg-red-900/30 dark:text-red-200", glowClass)}>
            <AlertTriangle className="h-5 w-5 text-red-300 dark:text-red-400" />
            <AlertTitle className="text-red-200 dark:text-red-300">Spending Alert!</AlertTitle>
            <AlertDescription className="text-red-300 dark:text-red-400">
              You've spent more than your income in {monthNamesList[selectedMonth]} {selectedYear}. Review your expenses.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
      
      <Card className={cn("shadow-xl rounded-xl", glowClass, "bg-card")}>
        <TransactionForm onTransactionAdded={handleAddTransactionCallback} />
      </Card>


      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <SpendingInsights
            currentMonthTransactions={currentMonthTransactions}
            lastMonthTotalSpending={lastMonthTotalSpending}
            selectedMonthName={monthNamesList[selectedMonth]}
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
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <ExpenseCategoryChart transactions={currentMonthTransactions} selectedMonthName={monthNamesList[selectedMonth]} selectedYear={selectedYear} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <ExpensePaymentMethodChart transactions={currentMonthTransactions} selectedMonthName={monthNamesList[selectedMonth]} selectedYear={selectedYear} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <MonthlySpendingTrendChart transactions={transactions} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <IncomeExpenseTrendChart transactions={transactions} />
        </motion.div>
      </motion.div>
    </main>
  );
}

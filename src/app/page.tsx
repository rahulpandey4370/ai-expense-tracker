
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from "framer-motion";
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import { ExpenseTypeSplitChart } from "@/components/charts/expense-type-split-chart";
import type { AppTransaction } from '@/lib/types';
import { getTransactions } from '@/lib/actions/transactions';
import { Banknote, TrendingDown, PiggyBank, Percent, AlertTriangle, Loader2, HandCoins, Target } from 'lucide-react';
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

const glowClass = "shadow-[var(--card-glow)]"; // Use the CSS variable directly
const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];
const cashbackAndInterestAndDividendCategoryNames = ["Cashback", "Investment Income", "Dividends"];


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

    const coreExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want'))
      .reduce((sum, t) => sum + t.amount, 0);
    
    const investmentExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && 
                   (t.expenseType === 'investment_expense' || 
                    (t.category && investmentCategoryNames.includes(t.category.name)))
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpensesKPI = coreExpenses + investmentExpenses;
    
    const netSavingsKPIValue = income - totalExpensesKPI;
    const savingsRateKPIValue = income > 0 ? (netSavingsKPIValue / income) * 100 : 0;

    const savingsPlusInvestmentForDescription = income - coreExpenses;
    const savingsPlusInvestmentRateForDescription = income > 0 ? (savingsPlusInvestmentForDescription / income) * 100 : 0;


    const totalCashbackInterestsDividends = currentMonthTransactions
      .filter(t => t.type === 'income' && t.category && cashbackAndInterestAndDividendCategoryNames.includes(t.category.name))
      .reduce((sum, t) => sum + t.amount, 0);

    const totalInvestmentForInvestmentKPI = investmentExpenses; // Use already calculated investmentExpenses
    const investmentPercentage = income > 0 ? (totalInvestmentForInvestmentKPI / income) * 100 : 0;

    return { 
      income, 
      coreExpenses,
      investmentExpenses,
      totalExpensesKPI,
      netSavingsKPIValue, 
      savingsRateKPIValue, 
      savingsPlusInvestmentForDescription,
      savingsPlusInvestmentRateForDescription,
      totalCashbackInterestsDividends, 
      totalInvestmentForInvestmentKPI, 
      investmentPercentage 
    };
  }, [currentMonthTransactions]);

  // This is for the AI Insights, which should still focus on 'spending habits' (core expenses)
  const lastMonthTotalCoreSpending = useMemo(() => {
    const prevMonthDate = new Date(selectedDate);
    prevMonthDate.setDate(1); 
    prevMonthDate.setMonth(selectedDate.getMonth() - 1);

    const lastMonth = prevMonthDate.getMonth();
    const yearForLastMonth = prevMonthDate.getFullYear();

    return transactions
      .filter(t => {
        const transactionDate = new Date(t.date);
        return t.type === 'expense' && 
               (t.expenseType === 'need' || t.expenseType === 'want') && // Core expenses only
               transactionDate.getMonth() === lastMonth && 
               transactionDate.getFullYear() === yearForLastMonth;
      })
      .reduce((sum, t) => sum + t.amount, 0) || 0;
  }, [transactions, selectedDate]);


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
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Total Income" 
            value={`₹${monthlyMetrics.income.toFixed(2)}`} 
            icon={Banknote} 
            description={`${monthNamesList[selectedMonth]} ${selectedYear}`} 
            className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 dark:border-green-700/50 dark:bg-green-900/20 dark:hover:bg-green-800/30"
            kpiKey="totalIncome"
            insightText="Tracks all earnings for the month. A higher number is generally better!"
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Total Expenses" 
            value={`₹${monthlyMetrics.totalExpensesKPI.toFixed(2)}`} 
            icon={TrendingDown} 
            description={`Core: ₹${monthlyMetrics.coreExpenses.toFixed(2)} + Invest: ₹${monthlyMetrics.investmentExpenses.toFixed(2)}`}
            valueClassName="text-red-500 dark:text-red-400" 
            className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 dark:border-red-700/50 dark:bg-red-900/20 dark:hover:bg-red-800/30"
            kpiKey="totalExpenses" // This key might need adjustment if it's used for filtering to specifically show all expenses.
            insightText="Represents your total outgoings, including investments."
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Net Savings" 
            value={`₹${monthlyMetrics.netSavingsKPIValue.toFixed(2)}`} 
            icon={PiggyBank} 
            description={`Savings + Investment: ₹${monthlyMetrics.savingsPlusInvestmentForDescription.toFixed(2)}`}
            valueClassName={monthlyMetrics.netSavingsKPIValue >= 0 ? "text-blue-500 dark:text-blue-400" : "text-orange-500 dark:text-orange-400"} 
            className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-700/50 dark:bg-blue-900/20 dark:hover:bg-blue-800/30"
            kpiKey="netSavings"
            insightText="Income after ALL expenses (incl. investments). Description shows what's available for saving/investing after core costs."
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Savings Rate" 
            value={`${monthlyMetrics.savingsRateKPIValue.toFixed(1)}%`} 
            icon={Percent} 
            description={`Effective Rate (Saving+Invest): ${monthlyMetrics.savingsPlusInvestmentRateForDescription.toFixed(1)}%`}
            valueClassName={monthlyMetrics.savingsRateKPIValue >=0 ? "text-purple-500 dark:text-purple-400" : "text-yellow-500 dark:text-yellow-400"} 
            className="border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 dark:border-purple-700/50 dark:bg-purple-900/20 dark:hover:bg-purple-800/30"
            kpiKey="savingsRate"
            insightText="Percentage of income saved after ALL expenses (incl. investments). Description shows rate based on income minus core costs."
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Cashback/Interests" 
            value={`₹${monthlyMetrics.totalCashbackInterestsDividends.toFixed(2)}`} 
            icon={HandCoins} 
            description={`${monthNamesList[selectedMonth]} ${selectedYear}`} 
            className="border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:hover:bg-yellow-800/30"
            kpiKey="cashbackInterests"
            insightText="Extra income from rewards and passive investments."
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard 
            title="Investment %" 
            value={`${monthlyMetrics.investmentPercentage.toFixed(1)}%`} 
            icon={Target} 
            description={`Amount: ₹${monthlyMetrics.totalInvestmentForInvestmentKPI.toFixed(2)} (${monthNamesList[selectedMonth]} ${selectedYear})`} 
            className="border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:hover:bg-indigo-800/30"
            kpiKey="investmentPercentage"
            insightText="Percentage of income allocated to investments. Key for long-term growth."
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
          />
        </motion.div>
      </motion.div>

       {monthlyMetrics.totalExpensesKPI > monthlyMetrics.income && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Alert variant="destructive" className={cn("shadow-md border-red-700/50 bg-red-600/20 text-red-100 dark:bg-red-900/30 dark:text-red-200", glowClass)}>
            <AlertTriangle className="h-5 w-5 text-red-300 dark:text-red-400" />
            <AlertTitle className="text-red-200 dark:text-red-300">Spending Alert!</AlertTitle>
            <AlertDescription className="text-red-300 dark:text-red-400">
              You've spent more (incl. investments) than your income in {monthNamesList[selectedMonth]} {selectedYear}. Review your expenses.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      <Card className={cn("p-0 sm:p-0 bg-card/80", glowClass)}>
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
            currentMonthTransactions={currentMonthTransactions} // This will correctly filter for core expenses inside the component if needed
            lastMonthTotalSpending={lastMonthTotalCoreSpending} // Pass core spending for relevant AI comparison
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
        className="grid grid-cols-1 gap-6" 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
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
  );
}

    
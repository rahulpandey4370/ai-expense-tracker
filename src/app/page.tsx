
// @ts-nocheck
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { ExpensePaymentMethodChart } from "@/components/charts/expense-payment-method-chart";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import type { Transaction, TransactionInput } from '@/lib/types'; // Assuming TransactionInput might be needed if TransactionForm expects it
import { getTransactions, addTransaction } from '@/lib/actions/transactions';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Percent, AlertTriangle, ShoppingBag, Utensils, Film, Bitcoin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { useToast } from "@/hooks/use-toast";


export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const { selectedDate, selectedMonth, selectedYear, monthNamesList } = useDateSelection();
  const { toast } = useToast();

  const fetchAndSetTransactions = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const fetchedTransactions = await getTransactions();
      setTransactions(fetchedTransactions);
    } catch (error) {
      console.error("Failed to fetch transactions for dashboard:", error);
      toast({
        title: "Error Loading Data",
        description: "Could not fetch transactions. Please try refreshing.",
        variant: "destructive",
      });
      setTransactions([]); // Set to empty on error
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    setIsClient(true);
    fetchAndSetTransactions();
  }, [fetchAndSetTransactions]);
  
  const handleAddTransactionCallback = async (newTransactionData: TransactionInput) => {
    // The TransactionForm will call the server action directly.
    // This callback can be used to refresh data or provide UI feedback if needed.
    try {
        // Server action `addTransaction` is called from TransactionForm.
        // After it completes, we re-fetch to update the UI.
        await fetchAndSetTransactions(); 
        // Toast for success is now handled within TransactionForm or the server action could return a status
    } catch (error) {
        // Error handling for the action call itself should be in TransactionForm
        // or communicated if the server action throws.
        console.error("Error after attempting to add transaction:", error);
        // Toast for error here might be redundant if TransactionForm handles it.
    }
  };


  const currentMonthTransactions = useMemo(() => {
    return transactions.filter(
      t => t.date.getMonth() === selectedMonth && t.date.getFullYear() === selectedYear
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
      .filter(t => t.type === 'expense' && t.date.getMonth() === lastMonth && t.date.getFullYear() === yearForLastMonth)
      .reduce((sum, t) => sum + t.amount, 0) || 0;
  }, [transactions, selectedDate]);


  if (!isClient || isLoadingData) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse bg-background/30 backdrop-blur-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-96 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="h-80 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
                <div className="h-80 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
            </div>
            <div className="h-80 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="h-96 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
            <div className="h-80 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div>
            <div className="h-96 bg-muted/50 rounded-lg shadow-lg border border-primary/10"></div> 
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Galleons Earned" value={`₲${monthlyMetrics.income.toFixed(2)}`} icon={DollarSign} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} className="border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20"/>
        <KpiCard title="Knuts Spent" value={`Ӿ${monthlyMetrics.spending.toFixed(2)}`} icon={TrendingDown} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName="text-red-400" className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20"/>
        <KpiCard title="Gringotts Vault" value={`₲${monthlyMetrics.savings.toFixed(2)}`} icon={PiggyBank} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savings >= 0 ? "text-green-400" : "text-red-400"} className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20" />
        <KpiCard title="Savings Charm Rate" value={`${monthlyMetrics.savingsRate.toFixed(1)}%`} icon={Percent} description={`${monthNamesList[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savingsRate >=0 ? "text-purple-400" : "text-orange-400"} className="border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20"/>
      </div>

       {monthlyMetrics.spending > monthlyMetrics.income && (
        <Alert variant="destructive" className="shadow-md border-red-700/50 bg-red-600/20 text-red-100">
          <AlertTriangle className="h-5 w-5 text-red-300" />
          <AlertTitle className="text-red-200">Ministry Warning!</AlertTitle>
          <AlertDescription className="text-red-300">
            Careful, wizard! You've spent more than your income in {monthNamesList[selectedMonth]} {selectedYear}. Review your scrolls (expenses)!
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExpenseCategoryChart transactions={currentMonthTransactions} selectedMonthName={monthNamesList[selectedMonth]} selectedYear={selectedYear} />
            <ExpensePaymentMethodChart transactions={currentMonthTransactions} selectedMonthName={monthNamesList[selectedMonth]} selectedYear={selectedYear} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MonthlySpendingTrendChart transactions={transactions} /> {/* All transactions for trend */}
            <IncomeExpenseTrendChart transactions={transactions} /> {/* All transactions for trend */}
          </div>
           <RecentTransactionsList transactions={currentMonthTransactions} />
        </div>

        <div className="lg:col-span-1 space-y-6">
          <TransactionForm onTransactionAdded={handleAddTransactionCallback} />
          <SpendingInsights 
            currentMonthTransactions={currentMonthTransactions} 
            lastMonthTotalSpending={lastMonthTotalSpending}
            selectedMonthName={monthNamesList[selectedMonth]}
            selectedYear={selectedYear}
          />
          <FinancialChatbot allTransactions={transactions} /> {/* All transactions for chatbot context */}
        </div>
      </div>
    </main>
  );
}

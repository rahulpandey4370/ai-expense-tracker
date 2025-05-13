"use client";

import { useState, useEffect, useMemo } from 'react';
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { ExpensePaymentMethodChart } from "@/components/charts/expense-payment-method-chart";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import type { Transaction } from '@/lib/types';
import { initialTransactions } from '@/lib/data';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Percent, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // In a real app, fetch transactions here
  }, []);

  const handleAddTransaction = (newTransaction: Transaction) => {
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyMetrics = useMemo(() => {
    const currentMonthTransactions = transactions.filter(
      t => t.date.getMonth() === currentMonth && t.date.getFullYear() === currentYear
    );
    const income = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const spending = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const savings = income - spending;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    return { income, spending, savings, savingsRate };
  }, [transactions, currentMonth, currentYear]);
  
  // Mock last month's spending for AI insights. In a real app, this would be fetched.
  const lastMonthTotalSpending = useMemo(() => {
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.getMonth();
    const yearForLastMonth = lastMonthDate.getFullYear();

    return transactions
      .filter(t => t.type === 'expense' && t.date.getMonth() === lastMonth && t.date.getFullYear() === yearForLastMonth)
      .reduce((sum, t) => sum + t.amount, 0) || 1800; // fallback if no data
  }, [transactions]);


  if (!isClient) {
    // Basic SSR-friendly loading state or null.
    // More sophisticated loading skeletons could be used here.
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-32 bg-muted rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-96 bg-muted rounded-lg"></div>
            <div className="h-80 bg-muted rounded-lg"></div>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="h-96 bg-muted rounded-lg"></div>
            <div className="h-80 bg-muted rounded-lg"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Income" value={`$${monthlyMetrics.income.toFixed(2)}`} icon={DollarSign} description="This month" />
        <KpiCard title="Total Spending" value={`$${monthlyMetrics.spending.toFixed(2)}`} icon={TrendingDown} description="This month" valueClassName="text-red-500"/>
        <KpiCard title="Total Savings" value={`$${monthlyMetrics.savings.toFixed(2)}`} icon={PiggyBank} description="This month" valueClassName={monthlyMetrics.savings >= 0 ? "text-green-500" : "text-red-500"} />
        <KpiCard title="Savings Rate" value={`${monthlyMetrics.savingsRate.toFixed(1)}%`} icon={Percent} description="This month" valueClassName={monthlyMetrics.savingsRate >=0 ? "text-primary" : "text-destructive"}/>
      </div>

       {monthlyMetrics.spending > monthlyMetrics.income && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Spending Alert!</AlertTitle>
          <AlertDescription>
            You've spent more than your income this month. Review your expenses to stay on track.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExpenseCategoryChart transactions={transactions} />
            <ExpensePaymentMethodChart transactions={transactions} />
          </div>
           <RecentTransactionsList transactions={transactions} />
        </div>

        <div className="lg:col-span-1 space-y-6">
          <TransactionForm onAddTransaction={handleAddTransaction} />
          <SpendingInsights transactions={transactions} lastMonthTotalSpending={lastMonthTotalSpending}/>
        </div>
      </div>
    </main>
  );
}

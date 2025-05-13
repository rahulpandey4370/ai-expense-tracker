// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from 'react';
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { ExpensePaymentMethodChart } from "@/components/charts/expense-payment-method-chart";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import type { Transaction } from '@/lib/types';
import { initialTransactions } from '@/lib/data';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Percent, AlertTriangle, CalendarDays, LineChart, BarChartHorizontal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [isClient, setIsClient] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  useEffect(() => {
    setIsClient(true);
    // In a real app, fetch transactions here
  }, []);

  const currentHostYear = useMemo(() => new Date().getFullYear(), []);
  const years = useMemo(() => Array.from({ length: 11 }, (_, i) => currentHostYear - 5 + i), [currentHostYear]);
  
  const selectedMonth = selectedDate.getMonth();
  const selectedYear = selectedDate.getFullYear();

  const handleMonthChange = (monthValue: string) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(parseInt(monthValue, 10));
    newDate.setDate(1); 
    setSelectedDate(newDate);
  };

  const handleYearChange = (yearValue: string) => {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(parseInt(yearValue, 10));
    newDate.setDate(1); 
    setSelectedDate(newDate);
  };
  
  const handleSetToCurrentMonth = () => {
    setSelectedDate(new Date());
  };

  const handleAddTransaction = (newTransaction: Transaction) => {
    setTransactions(prev => [newTransaction, ...prev]);
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
      .reduce((sum, t) => sum + t.amount, 0) || 0; // Corrected fallback to 0
  }, [transactions, selectedDate]);


  if (!isClient) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
        <div className="h-20 bg-muted rounded-lg"></div> 
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
            <div className="h-80 bg-muted rounded-lg"></div> {/* Placeholder for new charts */}
            <div className="h-80 bg-muted rounded-lg"></div>
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="h-96 bg-muted rounded-lg"></div>
            <div className="h-80 bg-muted rounded-lg"></div>
            <div className="h-96 bg-muted rounded-lg"></div> 
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background">
      <Card className="shadow-lg"> {/* Changed to shadow-lg */}
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Select Month and Year
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
          <Select value={selectedMonth.toString()} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select Month" />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((month, index) => (
                <SelectItem key={month} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSetToCurrentMonth} variant="outline" className="w-full sm:w-auto">
            Current Month
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Income" value={`₹${monthlyMetrics.income.toFixed(2)}`} icon={DollarSign} description={`${monthNames[selectedMonth]} ${selectedYear}`} />
        <KpiCard title="Total Spending" value={`₹${monthlyMetrics.spending.toFixed(2)}`} icon={TrendingDown} description={`${monthNames[selectedMonth]} ${selectedYear}`} valueClassName="text-red-500"/>
        <KpiCard title="Total Savings" value={`₹${monthlyMetrics.savings.toFixed(2)}`} icon={PiggyBank} description={`${monthNames[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savings >= 0 ? "text-green-500" : "text-red-500"} />
        <KpiCard title="Savings Rate" value={`${monthlyMetrics.savingsRate.toFixed(1)}%`} icon={Percent} description={`${monthNames[selectedMonth]} ${selectedYear}`} valueClassName={monthlyMetrics.savingsRate >=0 ? "text-primary" : "text-destructive"}/>
      </div>

       {monthlyMetrics.spending > monthlyMetrics.income && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Spending Alert!</AlertTitle>
          <AlertDescription>
            You've spent more than your income in {monthNames[selectedMonth]} {selectedYear}. Review your expenses to stay on track.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExpenseCategoryChart transactions={currentMonthTransactions} selectedMonthName={monthNames[selectedMonth]} selectedYear={selectedYear} />
            <ExpensePaymentMethodChart transactions={currentMonthTransactions} selectedMonthName={monthNames[selectedMonth]} selectedYear={selectedYear} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MonthlySpendingTrendChart transactions={transactions} />
            <IncomeExpenseTrendChart transactions={transactions} />
          </div>
           <RecentTransactionsList transactions={currentMonthTransactions} />
        </div>

        <div className="lg:col-span-1 space-y-6">
          <TransactionForm onAddTransaction={handleAddTransaction} />
          <SpendingInsights 
            currentMonthTransactions={currentMonthTransactions} 
            lastMonthTotalSpending={lastMonthTotalSpending}
            selectedMonthName={monthNames[selectedMonth]}
            selectedYear={selectedYear}
          />
          <FinancialChatbot allTransactions={transactions} />
        </div>
      </div>
    </main>
  );
}

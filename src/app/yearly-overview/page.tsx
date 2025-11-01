
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppTransaction } from '@/lib/types';
import { getTransactions } from '@/lib/actions/transactions';
import { Loader2, AlertTriangle, CalendarRange, Layers } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { MonthlyIncomeExpenseSavingsChart } from '@/components/charts/monthly-income-expense-savings-chart';
import { SavingsTrendChart } from '@/components/charts/savings-trend-chart';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';


const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const tableContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const tableRowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 120 } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];
const cashbackAndInterestAndDividendCategoryNames = ["Cashback", "Investment Income", "Dividends"];

export interface MonthlySummary {
  monthIndex: number;
  monthName: string;
  monthShortName: string; 
  year: number; 
  totalSpend: number;
  totalInvestment: number;
  totalSavings: number;
  totalCashbacksInterestsDividends: number;
  totalIncome: number;
}

const progressColors = [
  "bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", 
  "bg-primary", "bg-accent", "bg-teal-500", "bg-fuchsia-500", "bg-sky-500"
];

export default function YearlyOverviewPage() {
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const { toast } = useToast();

  const availableYears = useMemo(() => {
    if (allTransactions.length === 0 && !isLoadingData) return [new Date().getFullYear()];
    const years = new Set(allTransactions.map(t => new Date(t.date).getFullYear()));
    const currentYear = new Date().getFullYear();
    if (!years.has(currentYear)) years.add(currentYear);
    if(years.size === 0) return [new Date().getFullYear()]; // Fallback if no transactions at all
    return Array.from(years).sort((a, b) => b - a);
  }, [allTransactions, isLoadingData]);

  const fetchTransactionsCallback = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const fetchedTransactions = await getTransactions();
      setAllTransactions(fetchedTransactions.map(t => ({ ...t, date: new Date(t.date) })));
    } catch (error) {
      console.error("Failed to fetch transactions for yearly overview:", error);
      toast({
        title: "Error Loading Data",
        description: "Could not fetch transaction data.",
        variant: "destructive",
      });
      setAllTransactions([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTransactionsCallback();
  }, [fetchTransactionsCallback]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);


  const yearlySummaryData = useMemo((): MonthlySummary[] => {
    const summary: MonthlySummary[] = [];
    for (let i = 0; i < 12; i++) { 
      const monthTransactions = allTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getFullYear() === selectedYear && transactionDate.getMonth() === i;
      });

      const totalIncome = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalSpend = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalInvestment = monthTransactions
        .filter(t => t.type === 'expense' &&
                     (t.expenseType === 'investment' ||
                      (t.category && investmentCategoryNames.includes(t.category.name)))
        )
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalCashbacksInterestsDividends = monthTransactions
        .filter(t => t.type === 'income' &&
                     (t.category && cashbackAndInterestAndDividendCategoryNames.includes(t.category.name))
        )
        .reduce((sum, t) => sum + t.amount, 0);

      const totalSavings = totalIncome - totalSpend;

      summary.push({
        monthIndex: i,
        monthName: monthNames[i],
        monthShortName: monthNames[i].substring(0,3),
        year: selectedYear,
        totalSpend,
        totalInvestment,
        totalSavings,
        totalCashbacksInterestsDividends,
        totalIncome,
      });
    }
    return summary;
  }, [allTransactions, selectedYear]);

  const yearlyTotals = useMemo(() => {
    return yearlySummaryData.reduce((acc, monthData) => {
      acc.totalSpend += monthData.totalSpend;
      acc.totalInvestment += monthData.totalInvestment;
      acc.totalSavings += monthData.totalSavings;
      acc.totalCashbacksInterestsDividends += monthData.totalCashbacksInterestsDividends;
      acc.totalIncome += monthData.totalIncome;
      return acc;
    }, { totalSpend: 0, totalInvestment: 0, totalSavings: 0, totalCashbacksInterestsDividends: 0, totalIncome: 0 });
  }, [yearlySummaryData]);

  const categoryWiseYearlySpend = useMemo(() => {
    const spendingMap = new Map<string, number>();
    allTransactions
      .filter(t => new Date(t.date).getFullYear() === selectedYear && t.type === 'expense' && t.category)
      .forEach(t => {
        const categoryName = t.category!.name;
        spendingMap.set(categoryName, (spendingMap.get(categoryName) || 0) + t.amount);
      });

    return Array.from(spendingMap.entries())
      .map(([categoryName, totalAmount]) => ({ categoryName, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allTransactions, selectedYear]);


  const handleYearChange = (yearValue: string) => {
    setSelectedYear(parseInt(yearValue, 10));
  };

  if (isLoadingData) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse bg-background/30 backdrop-blur-sm">
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="ml-4 text-lg text-primary">Loading yearly overview...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <CalendarRange className="w-7 h-7 md:w-8 md:h-8 text-accent transform rotate-[-3deg]" />
              Yearly Financial Overview
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              A month-by-month summary of your finances for the selected year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="w-full md:w-[180px] bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/60 text-foreground">
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()} className="text-xs md:text-sm">{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {allTransactions.filter(t => new Date(t.date).getFullYear() === selectedYear).length === 0 ? (
              <Alert variant="default" className="border-yellow-600/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 shadow-md">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-300" />
                <AlertTitle className="text-yellow-800 dark:text-yellow-200">No Data for {selectedYear}</AlertTitle>
                <AlertDescription>
                  No transactions found for the year {selectedYear}. Try a different year or add some transactions.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-8">
                <motion.div 
                    className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                    variants={cardVariants} 
                    initial="hidden" 
                    animate="visible"
                >
                    <MonthlyIncomeExpenseSavingsChart monthlyData={yearlySummaryData} />
                    <SavingsTrendChart monthlyData={yearlySummaryData} />
                </motion.div>

                <motion.div className="overflow-x-auto" variants={tableContainerVariants} initial="hidden" animate="visible">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-primary/5 border-b-primary/20">
                        <TableHead className="font-semibold text-muted-foreground w-[100px] sm:w-[120px] text-xs sm:text-sm whitespace-nowrap">Month</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground text-xs sm:text-sm whitespace-nowrap">Total Income</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground text-xs sm:text-sm whitespace-nowrap">Total Spend</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground text-xs sm:text-sm whitespace-nowrap">Total Savings</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground text-xs sm:text-sm whitespace-nowrap">Total Investment</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground text-xs sm:text-sm whitespace-nowrap">Cashbacks/Interests/Dividends</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearlySummaryData.map((data) => (
                        <motion.tr key={data.monthIndex} variants={tableRowVariants} className="hover:bg-accent/5 border-b-border/50 text-xs sm:text-sm">
                          <TableCell className="font-medium text-foreground whitespace-nowrap">{data.monthName}</TableCell>
                          <TableCell className={cn("text-right whitespace-nowrap", data.totalIncome > 0 ? "text-teal-600 dark:text-teal-400" : "text-foreground/80")}>₹{data.totalIncome.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right whitespace-nowrap", data.totalSpend > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/80")}>₹{data.totalSpend.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right whitespace-nowrap", data.totalSavings >= 0 ? "text-green-600 dark:text-green-400" : "text-orange-500 dark:text-orange-400")}>₹{data.totalSavings.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right whitespace-nowrap", data.totalInvestment > 0 ? "text-blue-600 dark:text-blue-400" : "text-foreground/80")}>₹{data.totalInvestment.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-right whitespace-nowrap", data.totalCashbacksInterestsDividends > 0 ? "text-purple-600 dark:text-purple-400" : "text-foreground/80")}>₹{data.totalCashbacksInterestsDividends.toFixed(2)}</TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-primary/10 border-t-2 border-primary/30 text-xs sm:text-sm">
                        <TableHead className="font-bold text-primary whitespace-nowrap">Total ({selectedYear})</TableHead>
                        <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalIncome > 0 ? "text-teal-700 dark:text-teal-500" : "text-primary")}>₹{yearlyTotals.totalIncome.toFixed(2)}</TableHead>
                        <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalSpend > 0 ? "text-red-700 dark:text-red-500" : "text-primary")}>₹{yearlyTotals.totalSpend.toFixed(2)}</TableHead>
                        <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalSavings >= 0 ? "text-green-700 dark:text-green-500" : "text-orange-600 dark:text-orange-400")}>₹{yearlyTotals.totalSavings.toFixed(2)}</TableHead>
                        <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalInvestment > 0 ? "text-blue-700 dark:text-blue-500" : "text-primary")}>₹{yearlyTotals.totalInvestment.toFixed(2)}</TableHead>
                        <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalCashbacksInterestsDividends > 0 ? "text-purple-700 dark:text-purple-500" : "text-primary")}>₹{yearlyTotals.totalCashbacksInterestsDividends.toFixed(2)}</TableHead>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </motion.div>

                <motion.div variants={cardVariants}>
                    <Card className="shadow-lg mt-8">
                        <CardHeader>
                            <CardTitle className="text-xl md:text-2xl text-primary flex items-center gap-2">
                                <Layers className="text-primary/80" />
                                Category-wise Yearly Spend
                            </CardTitle>
                            <CardDescription>Total expense for each category in {selectedYear}.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {categoryWiseYearlySpend.map((cat, index) => {
                                const percentage = yearlyTotals.totalSpend > 0 ? (cat.totalAmount / yearlyTotals.totalSpend) * 100 : 0;
                                const colorClass = progressColors[index % progressColors.length];
                                return (
                                <TooltipProvider key={index}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                <div className="p-3 rounded-lg border bg-background/50 space-y-1.5 shadow-sm hover:shadow-md transition-shadow cursor-help">
                                  <div className="flex justify-between items-baseline">
                                      <span className="font-semibold text-sm text-foreground truncate" title={cat.categoryName}>{cat.categoryName}</span>
                                      <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                                  </div>
                                  <Progress value={percentage} indicatorClassName={colorClass} className="h-2" />
                                  <p className="text-right font-bold text-sm text-primary">₹{cat.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                </TooltipTrigger>
                                       <TooltipContent className="p-2 bg-background border-primary/30 max-w-xs w-full">
                                        <p className="font-bold text-primary mb-2 border-b pb-1">Transactions for {cat.categoryName}</p>
                                        <ScrollArea className="h-auto max-h-[150px]">
                                        <ul className="space-y-1 text-xs">
                                          {allTransactions.filter(tx => tx.category?.name === cat.categoryName && new Date(tx.date).getFullYear() === selectedYear).map(tx => (
                                            <li key={tx.id} className="flex items-center justify-between gap-2">
                                              <span className="flex-1 truncate text-muted-foreground" title={tx.description}>
                                                {format(tx.date, 'dd/MM')}: {tx.description}
                                              </span>
                                              <span className="flex-shrink-0 font-semibold text-foreground">
                                                ₹{tx.amount.toLocaleString()}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                        </ScrollArea>
                                      </TooltipContent>
                                </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </div>
                           <div className="mt-6 text-right font-bold text-lg text-primary border-t pt-3">
                              Total Expenses: ₹{yearlyTotals.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                           </div>
                        </CardContent>
                    </Card>
                </motion.div>

              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

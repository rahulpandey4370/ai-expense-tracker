
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactionsInRange, useTransactionYears } from '@/hooks/use-finance-queries';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CalendarRange, Layers } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { SavingsTrendChart } from '@/components/charts/savings-trend-chart';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from 'date-fns';
import { getCalendarYear, isSameCalendarMonth, isSameCalendarYear } from '@/lib/date-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MonthlyIncomeExpenseSavingsChart } from '@/components/charts/monthly-income-expense-savings-chart';
import { netAmount } from '@/lib/split-utils';


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
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const { toast } = useToast();

  // Distinct years + the 12-month rollup + category breakdown are all computed in
  // Postgres (RPCs). The page never loads raw transaction rows.
  const { data: yearsData } = useTransactionYears();
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set(yearsData ?? []);
    years.add(currentYear);
    const arr = Array.from(years).sort((a, b) => b - a);
    return arr.length ? arr : [currentYear];
  }, [yearsData]);

  // Fetch just the selected year's rows (bounded), server-side. The month-by-month
  // summary + category drill-down are computed from these; the category popover
  // needs the individual rows, so a per-year fetch is the right scope here.
  const yearQuery = useTransactionsInRange(`${selectedYear}-01-01`, `${selectedYear}-12-31`);
  const allTransactions = useMemo(() => yearQuery.data ?? [], [yearQuery.data]);
  const isLoadingData = yearQuery.isLoading;

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const yearHasData = allTransactions.length > 0;

  const yearlySummaryData = useMemo((): MonthlySummary[] => {
    const summary: MonthlySummary[] = [];
    for (let i = 0; i < 12; i++) {
      const monthTransactions = allTransactions.filter(t => isSameCalendarMonth(t.date, i, selectedYear));
      const totalIncome = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const totalSpend = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + netAmount(t), 0);
      const totalInvestment = monthTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'investment' || (t.category && investmentCategoryNames.includes(t.category.name))))
        .reduce((sum, t) => sum + netAmount(t), 0);
      const totalCashbacksInterestsDividends = monthTransactions
        .filter(t => t.type === 'income' && (t.category && cashbackAndInterestAndDividendCategoryNames.includes(t.category.name)))
        .reduce((sum, t) => sum + t.amount, 0);
      summary.push({
        monthIndex: i,
        monthName: monthNames[i],
        monthShortName: monthNames[i].substring(0, 3),
        year: selectedYear,
        totalSpend,
        totalInvestment,
        totalSavings: totalIncome - totalSpend,
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
      .filter(t => t.type === 'expense' && t.category)
      .forEach(t => {
        const categoryName = t.category!.name;
        spendingMap.set(categoryName, (spendingMap.get(categoryName) || 0) + netAmount(t));
      });
    return Array.from(spendingMap.entries())
      .map(([categoryName, totalAmount]) => ({ categoryName, totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allTransactions]);


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

            {!yearHasData ? (
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
                  <div className="overflow-x-auto">
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
                        {yearlySummaryData.map((data) => {
                          // Months that haven't happened yet are rendered as
                          // dimmed placeholders instead of five columns of
                          // "₹0.00", which read as real zero-value data.
                          const isFuture = data.totalIncome === 0 && data.totalSpend === 0
                            && data.totalInvestment === 0 && data.totalCashbacksInterestsDividends === 0;
                          if (isFuture) {
                            return (
                              <motion.tr key={data.monthIndex} variants={tableRowVariants} className="border-b-border/50 text-xs sm:text-sm">
                                <TableCell className="whitespace-nowrap font-medium text-muted-foreground/60">{data.monthName}</TableCell>
                                <TableCell colSpan={5} className="text-center text-xs italic text-muted-foreground/50">
                                  no activity recorded
                                </TableCell>
                              </motion.tr>
                            );
                          }
                          return (
                          <motion.tr key={data.monthIndex} variants={tableRowVariants} className="hover:bg-accent/5 border-b-border/50 text-xs sm:text-sm tabular-nums">
                            <TableCell className="font-medium text-foreground whitespace-nowrap">{data.monthName}</TableCell>
                            <TableCell className={cn("text-right whitespace-nowrap", data.totalIncome > 0 ? "text-teal-600 dark:text-teal-400" : "text-foreground/80")}>{formatCurrency(data.totalIncome)}</TableCell>
                            <TableCell className={cn("text-right whitespace-nowrap", data.totalSpend > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/80")}>{formatCurrency(data.totalSpend)}</TableCell>
                            <TableCell className={cn("text-right whitespace-nowrap", data.totalSavings >= 0 ? "text-green-600 dark:text-green-400" : "text-orange-500 dark:text-orange-400")}>{formatCurrency(data.totalSavings)}</TableCell>
                            <TableCell className={cn("text-right whitespace-nowrap", data.totalInvestment > 0 ? "text-blue-600 dark:text-blue-400" : "text-foreground/80")}>{formatCurrency(data.totalInvestment)}</TableCell>
                            <TableCell className={cn("text-right whitespace-nowrap", data.totalCashbacksInterestsDividends > 0 ? "text-purple-600 dark:text-purple-400" : "text-foreground/80")}>{formatCurrency(data.totalCashbacksInterestsDividends)}</TableCell>
                          </motion.tr>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-primary/10 border-t-2 border-primary/30 text-xs sm:text-sm">
                          <TableHead className="font-bold text-primary whitespace-nowrap">Total ({selectedYear})</TableHead>
                          <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalIncome > 0 ? "text-teal-700 dark:text-teal-500" : "text-primary")}>{formatCurrency(yearlyTotals.totalIncome)}</TableHead>
                          <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalSpend > 0 ? "text-red-700 dark:text-red-500" : "text-primary")}>{formatCurrency(yearlyTotals.totalSpend)}</TableHead>
                          <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalSavings >= 0 ? "text-green-700 dark:text-green-500" : "text-orange-600 dark:text-orange-400")}>{formatCurrency(yearlyTotals.totalSavings)}</TableHead>
                          <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalInvestment > 0 ? "text-blue-700 dark:text-blue-500" : "text-primary")}>{formatCurrency(yearlyTotals.totalInvestment)}</TableHead>
                          <TableHead className={cn("text-right font-bold whitespace-nowrap", yearlyTotals.totalCashbacksInterestsDividends > 0 ? "text-purple-700 dark:text-purple-500" : "text-primary")}>{formatCurrency(yearlyTotals.totalCashbacksInterestsDividends)}</TableHead>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
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
                                
                                const transactionsForCategory = allTransactions.filter(tx => tx.category?.name === cat.categoryName && isSameCalendarYear(tx.date, selectedYear));

                                return (
                                  <Popover key={index}>
                                    <PopoverTrigger asChild>
                                      <div className="p-3 rounded-lg border bg-background/50 space-y-1.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                                        <div className="flex justify-between items-baseline">
                                            <span className="font-semibold text-sm text-foreground truncate" title={cat.categoryName}>{cat.categoryName}</span>
                                            <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                                        </div>
                                        <Progress value={percentage} indicatorClassName={colorClass} className="h-2" />
                                        <p className="text-right font-bold text-sm text-primary">{formatCurrency(cat.totalAmount)}</p>
                                      </div>
                                    </PopoverTrigger>
                                     <PopoverContent className="p-2 bg-background border-primary/30 max-w-md w-full">
                                      <p className="font-bold text-primary mb-2 border-b pb-1">Transactions for {cat.categoryName}</p>
                                      {transactionsForCategory.length > 0 ? (
                                        <ScrollArea className="h-auto max-h-[300px]">
                                          <ul className="space-y-1 text-xs">
                                            {transactionsForCategory.map(tx => (
                                              <li key={tx.id} className="flex items-center justify-between gap-2">
                                                <span className="flex-1 truncate text-muted-foreground" title={tx.description}>
                                                  {format(tx.date, 'dd/MM')}: {tx.description}
                                                </span>
                                                <span className="flex-shrink-0 font-semibold text-foreground">
                                                  {formatCurrency(tx.amount)}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        </ScrollArea>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">No transactions found.</p>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                );
                            })}
                          </div>
                           <div className="mt-6 text-right font-bold text-lg text-primary border-t pt-3">
                              Total Expenses: {formatCurrency(yearlyTotals.totalSpend)}
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

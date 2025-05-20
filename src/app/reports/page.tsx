
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AppTransaction } from '@/lib/types'; 
import { getTransactions } from '@/lib/actions/transactions';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { Download, FileText, Loader2, AlertTriangle, TrendingUp, BookOpen } from 'lucide-react';
import { ExpenseCategoryChart } from '@/components/charts/expense-category-chart';
import { MonthlySpendingTrendChart } from '@/components/charts/monthly-spending-trend-chart';
import { IncomeExpenseTrendChart } from '@/components/charts/income-expense-trend-chart';
import { ExpensePaymentMethodChart } from '@/components/charts/expense-payment-method-chart';
import { comparativeExpenseAnalysis, type ComparativeExpenseAnalysisInput } from '@/ai/flows/comparative-expense-analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const buttonHoverTap = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export default function ReportsPage() {
  const { selectedMonth, selectedYear, monthNamesList, handleMonthChange: contextHandleMonthChange, handleYearChange: contextHandleYearChange, years: contextYears } = useDateSelection();
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]); 
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [reportYear, setReportYear] = useState<number>(selectedYear);
  const [reportMonth, setReportMonth] = useState<number>(selectedMonth); // -1 for Annual

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchTransactionsCallback = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const fetchedTransactions = await getTransactions();
      setAllTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)}))); 
    } catch (error) {
      console.error("Failed to fetch transactions for reports:", error);
      toast({
        title: "Error Loading Report Data",
        description: "Could not fetch transaction data for reports.",
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


  const handleYearChange = (yearValue: string) => {
    setReportYear(parseInt(yearValue, 10));
    contextHandleYearChange(yearValue); 
  };

  const handleMonthChangeInternal = (monthValue: string) => {
    setReportMonth(parseInt(monthValue, 10));
    if (parseInt(monthValue, 10) !== -1) { 
      contextHandleMonthChange(monthValue); 
    }
  };

  const filteredTransactionsForPeriod = useMemo(() => {
    return allTransactions.filter(t => {
      const transactionDate = new Date(t.date);
      const transactionYear = transactionDate.getFullYear();
      const transactionMonth = transactionDate.getMonth();
      if (reportMonth === -1) { // Annual report
        return transactionYear === reportYear;
      }
      return transactionYear === reportYear && transactionMonth === reportMonth;
    });
  }, [allTransactions, reportYear, reportMonth]);

  const currentPeriodExpensesTotal = useMemo(() => 
    filteredTransactionsForPeriod.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  , [filteredTransactionsForPeriod]);

  const previousPeriodExpensesTotal = useMemo(() => {
    let prevPeriodYear = reportYear;
    let prevPeriodMonth = reportMonth -1; 

    if (reportMonth === 0) { 
      prevPeriodMonth = 11;
      prevPeriodYear = reportYear - 1;
    } else if (reportMonth === -1) { 
      prevPeriodYear = reportYear - 1;
      prevPeriodMonth = -1; 
    }
    

    return allTransactions.filter(t => { 
      const transactionDate = new Date(t.date);
      const transactionYear = transactionDate.getFullYear();
      const transactionMonth = transactionDate.getMonth();
      if (prevPeriodMonth === -1) { 
        return transactionYear === prevPeriodYear && t.type === 'expense';
      }
      return transactionYear === prevPeriodYear && transactionMonth === prevPeriodMonth && t.type === 'expense';
    }).reduce((sum, t) => sum + t.amount, 0);
  }, [allTransactions, reportYear, reportMonth]);

  const formatExpenseCategoriesForAI = (trans: AppTransaction[]): string => {
    const expenses = trans.filter(t => t.type === 'expense' && t.category);
    const categoryMap: Record<string, number> = {};
    expenses.forEach(t => {
      if (t.category && t.category.name) {
         categoryMap[t.category.name] = (categoryMap[t.category.name] || 0) + t.amount;
      }
    });
    return Object.entries(categoryMap).map(([catName, amt]) => `${catName}: ₹${amt.toFixed(2)}`).join(', ') || 'No expenses in this period.';
  };


  const generateAIReport = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    const currentPeriodName = reportMonth === -1 ? `${reportYear}` : `${monthNamesList[reportMonth]} ${reportYear}`;
    
    let previousPeriodName;
    if (reportMonth === 0) previousPeriodName = `${monthNamesList[11]} ${reportYear - 1}`;
    else if (reportMonth === -1) previousPeriodName = `${reportYear -1}`;
    else previousPeriodName = `${monthNamesList[reportMonth-1]} ${reportYear}`;

    const previousPeriodTransactions = allTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        const transactionYear = transactionDate.getFullYear();
        const transactionMonth = transactionDate.getMonth();
        let prevTargetYear = reportYear;
        let prevTargetMonth = reportMonth -1;
        if (reportMonth === 0) { prevTargetMonth = 11; prevTargetYear = reportYear - 1; }
        else if (reportMonth === -1) { prevTargetYear = reportYear -1; prevTargetMonth = -1; /* annual */ }
        
        if (prevTargetMonth === -1) return transactionYear === prevTargetYear;
        return transactionYear === prevTargetYear && transactionMonth === prevTargetMonth;
    });

    const input: ComparativeExpenseAnalysisInput = {
      currentMonth: currentPeriodName,
      previousMonth: previousPeriodName,
      currentMonthExpenses: currentPeriodExpensesTotal,
      previousMonthExpenses: previousPeriodExpensesTotal,
      expenseCategoriesCurrent: formatExpenseCategoriesForAI(filteredTransactionsForPeriod),
      expenseCategoriesPrevious: formatExpenseCategoriesForAI(previousPeriodTransactions),
    };
    
    try {
      const result = await comparativeExpenseAnalysis(input);
      setAiAnalysis(result.analysis);
    } catch (err) {
      console.error("Error generating AI report:", err);
      setAiError("Failed to generate the AI report. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };
  
  const exportReportToPDF = async () => {
    const reportContentElement = document.getElementById('report-content-area');
    if (!reportContentElement) {
      toast({ title: "Export Failed", description: "Could not find report content.", variant: "destructive"});
      return;
    }
    
    toast({ title: "Generating PDF...", description: "Please wait while your report is being generated."});

    try {
      await new Promise(resolve => setTimeout(resolve, 500)); 

      const canvas = await html2canvas(reportContentElement, {
        scale: 2, 
        useCORS: true, 
        logging: true,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt', 
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const newImgWidth = imgWidth * ratio * 0.95; 
      const newImgHeight = imgHeight * ratio * 0.95;

      const x = (pdfWidth - newImgWidth) / 2;
      const y = (pdfHeight - newImgHeight) / 2; 


      pdf.addImage(imgData, 'PNG', x, y, newImgWidth, newImgHeight);
      pdf.save(`financial_report_${reportMonth === -1 ? reportYear : monthNamesList[reportMonth] + '_' + reportYear}.pdf`);
      toast({ title: "Report Exported!", description: "Your financial report PDF has been generated." });
    } catch (error)
     {
      console.error("Error exporting PDF:", error);
      toast({ title: "Export Failed", description: "An error occurred during PDF generation.", variant: "destructive"});
    }
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
              <FileText className="w-8 h-8 text-accent transform rotate-[-3deg]" />
              Financial Reports
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Analyze your spending and income patterns. Use filters to select the report period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <Select value={reportMonth.toString()} onValueChange={handleMonthChangeInternal}>
                <SelectTrigger className="w-full md:w-[180px] bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground">
                  <SelectValue placeholder="Select Report Period" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/60 text-foreground">
                  <SelectItem value="-1">Annual Report</SelectItem>
                  {monthNamesList.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reportYear.toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="w-full md:w-[120px] bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/60 text-foreground">
                  {contextYears.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
                </SelectContent>
              </Select>
              <motion.div {...buttonHoverTap}>
                <Button onClick={exportReportToPDF} variant="outline" className="bg-accent/20 border-accent/50 hover:bg-accent/30 text-accent dark:text-accent-foreground">
                    <Download className="mr-2 h-4 w-4" />
                    Export to PDF
                </Button>
              </motion.div>
            </div>
          
            <motion.div 
              id="report-content-area" 
              className="space-y-6 p-4 bg-background rounded-lg"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              {isLoadingData ? (
                <div className="flex justify-center items-center h-[400px]">
                  <Loader2 className="h-12 w-12 text-accent animate-spin" />
                  <p className="ml-4 text-primary">Loading report data...</p>
                </div>
              ) : filteredTransactionsForPeriod.length === 0 && !isLoadingData ? (
                <Alert variant="default" className="border-yellow-600/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 shadow-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-300" />
                  <AlertTitle className="text-yellow-800 dark:text-yellow-200">No Data for this Period</AlertTitle>
                  <AlertDescription>
                    No transactions found for {reportMonth === -1 ? reportYear : `${monthNamesList[reportMonth]} ${reportYear}`}. Try a different period or add some transactions.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                    <motion.div variants={cardVariants} className="lg:col-span-3">
                        <ExpenseCategoryChart 
                            transactions={filteredTransactionsForPeriod} 
                            selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} 
                            selectedYear={reportYear}
                            chartHeightClass="max-h-[400px] min-h-[350px] md:min-h-[400px]"
                        />
                    </motion.div>
                    <motion.div variants={cardVariants} className="lg:col-span-2">
                        <ExpensePaymentMethodChart 
                            transactions={filteredTransactionsForPeriod} 
                            selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} 
                            selectedYear={reportYear}
                            chartHeightClass="max-h-[400px] min-h-[350px] md:min-h-[400px]"
                        />
                    </motion.div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <motion.div variants={cardVariants}><MonthlySpendingTrendChart transactions={allTransactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /></motion.div> 
                      <motion.div variants={cardVariants}><IncomeExpenseTrendChart transactions={allTransactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /></motion.div>
                  </div>
                </>
              )}

              <motion.div variants={cardVariants}>
                <Card className={cn("shadow-lg border-accent/30 bg-accent/10", glowClass)}>
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-accent dark:text-accent-foreground flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-accent" />
                      AI Insights
                    </CardTitle>
                    <CardDescription className="text-accent/80 dark:text-accent-foreground/80">
                      AI-powered comparative spending analysis for {reportMonth === -1 ? `${reportYear} vs ${reportYear-1}` : `${monthNamesList[reportMonth]} ${reportYear} vs ${ reportMonth === 0 ? monthNamesList[11] + ' ' + (reportYear-1) : monthNamesList[reportMonth-1] + ' ' + reportYear}`}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isAiLoading && (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full bg-accent/30" />
                        <Skeleton className="h-4 w-full bg-accent/30" />
                        <Skeleton className="h-4 w-3/4 bg-accent/30" />
                      </div>
                    )}
                    {aiError && <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>}
                    {aiAnalysis && !isAiLoading && (
                      <div className="text-sm space-y-2 p-3 bg-accent/5 border border-accent/20 rounded-md text-accent dark:text-accent-foreground/90">
                        {aiAnalysis.split('\n').map((line, index) => (
                          <p key={index}>{line.replace(/^- /, '• ')}</p>
                        ))}
                      </div>
                    )}
                    {(!aiAnalysis && !isAiLoading && !aiError && filteredTransactionsForPeriod.length === 0 && !isLoadingData) && (
                      <p className="text-sm text-muted-foreground">Not enough data to generate AI analysis for this period.</p>
                    )}
                    <motion.div {...buttonHoverTap}>
                      <Button onClick={generateAIReport} disabled={isAiLoading || (filteredTransactionsForPeriod.length === 0 && !isLoadingData)} className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
                        {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <TrendingUp className="mr-2 h-4 w-4" /> }
                        {isAiLoading ? "Generating..." : "Generate AI Analysis"}
                      </Button>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

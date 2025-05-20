
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Transaction } from '@/lib/types';
import { getTransactions } from '@/lib/actions/transactions';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { BarChart, PieChartIcon, TrendingUp, BookOpen, Download, FileText, Loader2, AlertTriangle } from 'lucide-react';
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


export default function ReportsPage() {
  const { selectedMonth, selectedYear, monthNamesList, handleMonthChange: contextHandleMonthChange, handleYearChange: contextHandleYearChange, years: contextYears } = useDateSelection();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]); 
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [reportYear, setReportYear] = useState<number>(selectedYear);
  const [reportMonth, setReportMonth] = useState<number>(selectedMonth);

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

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const transactionYear = new Date(t.date).getFullYear();
      const transactionMonth = new Date(t.date).getMonth();
      if (reportMonth === -1) { 
        return transactionYear === reportYear;
      }
      return transactionYear === reportYear && transactionMonth === reportMonth;
    });
  }, [allTransactions, reportYear, reportMonth]);

  const currentMonthForAI = reportMonth === -1 ? new Date(reportYear, 11) : new Date(reportYear, reportMonth);
  const previousMonthForAI = new Date(currentMonthForAI);
  previousMonthForAI.setMonth(previousMonthForAI.getMonth() -1);
  
  const currentPeriodExpenses = useMemo(() => 
    filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  , [filteredTransactions]);

  const previousPeriodExpenses = useMemo(() => {
    const prevReportMonth = reportMonth === -1 ? -1 : (reportMonth === 0 ? 11 : reportMonth -1);
    const prevReportYear = reportMonth === -1 ? reportYear -1 : (reportMonth === 0 ? reportYear -1 : reportYear);
    
    return allTransactions.filter(t => { 
      const transactionYear = new Date(t.date).getFullYear();
      const transactionMonth = new Date(t.date).getMonth();
       if (prevReportMonth === -1) { 
        return transactionYear === prevReportYear;
      }
      return transactionYear === prevReportYear && transactionMonth === prevReportMonth;
    }).filter(t=> t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  }, [allTransactions, reportYear, reportMonth]);

  const formatExpenseCategoriesForAI = (trans: Transaction[]): string => {
    const expenses = trans.filter(t => t.type === 'expense' && t.category);
    const categoryMap: Record<string, number> = {};
    expenses.forEach(t => {
      categoryMap[t.category!] = (categoryMap[t.category!] || 0) + t.amount;
    });
    return Object.entries(categoryMap).map(([cat, amt]) => `${cat}: ₹${amt.toFixed(2)}`).join(', ') || 'No expenses in this period.';
  };


  const generateAIReport = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);

    const currentPeriodName = reportMonth === -1 ? `${reportYear}` : `${monthNamesList[reportMonth]} ${reportYear}`;
    const previousPeriodName = reportMonth === -1 ? `${reportYear-1}` : `${monthNamesList[previousMonthForAI.getMonth()]} ${previousMonthForAI.getFullYear()}`;

    const input: ComparativeExpenseAnalysisInput = {
      currentMonth: currentPeriodName,
      previousMonth: previousPeriodName,
      currentMonthExpenses: currentPeriodExpenses,
      previousMonthExpenses: previousPeriodExpenses,
      expenseCategoriesCurrent: formatExpenseCategoriesForAI(filteredTransactions),
      expenseCategoriesPrevious: formatExpenseCategoriesForAI(
        allTransactions.filter(t => { 
            const transactionYear = new Date(t.date).getFullYear();
            const transactionMonth = new Date(t.date).getMonth();
            const prevReportMonth = reportMonth === -1 ? -1 : (reportMonth === 0 ? 11 : reportMonth -1);
            const prevReportYear = reportMonth === -1 ? reportYear -1 : (reportMonth === 0 ? reportYear -1 : reportYear);
            if (prevReportMonth === -1) return transactionYear === prevReportYear;
            return transactionYear === prevReportYear && transactionMonth === prevReportMonth;
        })
      ),
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
        backgroundColor: "hsl(var(--background))", 
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
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({ title: "Export Failed", description: "An error occurred during PDF generation.", variant: "destructive"});
    }
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className="shadow-xl border-purple-500/30 border-2 rounded-xl bg-card/80">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-purple-300 flex items-center gap-2">
              <FileText className="w-8 h-8 text-yellow-400 transform rotate-[-3deg]" />
              Financial Reports
            </CardTitle>
            <CardDescription className="text-purple-400/80">
              Analyze your spending and income patterns. Use filters to select the report period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <Select value={reportMonth.toString()} onValueChange={handleMonthChangeInternal}>
                <SelectTrigger className="w-full md:w-[180px] bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground">
                  <SelectValue placeholder="Select Report Period" />
                </SelectTrigger>
                <SelectContent className="bg-card border-purple-500/60 text-foreground">
                  <SelectItem value="-1">Annual Report</SelectItem>
                  {monthNamesList.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reportYear.toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="w-full md:w-[120px] bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent className="bg-card border-purple-500/60 text-foreground">
                  {contextYears.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
                </SelectContent>
              </Select>
              <motion.div {...buttonHoverTap}>
                <Button onClick={exportReportToPDF} variant="outline" className="bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30 text-yellow-200">
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
                  <Loader2 className="h-12 w-12 text-yellow-400 animate-spin" />
                  <p className="ml-4 text-purple-300">Loading report data...</p>
                </div>
              ) : filteredTransactions.length === 0 && !isLoadingData ? (
                <Alert variant="default" className="border-yellow-600/50 bg-yellow-500/10 text-yellow-300 shadow-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <AlertTitle>No Data for this Period</AlertTitle>
                  <AlertDescription>
                    No transactions found for {reportMonth === -1 ? reportYear : `${monthNamesList[reportMonth]} ${reportYear}`}. Try a different period or add some transactions.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div variants={cardVariants}><ExpenseCategoryChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/></motion.div>
                    <motion.div variants={cardVariants}><ExpensePaymentMethodChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/></motion.div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <motion.div variants={cardVariants}><MonthlySpendingTrendChart transactions={allTransactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /></motion.div> 
                      <motion.div variants={cardVariants}><IncomeExpenseTrendChart transactions={allTransactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /></motion.div>
                  </div>
                </>
              )}

              <motion.div variants={cardVariants}>
                <Card className="shadow-lg border-yellow-500/30 bg-yellow-900/10">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-yellow-300 flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-yellow-400" />
                      AI Insights
                    </CardTitle>
                    <CardDescription className="text-yellow-400/80">
                      AI-powered comparative spending analysis for {reportMonth === -1 ? `${reportYear} vs ${reportYear-1}` : `${monthNamesList[reportMonth]} ${reportYear} vs ${monthNamesList[previousMonthForAI.getMonth()]} ${previousMonthForAI.getFullYear()}`}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isAiLoading && (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full bg-yellow-500/30" />
                        <Skeleton className="h-4 w-full bg-yellow-500/30" />
                        <Skeleton className="h-4 w-3/4 bg-yellow-500/30" />
                      </div>
                    )}
                    {aiError && <p className="text-sm text-red-400">{aiError}</p>}
                    {aiAnalysis && !isAiLoading && (
                      <div className="text-sm space-y-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md text-yellow-200">
                        {aiAnalysis.split('\n').map((line, index) => (
                          <p key={index}>{line.replace(/^- /, '• ')}</p>
                        ))}
                      </div>
                    )}
                    {(!aiAnalysis && !isAiLoading && !aiError && filteredTransactions.length === 0 && !isLoadingData) && (
                      <p className="text-sm text-yellow-400/70">Not enough data to generate AI analysis for this period.</p>
                    )}
                    <motion.div {...buttonHoverTap}>
                      <Button onClick={generateAIReport} disabled={isAiLoading || (filteredTransactions.length === 0 && !isLoadingData)} className="w-full mt-4 bg-yellow-500 hover:bg-yellow-600 text-purple-950 font-bold">
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

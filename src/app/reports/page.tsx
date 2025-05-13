
"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { initialTransactions } from '@/lib/data';
import type { Transaction } from '@/lib/types';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { BarChart, PieChartIcon, TrendingUp, TrendingDown, BookOpen, Download, FileText } from 'lucide-react';
import { ExpenseCategoryChart } from '@/components/charts/expense-category-chart';
import { MonthlySpendingTrendChart } from '@/components/charts/monthly-spending-trend-chart';
import { IncomeExpenseTrendChart } from '@/components/charts/income-expense-trend-chart';
import { ExpensePaymentMethodChart } from '@/components/charts/expense-payment-method-chart';
import { comparativeExpenseAnalysis, type ComparativeExpenseAnalysisInput } from '@/ai/flows/comparative-expense-analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/hooks/use-toast";


export default function ReportsPage() {
  const { selectedDate, selectedMonth, selectedYear, monthNamesList, handleMonthChange: contextHandleMonthChange, handleYearChange: contextHandleYearChange, years: contextYears } = useDateSelection();
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions); // Assuming all transactions
  
  const [reportYear, setReportYear] = useState<number>(selectedYear);
  const [reportMonth, setReportMonth] = useState<number>(selectedMonth); // -1 for annual, 0-11 for monthly

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { toast } = useToast();

  const handleYearChange = (yearValue: string) => {
    setReportYear(parseInt(yearValue, 10));
    contextHandleYearChange(yearValue); // Update context if needed, or manage report date separately
  };

  const handleMonthChangeInternal = (monthValue: string) => {
    setReportMonth(parseInt(monthValue, 10));
    if (parseInt(monthValue, 10) !== -1) { // -1 is annual
      contextHandleMonthChange(monthValue); // Update context if needed
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const transactionYear = t.date.getFullYear();
      const transactionMonth = t.date.getMonth();
      if (reportMonth === -1) { // Annual report
        return transactionYear === reportYear;
      }
      return transactionYear === reportYear && transactionMonth === reportMonth;
    });
  }, [transactions, reportYear, reportMonth]);

  const currentMonthForAI = reportMonth === -1 ? new Date(reportYear, 11) : new Date(reportYear, reportMonth);
  const previousMonthForAI = new Date(currentMonthForAI);
  previousMonthForAI.setMonth(previousMonthForAI.getMonth() -1);
  
  const currentPeriodExpenses = useMemo(() => 
    filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  , [filteredTransactions]);

  const previousPeriodExpenses = useMemo(() => {
    const prevReportMonth = reportMonth === -1 ? -1 : (reportMonth === 0 ? 11 : reportMonth -1);
    const prevReportYear = reportMonth === -1 ? reportYear -1 : (reportMonth === 0 ? reportYear -1 : reportYear);
    
    return transactions.filter(t => {
      const transactionYear = t.date.getFullYear();
      const transactionMonth = t.date.getMonth();
       if (prevReportMonth === -1) { // Annual report comparison
        return transactionYear === prevReportYear;
      }
      return transactionYear === prevReportYear && transactionMonth === prevReportMonth;
    }).filter(t=> t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, reportYear, reportMonth]);

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
        transactions.filter(t => {
            const transactionYear = t.date.getFullYear();
            const transactionMonth = t.date.getMonth();
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
    
    toast({ title: "Generating PDF...", description: "Please wait while your report is being created."});

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(reportContentElement, {
        scale: 2, 
        useCORS: true, 
        logging: true,
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
      const newImgWidth = imgWidth * ratio;
      const newImgHeight = imgHeight * ratio;

      const x = (pdfWidth - newImgWidth) / 2;
      const y = (pdfHeight - newImgHeight) / 2;


      pdf.addImage(imgData, 'PNG', x, y, newImgWidth, newImgHeight);
      pdf.save(`financial_report_${reportMonth === -1 ? reportYear : monthNamesList[reportMonth] + '_' + reportYear}.pdf`);
      toast({ title: "Report Exported!", description: "Your financial report PDF has been downloaded." });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({ title: "Export Failed", description: "An error occurred while generating the PDF.", variant: "destructive"});
    }
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <Card className="shadow-xl border-primary/20 border-2 rounded-xl bg-card/80">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary transform rotate-[-3deg]" />
            Financial Reports
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            Analyze your spending and income patterns. Use filters to select the report period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <Select value={reportMonth.toString()} onValueChange={handleMonthChangeInternal}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/70 border-primary/30 focus:border-accent focus:ring-accent">
                <SelectValue placeholder="Select Report Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Annual Report</SelectItem>
                {monthNamesList.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reportYear.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-full md:w-[120px] bg-background/70 border-primary/30 focus:border-accent focus:ring-accent">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {contextYears.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={exportReportToPDF} variant="outline" className="bg-primary/10 border-primary/50 hover:bg-primary/20 text-primary">
                <Download className="mr-2 h-4 w-4" />
                Export to PDF
            </Button>
          </div>
        
          <div id="report-content-area" className="space-y-6">
            {filteredTransactions.length === 0 ? (
               <Alert variant="default" className="border-yellow-500/50 bg-yellow-400/10 text-yellow-700 shadow-md">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle>No Data for this Period</AlertTitle>
                <AlertDescription>
                  No data for {reportMonth === -1 ? reportYear : `${monthNamesList[reportMonth]} ${reportYear}`}. Try a different period or add some transactions.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ExpenseCategoryChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/>
                  <ExpensePaymentMethodChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <MonthlySpendingTrendChart transactions={transactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /> 
                    <IncomeExpenseTrendChart transactions={transactions} numberOfMonths={reportMonth === -1 ? 12 : 6} />
                </div>
              </>
            )}

            <Card className="shadow-lg border-accent/30 bg-accent/5">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-accent-foreground flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-accent" />
                  AI Financial Analysis
                </CardTitle>
                <CardDescription className="text-accent-foreground/80">
                  AI-powered comparative spending analysis for {reportMonth === -1 ? `${reportYear} vs ${reportYear-1}` : `${monthNamesList[reportMonth]} ${reportYear} vs ${monthNamesList[previousMonthForAI.getMonth()]} ${previousMonthForAI.getFullYear()}`}.
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
                {aiError && <p className="text-sm text-destructive">{aiError}</p>}
                {aiAnalysis && !isAiLoading && (
                  <div className="text-sm space-y-2 p-3 bg-accent/10 border border-accent/30 rounded-md text-accent-foreground">
                    {aiAnalysis.split('\n').map((line, index) => (
                      <p key={index}>{line.replace(/^- /, '• ')}</p>
                    ))}
                  </div>
                )}
                {(!aiAnalysis && !isAiLoading && !aiError && filteredTransactions.length === 0) && (
                  <p className="text-sm text-accent-foreground/70">Not enough data to generate AI analysis for this period.</p>
                )}
                 <Button onClick={generateAIReport} disabled={isAiLoading || filteredTransactions.length === 0} className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  {isAiLoading ? "Generating Analysis..." : "Generate AI Analysis"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}


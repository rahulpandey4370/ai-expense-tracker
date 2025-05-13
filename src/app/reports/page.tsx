
"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { initialTransactions } from '@/lib/data';
import type { Transaction } from '@/lib/types';
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { BarChart, PieChartIcon, TrendingUp, TrendingDown, BookOpen, Download } from 'lucide-react';
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
  const { selectedDate, selectedMonth, selectedYear, monthNamesList, handleMonthChange, handleYearChange: contextHandleYearChange, years: contextYears } = useDateSelection();
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions); // Assuming all transactions
  
  const [reportYear, setReportYear] = useState<number>(selectedYear);
  const [reportMonth, setReportMonth] = useState<number>(selectedMonth); // -1 for annual, 0-11 for monthly

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { toast } = useToast();

  const handleYearChange = (yearValue: string) => {
    setReportYear(parseInt(yearValue, 10));
  };

  const handleMonthChangeInternal = (monthValue: string) => {
    setReportMonth(parseInt(monthValue, 10));
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
      setAiError("The Sorting Hat couldn't conjure the report. Please try again.");
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
    
    toast({ title: "Brewing PDF...", description: "Please wait while your report is being generated."});

    try {
      // Give charts a moment to render fully if they are dynamic
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(reportContentElement, {
        scale: 2, // Increase scale for better quality
        useCORS: true, // If you have external images/styles
        logging: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt', // points
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate the aspect ratio
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const newImgWidth = imgWidth * ratio;
      const newImgHeight = imgHeight * ratio;

      // Calculate position to center the image
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
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-yellow-400 transform rotate-6">
                <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.502a.75.75 0 0 0 .5.707A9.735 9.735 0 0 0 6 21a9.707 9.707 0 0 0 5.25-1.533v-1.469A8.23 8.23 0 0 1 6 19.5a8.23 8.23 0 0 1-2.25-.382V4.882A8.23 8.23 0 0 1 6 4.5c2.969 0 5.531 1.596 6.973 3.949A8.21 8.21 0 0 1 15 7.5a8.21 8.21 0 0 1-1.027.551V15a.75.75 0 0 0 1.5 0V8.804a.75.75 0 0 0-.389-.668A9.729 9.729 0 0 0 12.75 6V4.533Z" />
                <path d="M15 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
                <path d="M15 12.75a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75Z" />
                <path d="M15 15.75a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75Z" />
                <path d="M15 18.75a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75Z" />
            </svg>
            Scrolls of Scrutiny (Financial Reports)
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            Unfurl these scrolls to reveal patterns in your spending and income. Use the filters to select the period for your report.
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
            <Button onClick={exportReportToPDF} variant="outline" className="bg-yellow-500/20 border-yellow-600 hover:bg-yellow-500/30 text-yellow-700">
                <Download className="mr-2 h-4 w-4" />
                Export to Magical PDF
            </Button>
          </div>
        
          <div id="report-content-area" className="space-y-6">
            {filteredTransactions.length === 0 ? (
               <Alert variant="default" className="border-yellow-500/50 bg-yellow-400/10 text-yellow-700 shadow-md">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle>No Data for this Period</AlertTitle>
                <AlertDescription>
                  It seems the Gringotts vaults are empty for {reportMonth === -1 ? reportYear : `${monthNamesList[reportMonth]} ${reportYear}`}. Try a different period or add some transactions!
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ExpenseCategoryChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/>
                  <ExpensePaymentMethodChart transactions={filteredTransactions} selectedMonthName={reportMonth === -1 ? 'Annual' : monthNamesList[reportMonth]} selectedYear={reportYear}/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <MonthlySpendingTrendChart transactions={transactions} numberOfMonths={reportMonth === -1 ? 12 : 6} /> {/* Show 12 months for annual, 6 for monthly context */}
                    <IncomeExpenseTrendChart transactions={transactions} numberOfMonths={reportMonth === -1 ? 12 : 6} />
                </div>
              </>
            )}

            <Card className="shadow-lg border-purple-500/30 bg-purple-500/5">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-purple-700 flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Headmaster's Financial Wisdom (AI Analysis)
                </CardTitle>
                <CardDescription className="text-purple-600/80">
                  An AI-powered comparative analysis of your spending for {reportMonth === -1 ? `${reportYear} vs ${reportYear-1}` : `${monthNamesList[reportMonth]} ${reportYear} vs ${monthNamesList[previousMonthForAI.getMonth()]} ${previousMonthForAI.getFullYear()}`}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isAiLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full bg-purple-300/50" />
                    <Skeleton className="h-4 w-full bg-purple-300/50" />
                    <Skeleton className="h-4 w-3/4 bg-purple-300/50" />
                  </div>
                )}
                {aiError && <p className="text-sm text-destructive">{aiError}</p>}
                {aiAnalysis && !isAiLoading && (
                  <div className="text-sm space-y-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-md text-purple-800">
                    {aiAnalysis.split('\n').map((line, index) => (
                      <p key={index}>{line.replace(/^- /, '• ')}</p>
                    ))}
                  </div>
                )}
                {(!aiAnalysis && !isAiLoading && !aiError && filteredTransactions.length === 0) && (
                  <p className="text-sm text-purple-600/70">Not enough data to summon the AI wisdom for this period.</p>
                )}
                 <Button onClick={generateAIReport} disabled={isAiLoading || filteredTransactions.length === 0} className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  {isAiLoading ? "Consulting the Oracle..." : "Reveal AI Insights"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

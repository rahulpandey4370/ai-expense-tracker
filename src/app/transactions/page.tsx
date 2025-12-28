
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppTransaction, Category, PaymentMethod, ExpenseType as AppExpenseType } from '@/lib/types';
import { getTransactions, deleteTransaction, getCategories, getPaymentMethods, deleteMultipleTransactions } from '@/lib/actions/transactions';
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Edit3, Trash2, Download, BookOpen, Loader2, Sigma, List, ShieldAlert, Filter, Users } from "lucide-react";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TransactionForm } from '@/components/transaction-form';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { useAIModel } from '@/contexts/AIModelContext';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 120 } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

type ViewMode = 'selected_month' | 'full_year';
type SortableKeys = keyof AppTransaction | 'categoryName' | 'paymentMethodName';
type SplitFilter = 'all' | 'split' | 'not_split';

export default function TransactionsPage() {
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<AppTransaction[]>([]);
  const [allCategoriesState, setAllCategoriesState] = useState<Category[]>([]);
  const [allPaymentMethodsState, setAllPaymentMethodsState] = useState<PaymentMethod[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | 'all'>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string | 'all'>('all');
  const [filterPaymentMethodId, setFilterPaymentMethodId] = useState<string | 'all'>('all');
  const [filterExpenseType, setFilterExpenseType] = useState<string | 'all'>('all');
  const [filterSplit, setFilterSplit] = useState<SplitFilter>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys | null; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState<AppTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false); // For single delete

  const { toast } = useToast();
  const { selectedMonth, selectedYear, monthNamesList, handleMonthChange, handleYearChange } = useDateSelection();
  const [viewMode, setViewMode] = useState<ViewMode>('selected_month');
  
  const searchParams = useSearchParams();
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');
  const paramType = searchParams.get('type');
  const paramExpenseType = searchParams.get('expenseType');

  const hasAppliedInitialParams = useRef(false);
  const { selectedModel } = useAIModel();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setSelectedTransactionIds(new Set()); // Reset selection on data refresh
    try {
      const [fetchedTransactions, fetchedCategories, fetchedPaymentMethods] = await Promise.all([
        getTransactions(),
        getCategories(),
        getPaymentMethods()
      ]);
      setAllTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)})));
      setAllCategoriesState(fetchedCategories);
      setAllPaymentMethodsState(fetchedPaymentMethods);
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
      toast({ title: "Error Fetching Data", description: error instanceof Error ? error.message : "Could not load initial transaction data, categories, or payment methods. Please try again.", variant: "destructive"});
      setAllTransactions([]);
      setAllCategoriesState([]);
      setAllPaymentMethodsState([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isLoading && !hasAppliedInitialParams.current) {

      if (paramMonth !== null && paramYear !== null) {
        const monthNum = parseInt(paramMonth, 10);
        const yearNum = parseInt(paramYear, 10);
        if (!isNaN(monthNum) && monthNum >= 0 && monthNum < 12 && !isNaN(yearNum)) {
          if (selectedMonth !== monthNum) handleMonthChange(monthNum.toString());
          if (selectedYear !== yearNum) handleYearChange(yearNum.toString());
          setViewMode('selected_month');
        }
      }
      if (paramType) setFilterType(paramType);
      if (paramExpenseType) setFilterExpenseType(paramExpenseType);
      
      if (paramMonth || paramYear || paramType || paramExpenseType || searchParams.toString() === '') {
         hasAppliedInitialParams.current = true;
      }
    }
  }, [paramMonth, paramYear, paramType, paramExpenseType, isLoading, handleMonthChange, handleYearChange, selectedMonth, selectedYear, searchParams]);


  useEffect(() => {
    let tempTransactions = [...allTransactions];

    if (viewMode === 'selected_month') {
      tempTransactions = tempTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() === selectedMonth && transactionDate.getFullYear() === selectedYear;
      });
    } else { 
      tempTransactions = tempTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getFullYear() === selectedYear;
      });
    }

    if (searchTerm) {
      tempTransactions = tempTransactions.filter(t =>
        (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.category && t.category.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.source && t.source.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterType !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.type === filterType);
    }
    
    if (filterExpenseType !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.expenseType === filterExpenseType);
    }

    if (filterCategoryId !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.category?.id === filterCategoryId);
    }

    if (filterPaymentMethodId !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.paymentMethod?.id === filterPaymentMethodId);
    }
    
    if (filterSplit !== 'all') {
        if (filterSplit === 'split') {
            tempTransactions = tempTransactions.filter(t => t.isSplit);
        } else { // not_split
            tempTransactions = tempTransactions.filter(t => !t.isSplit);
        }
    }

    if (sortConfig.key) {
      tempTransactions.sort((a, b) => {
        let aValue, bValue;
        if (sortConfig.key === 'categoryName') {
          aValue = a.category?.name || '';
          bValue = b.category?.name || '';
        } else if (sortConfig.key === 'paymentMethodName') {
          aValue = a.paymentMethod?.name || '';
          bValue = b.paymentMethod?.name || '';
        } else {
          aValue = a[sortConfig.key as keyof AppTransaction];
          bValue = b[sortConfig.key as keyof AppTransaction];
        }
        if (aValue === undefined || bValue === undefined || aValue === null || bValue === null) return 0;
        if (sortConfig.key === 'date' && aValue instanceof Date && bValue instanceof Date) {
           return sortConfig.direction === 'ascending' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        return 0;
      });
    }
    setFilteredTransactions(tempTransactions);
  }, [allTransactions, searchTerm, filterType, filterCategoryId, filterPaymentMethodId, filterExpenseType, filterSplit, sortConfig, selectedMonth, selectedYear, viewMode]);

  const filteredSummary = useMemo(() => {
    const count = filteredTransactions.length;
    const netAmount = filteredTransactions.reduce((acc, curr) => {
      return acc + (curr.type === 'income' ? curr.amount : -curr.amount);
    }, 0);
    return { count, netAmount };
  }, [filteredTransactions]);

  const handleTransactionUpdateOrAdd = () => {
    fetchData(); 
    setEditingTransaction(null);
  };

  const handleDeleteSingleTransaction = async (transactionId: string) => {
    setIsDeleting(true);
    try {
      await deleteTransaction(transactionId);
      toast({ title: "Transaction Deleted!", description: "The transaction has been successfully removed." });
      fetchData(); 
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      toast({ title: "Deletion Failed", description: "Could not remove the transaction.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedTransactionIds);
    try {
      const result = await deleteMultipleTransactions(idsToDelete);
      toast({
        title: "Bulk Deletion Complete",
        description: `${result.successCount} transaction(s) deleted. ${result.errorCount > 0 ? `${result.errorCount} failed.` : ''}`,
        variant: result.errorCount > 0 ? "destructive" : "default",
      });
      if (result.errors.length > 0) {
        console.error("Bulk delete errors:", result.errors);
      }
      fetchData(); // Refreshes list and clears selection
    } catch (error) {
      console.error("Failed to bulk delete transactions:", error);
      toast({ title: "Bulk Deletion Failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };
  
  const toggleSelectTransaction = (id: string) => {
    setSelectedTransactionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTransactionIds.size === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortableKeys) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return '';
  };

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: "No Data to Export", description: "There are no transactions matching your current filters.", variant: "default"});
      return;
    }
    const headers = ["ID", "Type", "Date", "Amount (₹)", "Description", "Category/Source", "Payment Method", "Expense Type", "Is Split"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.type,
      format(new Date(t.date), "yyyy-MM-dd"),
      t.amount.toFixed(2),
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.category?.name || t.source || '',
      t.paymentMethod?.name || '',
      t.expenseType || '',
      t.isSplit ? 'Yes' : 'No'
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finwise_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Data Exported!", description: "Your transactions have been exported to a CSV file." });
  };

  const currentPeriodText = useMemo(() => {
    if (viewMode === 'selected_month') {
      return `${monthNamesList[selectedMonth]} ${selectedYear}`;
    }
    return `Year ${selectedYear}`;
  }, [viewMode, selectedMonth, selectedYear, monthNamesList]);

  return (
    <div className="flex-1 flex flex-col p-0 space-y-6 bg-background/80 backdrop-blur-sm sm:p-2 md:p-4 lg:p-6">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col"
      >
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90 flex-1 flex flex-col w-full", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <BookOpen className="w-7 h-7 md:w-8 md:h-8 text-accent transform -rotate-6"/>
              Manage Transactions
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              View and manage all your financial entries. Filters available below.
              Currently viewing: <strong className="text-accent">{currentPeriodText}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="mb-6 space-y-4">
              <Input
                type="text"
                placeholder="Search transactions (e.g., 'Groceries', 'Salary')"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground/70 text-sm md:text-base"
              />
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="bg-muted/50 hover:bg-muted/70 px-4 rounded-md text-sm sm:text-base">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-accent" />
                        Filter Options
                      </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 md:gap-4">
                      <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm"><SelectValue placeholder="Filter by Period" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="selected_month" className="text-xs md:text-sm">Selected Month ({monthNamesList[selectedMonth]} {selectedYear})</SelectItem>
                          <SelectItem value="full_year" className="text-xs md:text-sm">Full Year ({selectedYear})</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={filterType} onValueChange={(value) => setFilterType(value as string | 'all')}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="all" className="text-xs md:text-sm">All Types</SelectItem>
                          <SelectItem value="income" className="text-xs md:text-sm">Income</SelectItem>
                          <SelectItem value="expense" className="text-xs md:text-sm">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={filterExpenseType} onValueChange={setFilterExpenseType} disabled={filterType === 'income'}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed"><SelectValue placeholder="Filter by Expense Type" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="all" className="text-xs md:text-sm">All Expense Types</SelectItem>
                          <SelectItem value="need" className="text-xs md:text-sm">Need</SelectItem>
                          <SelectItem value="want" className="text-xs md:text-sm">Want</SelectItem>
                          <SelectItem value="investment" className="text-xs md:text-sm">Investment</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm"><SelectValue placeholder="Filter by Category/Source" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="all" className="text-xs md:text-sm">All Categories/Sources</SelectItem>
                          {allCategoriesState.map(cat => <SelectItem key={cat.id} value={cat.id} className="text-xs md:text-sm">{cat.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={filterPaymentMethodId} onValueChange={setFilterPaymentMethodId}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm"><SelectValue placeholder="Filter by Payment Method" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="all" className="text-xs md:text-sm">All Payment Methods</SelectItem>
                          {allPaymentMethodsState.map(pm => <SelectItem key={pm.id} value={pm.id} className="text-xs md:text-sm">{pm.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                       <Select value={filterSplit} onValueChange={(value) => setFilterSplit(value as SplitFilter)}>
                        <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground text-xs md:text-sm"><SelectValue placeholder="Filter by Split Status" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="all" className="text-xs md:text-sm">All Transactions</SelectItem>
                          <SelectItem value="split" className="text-xs md:text-sm">Only Split</SelectItem>
                          <SelectItem value="not_split" className="text-xs md:text-sm">Only Non-Split</SelectItem>
                        </SelectContent>
                      </Select>
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button onClick={exportToCSV} variant="outline" className="w-full bg-accent/20 border-accent/50 hover:bg-accent/30 text-accent dark:text-accent-foreground text-xs md:text-sm">
                          <Download className="mr-2 h-4 w-4" />
                          Export to CSV
                        </Button>
                      </motion.div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="my-4 p-3 md:p-4 border rounded-lg bg-background/50 border-primary/20 flex flex-col sm:flex-row flex-wrap justify-between items-center gap-3 md:gap-4">
              <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                <List className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span>Showing: <strong className="text-foreground">{filteredSummary.count}</strong> transaction(s) for <strong className="text-accent">{currentPeriodText}</strong></span>
              </div>
              <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                <Sigma className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span>Net Total: <strong className={cn("text-foreground", filteredSummary.netAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>₹{filteredSummary.netAmount.toFixed(2)}</strong></span>
              </div>
              {selectedTransactionIds.size > 0 && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isBulkDeleting} className="w-full sm:w-auto">
                        {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Selected ({selectedTransactionIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive flex items-center gap-2"><ShieldAlert />Confirm Bulk Deletion</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                          Are you sure you want to permanently delete {selectedTransactionIds.size} selected transaction(s)? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-primary/70 text-primary hover:bg-primary/20">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-red-600 hover:bg-red-700/80 text-primary-foreground">
                          {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete Selected"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
              )}
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-[300px] sm:h-[400px]">
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 text-accent animate-spin" />
                <p className="ml-3 sm:ml-4 text-base sm:text-lg text-primary">Loading transactions...</p>
              </div>
            ) : (
            <ScrollArea className="h-0 flex-grow rounded-md border border-primary/30 bg-background/50">
              {/* Mobile View - Card List */}
              <div className="md:hidden space-y-3 p-2">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map(t => (
                    <motion.div key={t.id} variants={listItemVariants} className="p-3 border rounded-lg bg-card/80 shadow-sm space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <Checkbox
                          checked={selectedTransactionIds.has(t.id)}
                          onCheckedChange={() => toggleSelectTransaction(t.id)}
                          aria-label={`Select transaction ${t.description}`}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-foreground flex items-center gap-1.5">{t.isSplit && <Users className="h-4 w-4 text-accent"/>}{t.description}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(t.date), "dd MMM, yyyy")}</p>
                        </div>
                        <p className={cn("text-lg font-bold", t.type === 'income' ? 'text-green-500' : 'text-red-500')}>
                          {t.type === 'income' ? '+' : '-'}₹{t.amount.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pl-8">
                         <Badge variant="outline">{t.category?.name || t.source}</Badge>
                         {t.paymentMethod && <Badge variant="secondary">{t.paymentMethod.name}</Badge>}
                         {t.expenseType && <Badge variant="default" className={cn('capitalize', t.expenseType === 'need' ? 'bg-blue-500/80' : t.expenseType === 'want' ? 'bg-purple-500/80' : 'bg-indigo-500/80', 'text-white')}>{t.expenseType.replace('_expense','')}</Badge>}
                      </div>
                      <div className="flex justify-end gap-1 pt-2">
                         <Button variant="ghost" size="icon" onClick={() => setEditingTransaction(t)} className="text-accent h-7 w-7"><Edit3 className="h-4 w-4" /></Button>
                         <AlertDialog>
                           <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive h-7 w-7"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                           <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Transaction?</AlertDialogTitle><AlertDialogDescription>This will permanently remove "{t.description}".</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSingleTransaction(t.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                         </AlertDialog>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-10">No transactions found.</p>
                )}
              </div>
              {/* Desktop View - Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-primary/10 border-b-primary/30">
                      <TableHead className="w-12 px-2">
                        <Checkbox
                          checked={filteredTransactions.length > 0 && selectedTransactionIds.size === filteredTransactions.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all transactions"
                          disabled={filteredTransactions.length === 0}
                        />
                      </TableHead>
                      <TableHead onClick={() => requestSort('date')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm whitespace-nowrap">Date{getSortIndicator('date')}</TableHead>
                      <TableHead onClick={() => requestSort('description')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm">Description{getSortIndicator('description')}</TableHead>
                      <TableHead onClick={() => requestSort('type')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm whitespace-nowrap">Type{getSortIndicator('type')}</TableHead>
                      <TableHead onClick={() => requestSort('amount')} className="text-right cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm whitespace-nowrap">Amount (₹){getSortIndicator('amount')}</TableHead>
                      <TableHead onClick={() => requestSort('categoryName')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm">Category/Source{getSortIndicator('categoryName')}</TableHead>
                      <TableHead onClick={() => requestSort('paymentMethodName')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm">Payment Method{getSortIndicator('paymentMethodName')}</TableHead>
                      <TableHead onClick={() => requestSort('expenseType')} className="cursor-pointer text-muted-foreground font-semibold hover:text-accent text-xs sm:text-sm whitespace-nowrap">Expense Type{getSortIndicator('expenseType')}</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-xs sm:text-sm whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <motion.tbody variants={listContainerVariants} initial="hidden" animate="visible">
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((transaction) => (
                        <motion.tr
                          key={transaction.id}
                          variants={listItemVariants}
                          layout
                          className={cn("hover:bg-accent/10 border-b-primary/20 text-xs sm:text-sm", selectedTransactionIds.has(transaction.id) && "bg-primary/10 dark:bg-primary/20")}
                        >
                          <TableCell className="px-2">
                            <Checkbox
                              checked={selectedTransactionIds.has(transaction.id)}
                              onCheckedChange={() => toggleSelectTransaction(transaction.id)}
                              aria-label={`Select transaction ${transaction.description}`}
                            />
                          </TableCell>
                          <TableCell className="text-foreground/90 whitespace-nowrap">{format(new Date(transaction.date), "dd MMM, yy")}</TableCell>
                          <TableCell className="font-medium text-foreground min-w-[150px] flex items-center gap-1.5">{transaction.isSplit && <Users className="h-4 w-4 text-accent"/>}{transaction.description}</TableCell>
                          <TableCell>
                            <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'}
                                  className={cn(
                                    "text-xs px-1.5 py-0.5 sm:px-2 sm:py-0.5",
                                    transaction.type === 'income' ?
                                    'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40 hover:bg-green-500/30' :
                                    'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40 hover:bg-red-500/30'
                                  )}>
                              {transaction.type === 'income' ? <ArrowUpCircle className="mr-1 h-3 w-3" /> : <ArrowDownCircle className="mr-1 h-3 w-3" />}
                              {transaction.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap ${transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {transaction.type === 'income' ? '+' : '-'}₹{transaction.amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-foreground/90 min-w-[120px]">{transaction.category?.name || transaction.source}</TableCell>
                          <TableCell className="text-foreground/90 min-w-[120px]">{transaction.paymentMethod?.name || 'N/A'}</TableCell>
                          <TableCell>
                            {transaction.type === 'expense' && transaction.expenseType && (
                              <Badge
                                variant={'outline'}
                                className={cn(
                                  `capitalize border-opacity-50 text-xs px-1.5 py-0.5 sm:px-2 sm:py-0.5`,
                                  transaction.expenseType === 'need' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40' :
                                  transaction.expenseType === 'want' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40' :
                                  transaction.expenseType === 'investment' ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/40' :
                                  'bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40'
                                )}
                              >
                                {transaction.expenseType.replace('_expense', '')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="space-x-0.5 sm:space-x-1 whitespace-nowrap">
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                              <Button variant="ghost" size="icon" onClick={() => setEditingTransaction(transaction)} className="text-accent hover:text-accent/80 hover:bg-accent/10 h-7 w-7 sm:h-8 sm:w-8">
                                <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <span className="sr-only">Edit Transaction</span>
                              </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-7 w-7 sm:h-8 sm:w-8">
                                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  <span className="sr-only">Delete Transaction</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-accent">Are you sure you want to delete this transaction?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-muted-foreground">
                                    This action cannot be undone. This will permanently remove the transaction: "{transaction.description}".
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-primary/70 text-primary hover:bg-primary/20">Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteSingleTransaction(transaction.id)} disabled={isDeleting} className="bg-red-600 hover:bg-red-700/80 text-primary-foreground">
                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            </motion.div>
                          </TableCell>
                        </motion.tr>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                          No transactions found for {currentPeriodText}. Try adjusting your filters or adding a new transaction.
                        </TableCell>
                      </TableRow>
                    )}
                  </motion.tbody>
                </Table>
              </div>
            </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={editingTransaction !== null} onOpenChange={(isOpen) => !isOpen && setEditingTransaction(null)}>
          <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg w-[90vw] max-w-lg sm:max-w-xl md:max-w-2xl rounded-lg">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-accent text-xl">
                    {editingTransaction ? "Edit Transaction" : "New Transaction"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    {editingTransaction ? "Modify the details of this transaction." : "Record a new income or expense."}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4 max-h-[70vh] overflow-y-auto pr-2">
                <TransactionForm
                  onTransactionAdded={handleTransactionUpdateOrAdd}
                  initialTransactionData={editingTransaction}
                  onCancel={() => setEditingTransaction(null)}
                />
              </div>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

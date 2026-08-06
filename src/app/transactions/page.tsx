"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AppTransaction, Category, PaymentMethod, ExpenseType as AppExpenseType } from '@/lib/types';
import { deleteTransaction, deleteMultipleTransactions, updateTransaction } from '@/lib/actions/transactions';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactionsInRange, useCategories, usePaymentMethods, useInvalidateFinance, financeKeys } from '@/hooks/use-finance-queries';
import { format } from "date-fns";
import { getCalendarDateString, isSameCalendarMonth, isSameCalendarYear, toCalendarDate } from '@/lib/date-utils';
import { ArrowDownCircle, ArrowUpCircle, Edit3, Trash2, Download, BookOpen, Loader2, Sigma, List, ShieldAlert, Filter, Users, Plus, X, MoreHorizontal, CheckSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { detectMerchant, MERCHANT_RULES } from '@/lib/merchants';
import { formatCurrency } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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

const PAGE_SIZE = 50;

/** Human-readable merchant name for the active-filter chip. */
function merchantLabel(id: string): string {
  return MERCHANT_RULES.find(m => m.id === id)?.name ?? id;
}

export default function TransactionsPage() {
  const [searchInput, setSearchInput] = useState('');
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
  const [isAddingNew, setIsAddingNew] = useState(false);
  const isMobile = useIsMobile();
  const [isDeleting, setIsDeleting] = useState(false); // For single delete
  const [isTogglingSplit, setIsTogglingSplit] = useState<string | null>(null);
  // One shared confirm dialog instead of an AlertDialog instance mounted for
  // every visible row.
  const [pendingDelete, setPendingDelete] = useState<AppTransaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { selectedMonth, selectedYear, monthNamesList, handleMonthChange, handleYearChange } = useDateSelection();
  const [viewMode, setViewMode] = useState<ViewMode>('selected_month');

  // Fetch only the selected period (month or year) server-side, cached by React
  // Query. This replaces loading the entire transactions table into the browser.
  const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === 'selected_month') {
      return {
        rangeStart: toYmd(new Date(selectedYear, selectedMonth, 1)),
        rangeEnd: toYmd(new Date(selectedYear, selectedMonth + 1, 0)),
      };
    }
    return { rangeStart: `${selectedYear}-01-01`, rangeEnd: `${selectedYear}-12-31` };
  }, [viewMode, selectedMonth, selectedYear]);

  const txQuery = useTransactionsInRange(rangeStart, rangeEnd);
  const allTransactions = useMemo(() => txQuery.data ?? [], [txQuery.data]);
  const { data: allCategoriesState = [] } = useCategories();
  const { data: allPaymentMethodsState = [] } = usePaymentMethods();
  const isLoading = txQuery.isLoading;
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  
  const searchParams = useSearchParams();
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');
  const paramType = searchParams.get('type');
  const paramExpenseType = searchParams.get('expenseType');
  const paramExpenseTypes = searchParams.get('expenseTypes'); // comma-separated multi-filter from KPI drill-downs
  const paramCategoryNames = searchParams.get('categoryNames'); // comma-separated category-name filter from KPI drill-downs
  const paramMerchant = searchParams.get('merchant'); // merchant id from the dashboard merchant tiles

  const [filterExpenseTypes, setFilterExpenseTypes] = useState<string[]>([]);
  const [filterCategoryNames, setFilterCategoryNames] = useState<string[]>([]);
  const [filterMerchantId, setFilterMerchantId] = useState<string | null>(null);

  const hasAppliedInitialParams = useRef(false);
  const { selectedModel } = useAIModel();

  // Clear row selection whenever the fetched period changes.
  useEffect(() => {
    setSelectedTransactionIds(new Set());
  }, [rangeStart, rangeEnd]);

  // Debounce the search box — it re-filters and re-renders the whole page of
  // rows, which was happening on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Bulk-select is a mode you opt into, rather than a checkbox column that
  // sits on every row of every view forever.
  const [selectMode, setSelectMode] = useState(false);
  useEffect(() => {
    if (!selectMode) setSelectedTransactionIds(new Set());
  }, [selectMode]);

  useEffect(() => {
    if (txQuery.isError) {
      toast({ title: "Error Fetching Data", description: txQuery.error instanceof Error ? txQuery.error.message : "Could not load transaction data. Please try again.", variant: "destructive" });
    }
  }, [txQuery.isError, txQuery.error, toast]);

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
      if (paramExpenseTypes) setFilterExpenseTypes(paramExpenseTypes.split(',').map(s => s.trim()).filter(Boolean));
      if (paramCategoryNames) setFilterCategoryNames(paramCategoryNames.split(',').map(s => s.trim()).filter(Boolean));
      if (paramMerchant) setFilterMerchantId(paramMerchant);

      if (paramMonth || paramYear || paramType || paramExpenseType || paramExpenseTypes || paramCategoryNames || paramMerchant || searchParams.toString() === '') {
         hasAppliedInitialParams.current = true;
      }
    }
  }, [paramMonth, paramYear, paramType, paramExpenseType, paramExpenseTypes, paramCategoryNames, paramMerchant, isLoading, handleMonthChange, handleYearChange, selectedMonth, selectedYear, searchParams]);


  const filteredTransactions = useMemo(() => {
    // Period scoping already happened server-side (rangeStart..rangeEnd); this
    // only applies the secondary filters/sort over that bounded slice.
    let tempTransactions = [...allTransactions];

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

    if (filterExpenseTypes.length > 0) {
      tempTransactions = tempTransactions.filter(t => t.expenseType && filterExpenseTypes.includes(t.expenseType));
    }

    if (filterCategoryNames.length > 0) {
      const wanted = new Set(filterCategoryNames.map(s => s.toLowerCase()));
      tempTransactions = tempTransactions.filter(t => t.category?.name && wanted.has(t.category.name.toLowerCase()));
    }

    if (filterMerchantId) {
      // Merchant isn't a stored column — it's derived from the description by
      // the same matcher the dashboard tiles use, so the drill-down total
      // always agrees with the tile the user clicked.
      tempTransactions = tempTransactions.filter(t => detectMerchant(t.description)?.id === filterMerchantId);
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
    return tempTransactions;
  }, [allTransactions, searchTerm, filterType, filterCategoryId, filterPaymentMethodId, filterExpenseType, filterExpenseTypes, filterCategoryNames, filterMerchantId, filterSplit, sortConfig]);

  const filteredSummary = useMemo(() => {
    const count = filteredTransactions.length;
    const netAmount = filteredTransactions.reduce((acc, curr) => {
      return acc + (curr.type === 'income' ? curr.amount : -curr.amount);
    }, 0);
    return { count, netAmount };
  }, [filteredTransactions]);

  // Render pagination: keep filtering/summary/select-all/export over the full
  // filtered set, but only render one page of rows at a time for DOM performance.
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, filterCategoryId, filterPaymentMethodId, filterExpenseType, filterExpenseTypes, filterCategoryNames, filterMerchantId, filterSplit, sortConfig, rangeStart, rangeEnd]);
  const pagedTransactions = useMemo(
    () => filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredTransactions, currentPage]
  );

  const handleTransactionUpdateOrAdd = () => {
    invalidate();
    setEditingTransaction(null);
  };

  const handleDeleteSingleTransaction = async (transactionId: string) => {
    setIsDeleting(true);
    try {
      await deleteTransaction(transactionId);
      toast({ title: "Transaction Deleted!", description: "The transaction has been successfully removed." });
      invalidate();
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      toast({ title: "Deletion Failed", description: "Could not remove the transaction.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleSplit = async (transaction: AppTransaction) => {
    const nextSplit = !transaction.isSplit;
    const rangeKey = financeKeys.transactionsRange(rangeStart, rangeEnd);
    // Optimistic update on the cached page so rapid taps don't refetch each time.
    qc.setQueryData<AppTransaction[]>(rangeKey, prev =>
      (prev ?? []).map(t => (t.id === transaction.id ? { ...t, isSplit: nextSplit } : t))
    );
    setIsTogglingSplit(transaction.id);
    try {
      await updateTransaction(transaction.id, { isSplit: nextSplit });
    } catch (error) {
      console.error("Failed to toggle split status:", error);
      qc.setQueryData<AppTransaction[]>(rangeKey, prev =>
        (prev ?? []).map(t => (t.id === transaction.id ? { ...t, isSplit: !nextSplit } : t))
      );
      toast({ title: "Update Failed", description: "Could not update the split status.", variant: "destructive" });
    } finally {
      setIsTogglingSplit(prevId => (prevId === transaction.id ? null : prevId));
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
      setSelectedTransactionIds(new Set());
      invalidate(); // Refreshes list
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

  /**
   * Rendered in a fixed-width slot so the column label stays put when the
   * arrow appears — appending a glyph to the text made headers jump on sort.
   */
  const SortIndicator = ({ column }: { column: SortableKeys }) => (
    <span className="ml-1 inline-block w-3 align-middle text-accent">
      {sortConfig.key === column ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}
    </span>
  );

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: "No Data to Export", description: "There are no transactions matching your current filters.", variant: "default"});
      return;
    }
    const headers = ["ID", "Type", "Date", "Amount (₹)", "Description", "Category/Source", "Payment Method", "Expense Type", "Is Split"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.type,
      getCalendarDateString(t.date) || format(new Date(t.date), "yyyy-MM-dd"),
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
    <div className="p-0 space-y-6 bg-background/80 backdrop-blur-sm sm:p-2 md:p-4 lg:p-6">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90 w-full", glowClass)}>
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
          <CardContent>
            <div className="mb-6 space-y-4">
              <div className="flex gap-2">
                <Input
                  type="search"
                  placeholder="Search description, category or source…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search transactions"
                  className="w-full bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground/70 text-sm md:text-base"
                />
                <Button
                  variant={selectMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectMode(v => !v)}
                  className="shrink-0 whitespace-nowrap text-xs"
                  aria-pressed={selectMode}
                >
                  <CheckSquare className="mr-1.5 h-4 w-4" />
                  {selectMode ? 'Done' : 'Select'}
                </Button>
              </div>
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
                <span>Net Total: <strong className={cn("tabular-nums", filteredSummary.netAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{formatCurrency(filteredSummary.netAmount)}</strong></span>
              </div>
              {(filterExpenseTypes.length > 0 || filterCategoryNames.length > 0 || filterMerchantId) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setFilterExpenseTypes([]); setFilterCategoryNames([]); setFilterMerchantId(null); }}
                  className="text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear KPI filter
                  {filterMerchantId && ` · ${merchantLabel(filterMerchantId)}`}
                  {filterExpenseTypes.length > 0 && ` · ${filterExpenseTypes.join(', ')}`}
                  {filterCategoryNames.length > 0 && ` · ${filterCategoryNames.join(', ')}`}
                </Button>
              )}
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
            <div className="rounded-md border border-primary/30 bg-background/50">
              {/* Mobile View - Card List */}
              <div className="md:hidden space-y-3 p-2">
                {filteredTransactions.length > 0 ? (
                  pagedTransactions.map(t => (
                    <motion.div key={t.id} variants={listItemVariants} className="p-3 border rounded-lg bg-card/80 shadow-sm space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <Checkbox
                          checked={selectedTransactionIds.has(t.id)}
                          onCheckedChange={() => toggleSelectTransaction(t.id)}
                          aria-label={`Select transaction ${t.description}`}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="line-clamp-2 text-sm font-semibold text-foreground" title={t.description}>{t.description}</p>
                          <p className="text-xs text-muted-foreground">{format(toCalendarDate(t.date) || new Date(t.date), "dd MMM, yyyy")}</p>
                        </div>
                        <p className={cn("shrink-0 text-base font-bold tabular-nums", t.type === 'income' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500')}>
                          {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pl-8">
                         <Badge variant="outline">{t.category?.name || t.source}</Badge>
                         {t.paymentMethod && <Badge variant="secondary">{t.paymentMethod.name}</Badge>}
                         {t.expenseType && <Badge variant="default" className={cn('capitalize', t.expenseType === 'need' ? 'bg-blue-500/80' : t.expenseType === 'want' ? 'bg-purple-500/80' : 'bg-indigo-500/80', 'text-white')}>{t.expenseType.replace('_expense','')}</Badge>}
                      </div>
                      <div className="flex justify-end gap-1 pt-2">
                         {t.type === 'expense' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 text-muted-foreground hover:text-accent",
                              t.isSplit && "text-yellow-400 bg-yellow-900/40 hover:bg-yellow-800/40 hover:text-yellow-300"
                            )}
                            onClick={() => handleToggleSplit(t)}
                            disabled={isTogglingSplit === t.id}
                          >
                            {isTogglingSplit === t.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Users className="h-4 w-4" />
                            )}
                          </Button>
                        )}
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
              <div className="hidden md:block">
                {/* table-fixed + explicit widths: with auto layout the browser
                    collapsed Description to ~130px and wrapped a grocery list
                    into 15 lines, making rows 300px tall while whitespace sat
                    unused to the right. */}
                <Table className="table-fixed">
                  <TableHeader className="sticky top-14 z-10 bg-card md:top-16">
                    <TableRow className="hover:bg-primary/10 border-b-primary/30">
                      {selectMode && (
                        <TableHead className="w-10 px-2">
                          <Checkbox
                            checked={filteredTransactions.length > 0 && selectedTransactionIds.size === filteredTransactions.length}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all transactions"
                            disabled={filteredTransactions.length === 0}
                          />
                        </TableHead>
                      )}
                      <TableHead onClick={() => requestSort('date')} className="w-[92px] cursor-pointer whitespace-nowrap text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Date<SortIndicator column="date" /></TableHead>
                      <TableHead onClick={() => requestSort('description')} className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Description<SortIndicator column="description" /></TableHead>
                      <TableHead onClick={() => requestSort('amount')} className="w-[120px] cursor-pointer whitespace-nowrap text-right text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Amount<SortIndicator column="amount" /></TableHead>
                      <TableHead onClick={() => requestSort('categoryName')} className="w-[130px] cursor-pointer text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Category<SortIndicator column="categoryName" /></TableHead>
                      <TableHead onClick={() => requestSort('paymentMethodName')} className="w-[140px] cursor-pointer text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Payment<SortIndicator column="paymentMethodName" /></TableHead>
                      <TableHead onClick={() => requestSort('expenseType')} className="w-[100px] cursor-pointer whitespace-nowrap text-xs font-semibold text-muted-foreground hover:text-accent sm:text-sm">Type<SortIndicator column="expenseType" /></TableHead>
                      <TableHead className="w-[60px] text-right text-xs font-semibold text-muted-foreground sm:text-sm"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <motion.tbody variants={listContainerVariants} initial="hidden" animate="visible">
                    {filteredTransactions.length > 0 ? (
                      pagedTransactions.map((transaction) => (
                        <motion.tr
                          key={transaction.id}
                          variants={listItemVariants}
                          className={cn(
                            "group border-b-primary/20 text-xs hover:bg-accent/10 sm:text-sm",
                            selectedTransactionIds.has(transaction.id) && "bg-primary/10 dark:bg-primary/20"
                          )}
                        >
                          {selectMode && (
                            <TableCell className="px-2">
                              <Checkbox
                                checked={selectedTransactionIds.has(transaction.id)}
                                onCheckedChange={() => toggleSelectTransaction(transaction.id)}
                                aria-label={`Select transaction ${transaction.description}`}
                              />
                            </TableCell>
                          )}
                          <TableCell className="whitespace-nowrap align-top text-foreground/90 tabular-nums">
                            {format(toCalendarDate(transaction.date) || new Date(transaction.date), "dd MMM yy")}
                          </TableCell>
                          <TableCell className="align-top font-medium text-foreground">
                            {/* Clamped to two lines with the full text on hover:
                                a 200-character grocery list is a detail, not a
                                reason for a 300px-tall row. */}
                            <span className="line-clamp-2" title={transaction.description}>
                              {transaction.description}
                            </span>
                            {transaction.isSplit && (
                              <Badge variant="outline" className="mt-1 h-4 border-yellow-500/40 px-1 text-[10px] font-normal text-yellow-700 dark:text-yellow-400">
                                split
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className={cn(
                            "whitespace-nowrap text-right align-top font-semibold tabular-nums",
                            transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          )}>
                            {transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
                          </TableCell>
                          <TableCell className="align-top text-foreground/90">
                            <span className="line-clamp-1" title={transaction.category?.name || transaction.source}>
                              {transaction.category?.name || transaction.source}
                            </span>
                          </TableCell>
                          <TableCell className="align-top text-foreground/90">
                            <span className="line-clamp-1" title={transaction.paymentMethod?.name}>
                              {transaction.paymentMethod?.name || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="align-top">
                            {transaction.type === 'expense' && transaction.expenseType && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0.5 text-xs capitalize border-opacity-50",
                                  transaction.expenseType === 'need' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40' :
                                  transaction.expenseType === 'want' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40' :
                                  'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/40'
                                )}
                              >
                                {transaction.expenseType.replace('_expense', '')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-right">
                            {/* Three always-on icons per row was four targets of
                                pure noise on every row. One menu, revealed on
                                hover/focus, always reachable by keyboard. */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                                  aria-label={`Actions for ${transaction.description}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onSelect={() => setEditingTransaction(transaction)}>
                                  <Edit3 className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                {transaction.type === 'expense' && (
                                  <DropdownMenuItem
                                    onSelect={() => handleToggleSplit(transaction)}
                                    disabled={isTogglingSplit === transaction.id}
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    {transaction.isSplit ? 'Unmark split' : 'Mark as split'}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(e) => { e.preventDefault(); setPendingDelete(transaction); }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={selectMode ? 8 : 7} className="py-12 text-center">
                          <p className="text-sm font-medium text-foreground">No transactions found</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Nothing matches your filters for {currentPeriodText}.
                          </p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsAddingNew(true)}>
                            <Plus className="mr-1.5 h-4 w-4" /> Add a transaction
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </motion.tbody>
                </Table>
              </div>
            </div>
            )}

            {!isLoading && filteredTransactions.length > PAGE_SIZE && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  Showing <strong className="text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</strong>
                  –<strong className="text-foreground">{Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)}</strong>
                  {' '}of <strong className="text-foreground">{filteredTransactions.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</Button>
                  <span className="text-xs sm:text-sm text-muted-foreground px-1">Page {currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {(() => {
        const isFormOpen = editingTransaction !== null || isAddingNew;
        const closeForm = () => { setEditingTransaction(null); setIsAddingNew(false); };
        const titleText = editingTransaction ? "Edit Transaction" : "New Transaction";
        const descText = editingTransaction ? "Modify the details of this transaction." : "Record a new income or expense.";
        const onSubmittedOrAdded = () => { handleTransactionUpdateOrAdd(); setIsAddingNew(false); };

        if (isMobile) {
          return (
            <Sheet open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
              <SheetContent side="bottom" className="bg-background/95 border-primary/50 h-[92vh] flex flex-col p-0 rounded-t-xl">
                <SheetHeader className="px-4 pt-4 pb-2 text-left">
                  <SheetTitle className="text-accent text-lg">{titleText}</SheetTitle>
                  <SheetDescription className="text-muted-foreground text-sm">{descText}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-6">
                  <TransactionForm
                    onTransactionAdded={onSubmittedOrAdded}
                    initialTransactionData={editingTransaction}
                    onCancel={closeForm}
                  />
                </div>
              </SheetContent>
            </Sheet>
          );
        }

        return (
          <AlertDialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
            <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg w-[90vw] max-w-lg sm:max-w-xl md:max-w-2xl rounded-lg">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-accent text-xl">{titleText}</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">{descText}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4 max-h-[70vh] overflow-y-auto pr-2">
                <TransactionForm
                  onTransactionAdded={onSubmittedOrAdded}
                  initialTransactionData={editingTransaction}
                  onCancel={closeForm}
                />
              </div>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Delete this transaction?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This permanently removes “{pendingDelete?.description}”
              {pendingDelete && ` (${formatCurrency(pendingDelete.amount)})`}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-primary/70 text-primary hover:bg-primary/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) handleDeleteSingleTransaction(pendingDelete.id); setPendingDelete(null); }}
              disabled={isDeleting}
              className="bg-red-600 text-primary-foreground hover:bg-red-700/80"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <Button
          onClick={() => setIsAddingNew(true)}
          className="h-14 w-14 rounded-full bg-accent shadow-lg hover:shadow-xl text-accent-foreground transition-shadow"
          size="icon"
          aria-label="Add Transaction"
        >
          <Plus className="h-8 w-8" />
        </Button>
      </div>
    </div>
  );
}

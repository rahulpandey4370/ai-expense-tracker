"use client";

import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, slimOnPhone } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AppTransaction, Category, PaymentMethod, ExpenseType as AppExpenseType } from '@/lib/types';
import { deleteTransaction, deleteMultipleTransactions } from '@/lib/actions/transactions';
import { deleteWithUndo } from '@/lib/undo-toast';
import { useTransactionsInRange, useCategories, usePaymentMethods, useInvalidateFinance } from '@/hooks/use-finance-queries';
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { getCalendarDateString, isSameCalendarMonth, isSameCalendarYear, toCalendarDate } from '@/lib/date-utils';
import { ArrowDownCircle, ArrowUpCircle, ArrowDownUp, Edit3, Trash2, Download, BookOpen, Loader2, Sigma, List, ShieldAlert, Filter, Users, Plus, X, MoreHorizontal, CheckSquare } from "lucide-react";
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
import { useRouter, useSearchParams } from 'next/navigation';
import { useAIModel } from '@/contexts/AIModelContext';
import { netAmount as netOfSplit } from '@/lib/split-utils';
import { downloadFile, toCsv } from '@/lib/export';

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

const glowClass = "shadow-[shadow:var(--card-glow)] dark:shadow-[shadow:var(--card-glow-dark)]";

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

  const [editingTransaction, setEditingTransaction] = useState<AppTransaction | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const isMobile = useIsMobile();
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
  // Rows deleted in the last few seconds stay hidden while their Undo toast is up.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const allTransactions = useMemo(
    () => (txQuery.data ?? []).filter(t => !hiddenIds.has(t.id)),
    [txQuery.data, hiddenIds]
  );
  const { data: allCategoriesState = [] } = useCategories();
  const { data: allPaymentMethodsState = [] } = usePaymentMethods();
  const isLoading = txQuery.isLoading;
  const invalidate = useInvalidateFinance();
  
  const searchParams = useSearchParams();
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');
  const paramType = searchParams.get('type');
  const paramExpenseType = searchParams.get('expenseType');
  const paramExpenseTypes = searchParams.get('expenseTypes'); // comma-separated multi-filter from KPI drill-downs
  const paramCategoryNames = searchParams.get('categoryNames'); // comma-separated category-name filter from KPI drill-downs
  const paramMerchant = searchParams.get('merchant'); // merchant id from the dashboard merchant tiles
  const paramPaymentMethodId = searchParams.get('paymentMethodId'); // payment method id from the dashboard card tiles
  const paramSplits = searchParams.get('splits'); // 'open' from the reimbursements KPI drill-down

  const [filterExpenseTypes, setFilterExpenseTypes] = useState<string[]>([]);
  const [filterCategoryNames, setFilterCategoryNames] = useState<string[]>([]);
  const [filterMerchantId, setFilterMerchantId] = useState<string | null>(null);

  const hasAppliedInitialParams = useRef(false);
  const { selectedModel } = useAIModel();

  // `?new=1` (from the command menu) opens the add form straight away.
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsAddingNew(true);
      router.replace('/transactions', { scroll: false });
    }
  }, [searchParams, router]);

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
      if (paramPaymentMethodId) setFilterPaymentMethodId(paramPaymentMethodId);
      if (paramSplits === 'open') setFilterSplit('split');

      if (paramMonth || paramYear || paramType || paramExpenseType || paramExpenseTypes || paramCategoryNames || paramMerchant || paramPaymentMethodId || paramSplits || searchParams.toString() === '') {
         hasAppliedInitialParams.current = true;
      }
    }
  }, [paramMonth, paramYear, paramType, paramExpenseType, paramExpenseTypes, paramCategoryNames, paramMerchant, paramPaymentMethodId, paramSplits, isLoading, handleMonthChange, handleYearChange, selectedMonth, selectedYear, searchParams]);


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
           // Same day: order by when it was logged.
           const diff = aValue.getTime() - bValue.getTime() || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
           return sortConfig.direction === 'ascending' ? diff : -diff;
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
    // Expenses count only my share — a split transaction's net total,
    // not the full amount someone else will pay me back for.
    const netAmount = filteredTransactions.reduce((acc, curr) => {
      return acc + (curr.type === 'income' ? curr.amount : -netOfSplit(curr));
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

  const setHidden = (ids: string[], hidden: boolean) =>
    setHiddenIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => (hidden ? next.add(id) : next.delete(id)));
      return next;
    });

  // No confirm dialog: the row goes now, and Undo brings it back before anything is sent.
  const handleDeleteSingleTransaction = (t: AppTransaction) =>
    deleteWithUndo({
      title: `Deleted “${t.description || 'transaction'}”`,
      hide: () => setHidden([t.id], true),
      restore: () => setHidden([t.id], false),
      commit: () => deleteTransaction(t.id),
      onCommitted: () => { invalidate(); setHidden([t.id], false); },
    });

  const handleBulkDelete = () => {
    const ids = Array.from(selectedTransactionIds);
    setSelectedTransactionIds(new Set());
    deleteWithUndo({
      title: `Deleted ${ids.length} transaction${ids.length === 1 ? '' : 's'}`,
      hide: () => setHidden(ids, true),
      restore: () => setHidden(ids, false),
      commit: async () => {
        const result = await deleteMultipleTransactions(ids);
        if (result.errorCount > 0) throw new Error(`${result.errorCount} of ${ids.length} could not be deleted.`);
      },
      onCommitted: () => { invalidate(); setHidden(ids, false); },
    });
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
    const headers = ["Date", "Type", "Amount (₹)", "My share (₹)", "Description", "Category/Source", "Payment Method", "Expense Type", "Split With", "ID"];
    const rows = filteredTransactions.map(t => [
      getCalendarDateString(t.date) || format(new Date(t.date), "yyyy-MM-dd"),
      t.type,
      t.amount.toFixed(2),
      netOfSplit(t).toFixed(2),
      t.description || '',
      t.category?.name || t.source || '',
      t.paymentMethod?.name || '',
      t.expenseType || '',
      (t.splits ?? []).map(s => s.userName).join(', '),
      t.id,
    ]);
    const period = currentPeriodText.replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '');
    downloadFile(`finwise_${period || 'transactions'}.csv`, toCsv([headers, ...rows]));
    toast({ title: "Data Exported!", description: "Your transactions have been exported to a CSV file." });
  };

  const currentPeriodText = useMemo(() => {
    if (viewMode === 'selected_month') {
      return `${monthNamesList[selectedMonth]} ${selectedYear}`;
    }
    return `Year ${selectedYear}`;
  }, [viewMode, selectedMonth, selectedYear, monthNamesList]);

  const mobileSortDirectionLabel = sortConfig.key === 'date'
    ? (sortConfig.direction === 'ascending' ? 'Oldest' : 'Newest')
    : sortConfig.key === 'amount'
      ? (sortConfig.direction === 'ascending' ? 'Low–high' : 'High–low')
      : (sortConfig.direction === 'ascending' ? 'A–Z' : 'Z–A');

  return (
    <>
    <div className="p-4 max-md:pb-24 space-y-6 bg-background/80 backdrop-blur-sm lg:p-6">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90 w-full", glowClass, slimOnPhone)}>
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
                  placeholder="Search transactions"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search transactions"
                  className="w-full bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground/70 text-base"
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
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 md:hidden">
                      <Select
                        value={sortConfig.key ?? 'date'}
                        onValueChange={(value) => setSortConfig(prev => ({
                          key: value as SortableKeys,
                          direction: prev.key === value ? prev.direction : (value === 'date' || value === 'amount' ? 'descending' : 'ascending'),
                        }))}
                      >
                        <SelectTrigger className="bg-background/70 border-primary/40 text-xs"><SelectValue placeholder="Sort by" /></SelectTrigger>
                        <SelectContent className="bg-card border-primary/60 text-foreground">
                          <SelectItem value="date" className="text-xs">Sort by date</SelectItem>
                          <SelectItem value="description" className="text-xs">Sort by description</SelectItem>
                          <SelectItem value="amount" className="text-xs">Sort by amount</SelectItem>
                          <SelectItem value="categoryName" className="text-xs">Sort by category</SelectItem>
                          <SelectItem value="paymentMethodName" className="text-xs">Sort by payment method</SelectItem>
                          <SelectItem value="expenseType" className="text-xs">Sort by expense type</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }))}
                        className="gap-1.5 text-xs"
                        aria-label={`Current order: ${mobileSortDirectionLabel}. Change sort direction.`}
                      >
                        <ArrowDownUp className="h-4 w-4" />
                        {mobileSortDirectionLabel}
                      </Button>
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
              <Button variant="outline" size="sm" onClick={exportToCSV} className="text-xs" disabled={filteredSummary.count === 0}>
                <Download className="mr-1 h-3 w-3" />
                Export these as CSV
              </Button>
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
                <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="w-full sm:w-auto">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected ({selectedTransactionIds.size})
                </Button>
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
              <div className="md:hidden divide-y divide-border/60">
                {filteredTransactions.length > 0 ? (
                  pagedTransactions.map((t, i) => {
                    // Date headings only make sense when the list is in date order.
                    const byDate = sortConfig.key === 'date';
                    const day = toCalendarDate(t.date) || new Date(t.date);
                    const prev = pagedTransactions[i - 1];
                    const showHeading = byDate && (!prev || !isSameDay(day, toCalendarDate(prev.date) || new Date(prev.date)));
                    const meta = [
                      !byDate && format(day, "d MMM"),
                      t.category?.name || t.source,
                      t.paymentMethod?.name,
                      t.type === 'expense' && t.expenseType && t.expenseType.charAt(0).toUpperCase() + t.expenseType.slice(1),
                      t.isSplit && 'split',
                    ].filter(Boolean).join(' · ');
                    const selected = selectedTransactionIds.has(t.id);
                    return (
                      <Fragment key={t.id}>
                        {showHeading && (
                          <h3 className="bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            {isToday(day) ? 'Today' : isYesterday(day) ? 'Yesterday' : format(day, "EEE, d MMM")}
                          </h3>
                        )}
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={selectMode ? `Select ${t.description}` : `Edit ${t.description}`}
                          aria-pressed={selectMode ? selected : undefined}
                          onClick={() => (selectMode ? toggleSelectTransaction(t.id) : setEditingTransaction(t))}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                            e.preventDefault();
                            if (selectMode) toggleSelectTransaction(t.id); else setEditingTransaction(t);
                          }}
                          className={cn(
                            "flex items-center gap-3 py-2.5 pl-3 pr-1 transition-colors active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            selected && "bg-primary/10 dark:bg-primary/20"
                          )}
                        >
                          {selectMode && (
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleSelectTransaction(t.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select transaction ${t.description}`}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-foreground">{t.description}</p>
                            <p className="truncate text-xs text-muted-foreground">{meta}</p>
                          </div>
                          <p className={cn("shrink-0 text-sm font-semibold tabular-nums", t.type === 'income' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500')}>
                            {t.type === 'income' ? '+' : '−'}{formatCurrency(netOfSplit(t))}
                          </p>
                          {!selectMode && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 text-muted-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Actions for ${t.description}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem onSelect={() => setEditingTransaction(t)}>
                                  <Edit3 className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => handleDeleteSingleTransaction(t)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </Fragment>
                    );
                  })
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
                  <TableHeader className="bg-card">
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
                            {transaction.type === 'income' ? '+' : '−'}{formatCurrency(netOfSplit(transaction))}
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
                                  <DropdownMenuItem onSelect={() => setEditingTransaction(transaction)}>
                                    <Users className="mr-2 h-4 w-4" />
                                    {transaction.isSplit ? 'Edit split' : 'Split this expense'}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => handleDeleteSingleTransaction(transaction)}
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
    </div>

    {/* Outside the backdrop-blur div: backdrop-filter makes that div the containing
        block for `position: fixed`, so the button scrolled away with the list. */}
    <div className="fixed bottom-[calc(var(--dock-bottom)+var(--dock-h)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] z-40 md:hidden">
        <Button
          onClick={() => setIsAddingNew(true)}
          className="h-14 w-14 rounded-full bg-accent shadow-lg hover:shadow-xl text-accent-foreground transition-shadow"
          size="icon"
          aria-label="Add Transaction"
        >
          <Plus className="h-8 w-8" />
        </Button>
      </div>
    </>
  );
}

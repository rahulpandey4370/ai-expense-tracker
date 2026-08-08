"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from "framer-motion";
import { KpiCard } from "@/components/kpi-card";
import { TransactionForm } from "@/components/transaction-form";
import { SpendingInsights } from "@/components/spending-insights";
import { RecentTransactionsList } from "@/components/recent-transactions-list";
import { FinancialChatbot } from "@/components/financial-chatbot";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { IncomeExpenseTrendChart } from "@/components/charts/income-expense-trend-chart";
import { ExpenseTypeSplitChart } from "@/components/charts/expense-type-split-chart";
import type { AppTransaction, Category, Budget, AIModel } from '@/lib/types';
import { materializeRecurringTransactions } from '@/lib/actions/recurring';
import { useTransactionsInRange, useCategories, useBudgets, useInvalidateFinance, usePaymentMethods } from '@/hooks/use-finance-queries';
import { Banknote, TrendingDown, PiggyBank, Percent, AlertTriangle, Loader2, HandCoins, Target, Landmark, LineChart, Wallet, Sigma, Plus, Eye, EyeOff, MoreVertical, Check } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { useToast } from "@/hooks/use-toast";
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { IncomeDistributionChart } from '@/components/charts/income-distribution-chart';
import { BudgetTrackerCard } from '@/components/budget-tracker-card';
import { useBudgetAlerts } from '@/hooks/use-budget-alerts';
import { Button } from '@/components/ui/button';
import { subMonths } from 'date-fns';
import { isSameCalendarMonth } from '@/lib/date-utils';
import { IncomeAllocationBar } from '@/components/income-allocation-bar';
import { OpportunityCostAnalyzer } from '@/components/opportunity-cost-analyzer';
import { MerchantSpendSection } from '@/components/merchant-spend-section';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';
import { formatCurrencyWhole, formatCurrencyCompact, formatPercent, formatDelta, percentChange } from '@/lib/format';
import { netAmount, othersShare, openReceivable } from '@/lib/split-utils';
import { CollapsibleKpiGroup } from '@/components/dashboard/collapsible-kpi-group';
import { Store, CreditCard, HeartHandshake } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAIModel } from '@/contexts/AIModelContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
    },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";
const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit", "Equity", "Debt", "Gold/Silver", "US Stocks", "Crypto"];
const cashbackAndInterestAndDividendCategoryNames = ["Cashback", "Investment Income", "Dividends"];

const BALANCES_HIDDEN_KEY = 'finwise.balancesHidden';

export default function DashboardPage() {
  const [isClient, setIsClient] = useState(false);
  // Balances are visible by default. Landing on your own finance dashboard and
  // seeing eight rows of ***** is the wrong default — privacy is a deliberate
  // action, and the choice is remembered across sessions.
  const [kpisVisible, setKpisVisible] = useState(true);
  const addTransactionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(BALANCES_HIDDEN_KEY) === 'true') setKpisVisible(false);
    } catch { /* private mode — fall back to visible */ }
  }, []);

  const toggleBalances = useCallback(() => {
    setKpisVisible(prev => {
      const next = !prev;
      try { localStorage.setItem(BALANCES_HIDDEN_KEY, String(!next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const { selectedDate, selectedMonth, selectedYear, monthNamesList } = useDateSelection();
  const { toast } = useToast();
  const { selectedModel, setSelectedModel } = useAIModel();
  const invalidate = useInvalidateFinance();

  const [formOpen, setFormOpen] = useState(false);

  const handleOpenForm = useCallback(() => {
    setFormOpen(true);
    // Let the form mount before scrolling to it, so we land on the expanded
    // card rather than the collapsed button that was there a frame ago.
    requestAnimationFrame(() => {
      addTransactionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  // The dashboard renders two distinct time regions:
  //  A) the selected month + previous month (KPIs, charts, insights comparison)
  //  B) the trailing 3 months from *today* (trend charts, anchored on today)
  // When the selection is an old month (e.g. mid-2025) these regions are far
  // apart, so we fetch them as two tight ranges instead of one contiguous window
  // spanning everything in between (which would be huge and needlessly heavy).
  const { selRange, trendRange } = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    return {
      selRange: {
        start: ymd(new Date(selectedYear, selectedMonth - 1, 1)), // previous month of selection
        end: ymd(new Date(selectedYear, selectedMonth + 1, 0)),   // end of selected month
      },
      trendRange: {
        start: ymd(new Date(today.getFullYear(), today.getMonth() - 2, 1)), // trailing 3 months
        end: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)),   // end of current month
      },
    };
  }, [selectedMonth, selectedYear]);

  const selQuery = useTransactionsInRange(selRange.start, selRange.end);
  const trendQuery = useTransactionsInRange(trendRange.start, trendRange.end);
  const transactions = useMemo(() => {
    // Merge both ranges, de-duped by id (they overlap when selection is recent).
    const selData = selQuery.data ?? [];
    const trendData = trendQuery.data ?? [];
    const byId = new Map<string, AppTransaction>();
    for (const t of [...selData, ...trendData]) byId.set(t.id, t);
    return [...byId.values()];
  }, [selQuery.data, trendQuery.data]);
  const { data: allCategories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const isLoadingData = selQuery.isLoading || trendQuery.isLoading;
  const router = useRouter();

  // Materialize any due recurring transactions once per day (client-rate-limited),
  // then refresh the cached queries so new rows appear.
  useEffect(() => {
    setIsClient(true);
    (async () => {
      try {
        const todayKey = new Date().toISOString().slice(0, 10);
        const lastRun = typeof window !== 'undefined' ? localStorage.getItem('finwise.recurringLastRun') : todayKey;
        if (lastRun !== todayKey) {
          const result = await materializeRecurringTransactions();
          if (result.inserted > 0) {
            toast({ title: "Recurring transactions added", description: `${result.inserted} due entry/entries auto-created.` });
            invalidate();
          }
          if (typeof window !== 'undefined') localStorage.setItem('finwise.recurringLastRun', todayKey);
        }
      } catch (err) {
        console.warn("Recurring materialization failed (continuing):", err);
      }
    })();
  }, [toast, invalidate]);

  const handleDataRefresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  const currentMonthTransactions = useMemo(() => {
    return transactions.filter(
      t => isSameCalendarMonth(t.date, selectedMonth, selectedYear)
    );
  }, [transactions, selectedMonth, selectedYear]);

  const monthlyMetrics = useMemo(() => {
    const income = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const needsExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.expenseType === 'need')
      .reduce((sum, t) => sum + netAmount(t), 0);

    const wantsExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense' && t.expenseType === 'want')
      .reduce((sum, t) => sum + netAmount(t), 0);

    const coreExpenses = needsExpenses + wantsExpenses;

    const totalInvestments = currentMonthTransactions
      .filter(t => t.type === 'expense' &&
                   (t.expenseType === 'investment' ||
                    (t.category && investmentCategoryNames.includes(t.category.name)))
      )
      .reduce((sum, t) => sum + netAmount(t), 0);
    
    const totalOutgoings = coreExpenses + totalInvestments;
    const availableToSaveOrInvest = income - coreExpenses; 
    const netMonthlyCashflow = income - totalOutgoings;
    const investmentPercentage = income > 0 ? (totalInvestments / income) * 100 : 0;
    const totalCashbackInterestsDividends = currentMonthTransactions
      .filter(t => t.type === 'income' && t.category && cashbackAndInterestAndDividendCategoryNames.includes(t.category.name))
      .reduce((sum, t) => sum + t.amount, 0);
    const cashSavingsPercentage = income > 0 ? (netMonthlyCashflow / income) * 100 : 0;
    const totalSavingsAndInvestmentPercentage = income > 0 ? ((income - coreExpenses) / income) * 100 : 0;

    return { 
      income,
      needsExpenses,
      wantsExpenses, 
      coreExpenses,
      totalInvestments,
      totalOutgoings,
      availableToSaveOrInvest,
      netMonthlyCashflow,
      investmentPercentage,
      totalCashbackInterestsDividends,
      cashSavingsPercentage,
      totalSavingsAndInvestmentPercentage
    };
  }, [currentMonthTransactions]);

  const previousMonthMetrics = useMemo(() => {
    const prevMonthDate = subMonths(selectedDate, 1);
    const lastMonth = prevMonthDate.getMonth();
    const yearForLastMonth = prevMonthDate.getFullYear();

    const lastMonthTransactions = transactions.filter(t =>
      isSameCalendarMonth(t.date, lastMonth, yearForLastMonth)
    );

    const lastMonthCoreExpenses = lastMonthTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want'))
        .reduce((sum, t) => sum + netAmount(t), 0) || 0;

    const lastMonthSpendingByCategory = lastMonthTransactions
        .filter(t => t.type === 'expense' && (t.expenseType === 'need' || t.expenseType === 'want') && t.category?.name)
        .reduce((acc, t) => {
            const categoryName = t.category!.name;
            acc[categoryName] = (acc[categoryName] || 0) + netAmount(t);
            return acc;
        }, {} as Record<string, number>);

    return { lastMonthCoreExpenses, lastMonthSpendingByCategory };
  }, [transactions, selectedDate]);

  // Per-card spend this month, gross (a card statement counts every charge on
  // it, mine or not) — CC Tanshu pinned first since it's the one most watched.
  const paymentMethodMonthly = useMemo(() => {
    const prevMonthDate = subMonths(selectedDate, 1);
    const lastMonth = prevMonthDate.getMonth();
    const yearForLastMonth = prevMonthDate.getFullYear();

    const totals = new Map<string, { name: string; current: number; previous: number }>();
    for (const t of currentMonthTransactions) {
      if (t.type !== 'expense' || !t.paymentMethod) continue;
      const entry = totals.get(t.paymentMethod.id) ?? { name: t.paymentMethod.name, current: 0, previous: 0 };
      entry.current += t.amount;
      totals.set(t.paymentMethod.id, entry);
    }
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.paymentMethod) continue;
      if (!isSameCalendarMonth(t.date, lastMonth, yearForLastMonth)) continue;
      const entry = totals.get(t.paymentMethod.id) ?? { name: t.paymentMethod.name, current: 0, previous: 0 };
      entry.previous += t.amount;
      totals.set(t.paymentMethod.id, entry);
    }

    const tanshu = paymentMethods.find(pm => pm.name.toLowerCase().includes('tanshu'));
    return [...totals.entries()]
      .map(([id, v]) => ({ id, ...v, change: percentChange(v.current, v.previous) }))
      .filter(v => v.current > 0)
      .sort((a, b) => (a.id === tanshu?.id ? -1 : b.id === tanshu?.id ? 1 : b.current - a.current));
  }, [currentMonthTransactions, transactions, selectedDate, paymentMethods]);

  // What others charged on my cards this month, and how much of that is still
  // unsettled across all time — the two numbers that answer "am I owed money?".
  const reimbursements = useMemo(() => {
    const spentByOthersThisMonth = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + othersShare(t), 0);
    const openThisMonth = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + openReceivable(t), 0);
    const openAllTime = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + openReceivable(t), 0);
    return { spentByOthersThisMonth, openThisMonth, openAllTime };
  }, [currentMonthTransactions, transactions]);


  const budgetData = useMemo(() => {
        return budgets.map(budget => {
            const spent = currentMonthTransactions
                .filter(t => {
                    if (budget.type === 'expenseType') return t.expenseType === budget.targetId;
                    if (budget.type === 'category') return t.category?.id === budget.targetId;
                    return false;
                })
                .reduce((sum, t) => sum + netAmount(t), 0);
            return {
                id: budget.id,
                name: budget.name,
                budgetAmount: budget.amount,
                spentAmount: spent,
            };
        });
    }, [currentMonthTransactions, budgets]);

    useBudgetAlerts(budgetData);

  if (!isClient || isLoadingData) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
        <motion.div 
          variants={sectionVariants} 
          initial="hidden" 
          animate="visible" 
          className="mb-6 space-y-4"
        >
            <IncomeAllocationBar 
                income={monthlyMetrics.income}
                needs={monthlyMetrics.needsExpenses}
                wants={monthlyMetrics.wantsExpenses}
                investments={monthlyMetrics.totalInvestments}
            />
        </motion.div>

        {/* Section bar: names the period and gives the privacy toggle a label,
            instead of an unexplained eye icon floating on its own row. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {monthNamesList[selectedMonth]} {selectedYear} at a glance
          </h2>
          <Button
            onClick={toggleBalances}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            aria-pressed={!kpisVisible}
          >
            {kpisVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {kpisVisible ? 'Hide balances' : 'Show balances'}
          </Button>
        </div>

        {/* Hero row — the three numbers that answer "how am I doing?". */}
        <motion.div
          className="grid grid-cols-2 gap-3 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Total Income"
              value={formatCurrencyWhole(monthlyMetrics.income)}
              isVisible={kpisVisible}
              icon={Banknote}
              tone="income"
              emphasis
              description="All earnings this month"
              kpiKey="totalIncome"
              insightText="Total earnings received this month from all sources."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.income}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Core Expenses"
              value={formatCurrencyWhole(monthlyMetrics.coreExpenses)}
              isVisible={kpisVisible}
              icon={TrendingDown}
              tone="expense"
              emphasis
              description="Needs & wants"
              kpiKey="coreExpenses"
              insightText="Spending on daily necessities and discretionary items. Excludes investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.coreExpenses}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="col-span-2 lg:col-span-1">
            <KpiCard
              title="Cash Savings"
              value={formatCurrencyWhole(monthlyMetrics.netMonthlyCashflow)}
              isVisible={kpisVisible}
              icon={Wallet}
              tone="savings"
              emphasis
              description={`${formatPercent(monthlyMetrics.cashSavingsPercentage)} of income kept`}
              valueClassName={monthlyMetrics.netMonthlyCashflow >= 0
                ? "text-green-600 dark:text-green-500"
                : "text-red-600 dark:text-red-500"}
              kpiKey="cashSavings"
              insightText="Actual cash left after all income and all outgoings, including investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.netMonthlyCashflow}
            />
          </motion.div>
        </motion.div>

        {/* Secondary row — supporting detail, visually subordinate. */}
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Investments"
              value={formatCurrencyWhole(monthlyMetrics.totalInvestments)}
              isVisible={kpisVisible}
              icon={Landmark}
              tone="investment"
              description="Invested this month"
              kpiKey="totalInvestmentsAmount"
              insightText="Outflows towards investment assets like stocks, mutual funds, and deposits."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.totalInvestments}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Total Outgoings"
              value={formatCurrencyWhole(monthlyMetrics.totalOutgoings)}
              isVisible={kpisVisible}
              icon={Sigma}
              tone="outgoings"
              description="Expenses + investments"
              kpiKey="totalOutgoings"
              insightText="Sum of all money leaving your accounts: daily expenses plus investments."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.totalOutgoings}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Investment Rate"
              value={formatPercent(monthlyMetrics.investmentPercentage)}
              isVisible={kpisVisible}
              icon={Target}
              tone="investment"
              description={`of ${formatCurrencyCompact(monthlyMetrics.income)} income`}
              kpiKey="investmentRate"
              insightText="Share of total income allocated to investments this month."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiCard
              title="Saved + Invested"
              value={formatPercent(monthlyMetrics.totalSavingsAndInvestmentPercentage)}
              isVisible={kpisVisible}
              icon={Percent}
              tone="savings"
              description="of income retained"
              kpiKey="savingsPercentage"
              insightText="Share of income not consumed by needs and wants — cash saved plus money invested."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="col-span-2 sm:col-span-1">
            <KpiCard
              title="Cashback & Interest"
              value={formatCurrencyWhole(monthlyMetrics.totalCashbackInterestsDividends)}
              isVisible={kpisVisible}
              icon={HandCoins}
              tone="rewards"
              description="Rewards, interest, dividends"
              kpiKey="cashbackInterests"
              insightText="Extra income from card rewards, bank interest, and dividends."
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              numericValue={monthlyMetrics.totalCashbackInterestsDividends}
            />
          </motion.div>
        </motion.div>

        {/* Secondary KPI groups — collapsed by default, right under the main
            numbers rather than buried at the bottom of the page. */}
        <div className="space-y-3">
          <CollapsibleKpiGroup id="merchants" title="Where your money went" icon={<Store className="h-4 w-4 text-accent" />}>
            <MerchantSpendSection
              transactions={transactions}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              selectedMonthName={monthNamesList[selectedMonth]}
              isVisible={kpisVisible}
              bare
            />
          </CollapsibleKpiGroup>

          <CollapsibleKpiGroup
            id="payment-methods"
            title="Cards & Payment Methods"
            icon={<CreditCard className="h-4 w-4 text-accent" />}
            badge={paymentMethodMonthly.length || undefined}
          >
            {paymentMethodMonthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No card or payment method activity this month.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {paymentMethodMonthly.map(pm => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => router.push(`/transactions?month=${selectedMonth}&year=${selectedYear}&type=expense&paymentMethodId=${pm.id}`)}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                  >
                    <span className="truncate text-xs font-medium text-muted-foreground" title={pm.name}>{pm.name}</span>
                    <span className="text-base font-semibold tabular-nums text-foreground sm:text-lg">
                      {kpisVisible ? formatCurrencyCompact(pm.current) : '•••••'}
                    </span>
                    {kpisVisible && pm.change !== null && (
                      <span className={cn("text-[11px]", pm.change > 0 ? "text-red-500" : pm.change < 0 ? "text-green-500" : "text-muted-foreground")}>
                        {formatDelta(pm.change)} vs last month
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CollapsibleKpiGroup>

          <CollapsibleKpiGroup id="reimbursements" title="Reimbursements" icon={<HeartHandshake className="h-4 w-4 text-accent" />}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push('/split-expenses')}
                className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              >
                <span className="text-xs font-medium text-muted-foreground">Spent by others on my card this month</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {kpisVisible ? formatCurrencyWhole(reimbursements.spentByOthersThisMonth) : '•••••'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {kpisVisible ? `${formatCurrencyWhole(reimbursements.openThisMonth)} still unsettled` : ' '}
                </span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/split-expenses')}
                className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              >
                <span className="text-xs font-medium text-muted-foreground">Total open receivables</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {kpisVisible ? formatCurrencyWhole(reimbursements.openAllTime) : '•••••'}
                </span>
                <span className="text-[11px] text-muted-foreground">Across all unsettled splits</span>
              </button>
            </div>
          </CollapsibleKpiGroup>
        </div>

         {(kpisVisible && monthlyMetrics.totalOutgoings > monthlyMetrics.income) && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Alert 
              variant="destructive" 
              className={cn(
                "shadow-md border-destructive/50 bg-red-500/10 dark:bg-destructive/20", 
                glowClass
              )}
            >
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <AlertTitle className="text-red-700 dark:text-red-300">Spending Alert!</AlertTitle>
              <AlertDescription className="text-red-600 dark:text-red-400">
                Your total outgoings (core expenses + investments) exceeded your income in {monthNamesList[selectedMonth]} {selectedYear}.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
        
        {kpisVisible && (
            <motion.div variants={sectionVariants} initial="hidden" animate="visible">
                <BudgetTrackerCard budgets={budgetData} />
            </motion.div>
        )}

        {/* The add-transaction form used to sit permanently expanded in the
            middle of the dashboard, costing ~450px of prime space even when
            you only came to read your numbers. It is collapsed by default now
            and opens in place (or as a sheet from the mobile FAB). */}
        <div ref={addTransactionRef} className="scroll-mt-20">
          {formOpen ? (
            <Card className="bg-card/80">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-semibold text-primary">Add a transaction</span>
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} className="h-7 text-xs">
                  Close
                </Button>
              </div>
              <TransactionForm onTransactionAdded={() => { handleDataRefresh(); setFormOpen(false); }} />
            </Card>
          ) : (
            <Button
              variant="outline"
              onClick={() => setFormOpen(true)}
              className="h-12 w-full justify-center gap-2 border-dashed text-sm text-muted-foreground hover:border-accent/50 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add income or expense
            </Button>
          )}
        </div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <SpendingInsights
              currentMonthTransactions={currentMonthTransactions}
              currentMonthCoreSpending={monthlyMetrics.coreExpenses}
              currentMonthInvestmentSpending={monthlyMetrics.totalInvestments}
              lastMonthCoreSpending={previousMonthMetrics.lastMonthCoreExpenses}
              lastMonthSpendingByCategory={previousMonthMetrics.lastMonthSpendingByCategory}
              selectedMonthName={monthNamesList[selectedMonth]}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <FinancialChatbot />
          </motion.div>
        </motion.div>

        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <RecentTransactionsList 
            transactions={currentMonthTransactions} 
            count={15} 
            onDataChange={handleDataRefresh} 
          />
        </motion.div>

        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <OpportunityCostAnalyzer averageMonthlyIncome={monthlyMetrics.income > 0 ? monthlyMetrics.income : undefined} />
        </motion.div>
        
        {/* Two 3-slice donuts stacked full-width cost ~1000px of scroll for
            very little information. Side by side on anything wider than a
            phone. */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <IncomeDistributionChart
              transactions={currentMonthTransactions}
              selectedMonthName={monthNamesList[selectedMonth]}
              selectedYear={selectedYear}
              chartHeightClass="max-h-[320px] min-h-[280px]"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <ExpenseTypeSplitChart 
              transactions={currentMonthTransactions} 
              selectedMonthName={monthNamesList[selectedMonth]} 
              selectedYear={selectedYear}
              chartHeightClass="max-h-[320px] min-h-[280px]"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <MonthlySpendingTrendChart transactions={transactions} numberOfMonths={3} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <IncomeExpenseTrendChart transactions={transactions} numberOfMonths={3} />
          </motion.div>
        </motion.div>
      </main>
      
      {/* Sits above the mobile bottom nav rather than on top of it. */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <Button 
          onClick={handleOpenForm}
          className="h-14 w-14 rounded-full bg-accent text-accent-foreground shadow-lg transition-shadow hover:shadow-xl"
          size="icon"
          aria-label="Add transaction"
        >
          <Plus className="h-7 w-7" />
        </Button>
      </div>
    </>
  );
}

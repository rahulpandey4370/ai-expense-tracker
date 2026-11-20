
"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { AppTransaction } from "@/lib/types";
import { format } from "date-fns";
import { toCalendarDate } from "@/lib/date-utils";
import { ArrowDownCircle, ArrowUpCircle, ListChecks, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { netAmount } from '@/lib/split-utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

interface RecentTransactionsListProps {
  transactions: AppTransaction[];
  count?: number;
  onDataChange?: () => void; // Callback to refresh parent data
}

const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, x: -15 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 110 } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function RecentTransactionsList({ transactions, count = 5, onDataChange }: RecentTransactionsListProps) {
  const [selected, setSelected] = useState<AppTransaction | null>(null);
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, count);

  if (recentTransactions.length === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><ListChecks className="h-6 w-6 text-primary"/>Recent Transactions</CardTitle>
          <CardDescription>Your latest financial activities.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No transactions recorded yet.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <motion.div initial="hidden" animate="visible" variants={{visible: {transition: {delayChildren: 0.2}}}}>
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><ListChecks className="h-6 w-6 text-primary"/>Recent Transactions</CardTitle>
          <CardDescription>Your latest financial activities.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <motion.div 
              className="space-y-4 pr-3"
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {recentTransactions.map((transaction, index) => (
                <motion.div key={transaction.id} variants={listItemVariants}>
                  <button
                    type="button"
                    onClick={() => setSelected(transaction)}
                    aria-label={`Details for ${transaction.description}`}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {transaction.type === 'income' ? (
                        <ArrowUpCircle className="h-6 w-6 shrink-0 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-6 w-6 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                           <p className="line-clamp-2 font-medium text-sm text-foreground">{transaction.description}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(toCalendarDate(transaction.date) || new Date(transaction.date), "MMM d, yyyy")}
                          {transaction.type === 'expense' && transaction.category && ` • ${transaction.category.name}`} 
                          {transaction.type === 'income' && transaction.source && ` • ${transaction.source}`}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn(
                        "whitespace-nowrap font-semibold text-sm",
                        transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {transaction.type === 'income' ? '+' : '-'} {formatCurrency(netAmount(transaction))}
                      </p>
                       <div className="flex justify-end items-center mt-1">
                        {transaction.type === 'expense' && transaction.isSplit && (
                          <Badge
                            variant="outline"
                            className="h-7 gap-1 border-yellow-800/40 bg-yellow-900/20 px-1.5 text-yellow-400"
                            title="This expense is split"
                          >
                            <Users className="h-3.5 w-3.5" />
                          </Badge>
                        )}
                        {transaction.type === 'expense' && transaction.expenseType && (
                          <Badge variant={
                            transaction.expenseType === 'need' ? 'default' : 
                            transaction.expenseType === 'want' ? 'secondary' : 
                            'outline'
                          } className="text-xs ml-2 capitalize">
                            {transaction.expenseType.replace('_expense', '')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                  {index < recentTransactions.length - 1 && <Separator className="my-3" />}
                </motion.div>
              ))}
            </motion.div>
          </ScrollArea>
        </CardContent>
      </Card>
      <TransactionDetails transaction={selected} onClose={() => setSelected(null)} />
    </motion.div>
  );
}

/** Read-only view of one transaction: a bottom sheet on phones, a dialog on desktop. */
function TransactionDetails({ transaction: t, onClose }: { transaction: AppTransaction | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const open = t !== null;
  const onOpenChange = (o: boolean) => { if (!o) onClose(); };
  const title = t?.type === 'income' ? 'Income details' : 'Expense details';

  const body = t && (
    <div className="space-y-4">
      <div>
        <p className={cn("text-3xl font-bold tabular-nums", t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {t.type === 'income' ? '+' : '−'}{formatCurrency(netAmount(t))}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-base text-foreground">{t.description}</p>
      </div>
      <dl className="divide-y rounded-lg border text-sm">
        <DetailRow label="Date">{format(toCalendarDate(t.date) || new Date(t.date), "EEE, d MMM yyyy")}</DetailRow>
        {t.type === 'expense'
          ? <DetailRow label="Category">{t.category?.name}</DetailRow>
          : <DetailRow label="Source">{t.source || t.category?.name}</DetailRow>}
        <DetailRow label="Paid with">{t.paymentMethod?.name}</DetailRow>
        {t.type === 'expense' && t.expenseType && <DetailRow label="Type"><span className="capitalize">{t.expenseType}</span></DetailRow>}
        {t.isSplit && (
          <>
            <DetailRow label="Total bill">{formatCurrency(t.amount)}</DetailRow>
            <DetailRow label="Your share">{formatCurrency(netAmount(t))}</DetailRow>
            <DetailRow label="Paid by">{t.paidBy?.name ?? 'You'}</DetailRow>
            {(t.splits ?? []).map(s => (
              <DetailRow key={s.userId} label={s.userName}>
                {formatCurrency(s.shareAmount)}
                <Badge variant="outline" className={cn("ml-2 text-[11px] font-normal", s.isSettled ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
                  {s.isSettled ? 'Settled' : 'Pending'}
                </Badge>
              </DetailRow>
            ))}
          </>
        )}
        <DetailRow label="Added">{format(new Date(t.createdAt), "d MMM yyyy, h:mm a")}</DetailRow>
      </dl>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="sr-only">Full details of this transaction.</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Full details of this transaction.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground break-words">{children}</dd>
    </div>
  );
}

    

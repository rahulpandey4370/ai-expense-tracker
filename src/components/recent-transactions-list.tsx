
"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/lib/types";
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentTransactionsListProps {
  transactions: Transaction[];
  count?: number;
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

export function RecentTransactionsList({ transactions, count = 5 }: RecentTransactionsListProps) {
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
              className="space-y-4"
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {recentTransactions.map((transaction, index) => (
                <motion.div key={transaction.id} variants={listItemVariants}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {transaction.type === 'income' ? (
                        <ArrowUpCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-6 w-6 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium text-sm text-foreground">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.date), "MMM d, yyyy")}
                          {transaction.type === 'expense' && transaction.category && ` • ${transaction.category}`}
                          {transaction.type === 'income' && transaction.source && ` • ${transaction.source}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-semibold text-sm",
                        transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {transaction.type === 'income' ? '+' : '-'} ₹{transaction.amount.toFixed(2)}
                      </p>
                      {transaction.type === 'expense' && transaction.expenseType && (
                        <Badge variant={
                          transaction.expenseType === 'need' ? 'default' : 
                          transaction.expenseType === 'want' ? 'secondary' : 
                          'outline'
                        } className="text-xs mt-1 capitalize">
                          {transaction.expenseType.replace('_expense', '')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {index < recentTransactions.length - 1 && <Separator className="my-3" />}
                </motion.div>
              ))}
            </motion.div>
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}

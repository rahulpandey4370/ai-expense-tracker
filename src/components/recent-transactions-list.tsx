
"use client";

import { useState } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { AppTransaction } from "@/lib/types";
import { format } from "date-fns";
import { toCalendarDate } from "@/lib/date-utils";
import { ArrowDownCircle, ArrowUpCircle, ListChecks, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { updateTransaction } from '@/lib/actions/transactions';
import { useToast } from '@/hooks/use-toast';

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
  const [isTogglingSplit, setIsTogglingSplit] = useState<string | null>(null);
  const { toast } = useToast();

  const handleToggleSplit = async (transaction: AppTransaction) => {
    setIsTogglingSplit(transaction.id);
    try {
      await updateTransaction(transaction.id, { isSplit: !transaction.isSplit });
      toast({
        title: `Transaction ${!transaction.isSplit ? 'marked' : 'unmarked'} as split.`,
      });
      onDataChange?.(); // Trigger data refresh
    } catch (error) {
      console.error("Failed to toggle split status:", error);
      toast({ title: "Update Failed", description: "Could not update the split status.", variant: "destructive" });
    } finally {
      setIsTogglingSplit(null);
    }
  };

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
                        <div className="flex items-center gap-2">
                           <p className="font-medium text-sm text-foreground">{transaction.description}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(toCalendarDate(transaction.date) || new Date(transaction.date), "MMM d, yyyy")}
                          {transaction.type === 'expense' && transaction.category && ` • ${transaction.category.name}`} 
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
                       <div className="flex justify-end items-center mt-1">
                        {transaction.type === 'expense' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 text-muted-foreground hover:text-accent",
                              transaction.isSplit && "text-yellow-400 bg-yellow-900/40 hover:bg-yellow-800/40 hover:text-yellow-300"
                            )}
                            onClick={() => handleToggleSplit(transaction)}
                            disabled={isTogglingSplit === transaction.id}
                          >
                            {isTogglingSplit === transaction.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Users className="h-4 w-4" />
                            )}
                            <span className="sr-only">Toggle Split Status</span>
                          </Button>
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

    

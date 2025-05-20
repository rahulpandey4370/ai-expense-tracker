
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/lib/types";
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, ListChecks } from "lucide-react";

interface RecentTransactionsListProps {
  transactions: Transaction[];
  count?: number;
}

export function RecentTransactionsList({ transactions, count = 5 }: RecentTransactionsListProps) {
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count);

  if (recentTransactions.length === 0) {
    return (
      <Card className="shadow-lg">
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
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><ListChecks className="h-6 w-6 text-primary"/>Recent Transactions</CardTitle>
        <CardDescription>Your latest financial activities.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-4">
            {recentTransactions.map((transaction, index) => (
              <div key={transaction.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {transaction.type === 'income' ? (
                      <ArrowUpCircle className="h-6 w-6 text-green-500" />
                    ) : (
                      <ArrowDownCircle className="h-6 w-6 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(transaction.date), "MMM d, yyyy")}
                        {transaction.type === 'expense' && transaction.category && ` • ${transaction.category}`}
                        {transaction.type === 'income' && transaction.source && ` • ${transaction.source}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
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
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

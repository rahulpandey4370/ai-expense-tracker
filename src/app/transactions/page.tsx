
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Transaction, TransactionEnumType, ExpenseEnumType } from '@/lib/types';
import { initialTransactions, expenseCategories, incomeCategories, paymentMethods } from '@/lib/data'; // Assuming initialTransactions are all transactions
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Filter, Edit3, Trash2, Download } from "lucide-react";
import { useDateSelection } from '@/contexts/DateSelectionContext';
import { Badge } from '@/components/ui/badge';
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
import { TransactionForm } from '@/components/transaction-form'; // Re-use for editing
import { useToast } from "@/hooks/use-toast";

export default function TransactionsPage() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>(initialTransactions);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>(initialTransactions);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<TransactionEnumType | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction | null; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const { toast } = useToast();
  const { selectedMonth, selectedYear, monthNamesList } = useDateSelection(); // To show current context if needed

  useEffect(() => {
    let tempTransactions = [...allTransactions];

    if (searchTerm) {
      tempTransactions = tempTransactions.filter(t =>
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.source && t.source.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterType !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.type === filterType);
    }

    if (filterCategory !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.category === filterCategory || t.source === filterCategory);
    }

    if (filterPaymentMethod !== 'all') {
      tempTransactions = tempTransactions.filter(t => t.paymentMethod === filterPaymentMethod);
    }
    
    if (sortConfig.key) {
      tempTransactions.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue === undefined || bValue === undefined) return 0;


        if (sortConfig.key === 'date') {
           return sortConfig.direction === 'ascending' ? (aValue as Date).getTime() - (bValue as Date).getTime() : (bValue as Date).getTime() - (aValue as Date).getTime();
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
  }, [allTransactions, searchTerm, filterType, filterCategory, filterPaymentMethod, sortConfig]);

  const handleAddTransaction = (newTransaction: Transaction) => {
    setAllTransactions(prev => [newTransaction, ...prev]);
    toast({ title: "Transaction Added", description: `Successfully added "${newTransaction.description}".` });
  };

  const handleEditTransaction = (updatedTransaction: Transaction) => {
    setAllTransactions(prev => prev.map(t => t.id === updatedTransaction.id ? updatedTransaction : t));
    setEditingTransaction(null); // Close edit modal
    toast({ title: "Transaction Updated", description: `Successfully updated "${updatedTransaction.description}".` });
  };

  const handleDeleteTransaction = (transactionId: string) => {
    setAllTransactions(prev => prev.filter(t => t.id !== transactionId));
    toast({ title: "Transaction Deleted", description: "Transaction removed.", variant: "destructive" });
  };
  
  const requestSort = (key: keyof Transaction) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof Transaction) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return '';
  };
  
  const allCategories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    expenseCategories.forEach(cat => uniqueCategories.add(cat.name));
    incomeCategories.forEach(cat => uniqueCategories.add(cat.name));
    return Array.from(uniqueCategories).sort();
  }, []);

  const exportToCSV = () => {
    const headers = ["ID", "Type", "Date", "Amount (INR)", "Description", "Category/Source", "Payment Method", "Expense Type"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.type,
      format(t.date, "yyyy-MM-dd"),
      t.amount.toFixed(2),
      `"${t.description.replace(/"/g, '""')}"`, // Escape double quotes
      t.type === 'expense' ? t.category || '' : t.source || '',
      t.paymentMethod || '',
      t.expenseType || ''
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Transactions exported to CSV." });
  };


  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <Card className="shadow-xl border-primary/20 border-2 rounded-xl bg-card/80">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-yellow-500 transform -rotate-12">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM8.547 4.505a8.25 8.25 0 1 0 0 14.99c.166.085.337.162.513.229a8.25 8.25 0 0 0 5.88-15.448 8.183 8.183 0 0 0-.513-.229Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M12.75 6a.75.75 0 0 0-1.5 0v6.19L8.03 9.07a.75.75 0 0 0-1.06 1.06L10.94 14l-3.97 3.87a.75.75 0 0 0 1.06 1.06L11.25 15.81V18a.75.75 0 0 0 1.5 0V6Z" clipRule="evenodd" />
              <path d="M15.94 14.132a.75.75 0 0 1-1.334-.667V8.667a.75.75 0 0 1 1.334-.667v6.132Z" />
            </svg>
             Manage Your Galleons (Transactions)
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            Keep a keen eye on all your financial charms and curses. Filters available below the search bar.
            Currently viewing data for: {monthNamesList[selectedMonth]} {selectedYear}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            <Input
              type="text"
              placeholder="Search transactions (e.g., 'Potion ingredients', 'Owl Post')"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"
            />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as TransactionEnumType | 'all')}>
                <SelectTrigger className="bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="income">Income (Galleons In)</SelectItem>
                  <SelectItem value="expense">Expense (Galleons Out)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"><SelectValue placeholder="Filter by Category/Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories/Sources</SelectItem>
                  {allCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                <SelectTrigger className="bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"><SelectValue placeholder="Filter by Payment Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Methods</SelectItem>
                  {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={exportToCSV} variant="outline" className="bg-yellow-500/20 border-yellow-600 hover:bg-yellow-500/30 text-yellow-700">
                <Download className="mr-2 h-4 w-4" />
                Export to Parchment (CSV)
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[500px] rounded-md border border-primary/20 p-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-primary/5">
                  <TableHead onClick={() => requestSort('date')} className="cursor-pointer text-primary/80 hover:text-primary">Date{getSortIndicator('date')}</TableHead>
                  <TableHead onClick={() => requestSort('description')} className="cursor-pointer text-primary/80 hover:text-primary">Description{getSortIndicator('description')}</TableHead>
                  <TableHead onClick={() => requestSort('type')} className="cursor-pointer text-primary/80 hover:text-primary">Type{getSortIndicator('type')}</TableHead>
                  <TableHead onClick={() => requestSort('amount')} className="text-right cursor-pointer text-primary/80 hover:text-primary">Amount (₹){getSortIndicator('amount')}</TableHead>
                  <TableHead onClick={() => requestSort('category')} className="cursor-pointer text-primary/80 hover:text-primary">Category/Source{getSortIndicator('category')}</TableHead>
                  <TableHead onClick={() => requestSort('paymentMethod')} className="cursor-pointer text-primary/80 hover:text-primary">Payment Method{getSortIndicator('paymentMethod')}</TableHead>
                  <TableHead onClick={() => requestSort('expenseType')} className="cursor-pointer text-primary/80 hover:text-primary">Expense Type{getSortIndicator('expenseType')}</TableHead>
                  <TableHead className="text-primary/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id} className="hover:bg-accent/10">
                      <TableCell>{format(transaction.date, "dd MMM, yyyy")}</TableCell>
                      <TableCell className="font-medium">{transaction.description}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'} 
                               className={transaction.type === 'income' ? 'bg-green-600/20 text-green-700 border-green-600/50 hover:bg-green-600/30' : 'bg-red-600/20 text-red-700 border-red-600/50 hover:bg-red-600/30'}>
                          {transaction.type === 'income' ? <ArrowUpCircle className="mr-1 h-3 w-3" /> : <ArrowDownCircle className="mr-1 h-3 w-3" />}
                          {transaction.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {transaction.type === 'income' ? '+' : '-'}₹{transaction.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{transaction.type === 'expense' ? transaction.category : transaction.source}</TableCell>
                      <TableCell>{transaction.paymentMethod || 'N/A'}</TableCell>
                      <TableCell>
                        {transaction.type === 'expense' && transaction.expenseType && (
                          <Badge 
                            variant={transaction.expenseType === 'need' ? 'default' : transaction.expenseType === 'want' ? 'secondary' : 'outline'}
                            className={`capitalize ${
                              transaction.expenseType === 'need' ? 'bg-blue-600/20 text-blue-700 border-blue-600/50' :
                              transaction.expenseType === 'want' ? 'bg-purple-600/20 text-purple-700 border-purple-600/50' :
                              'bg-gray-600/20 text-gray-700 border-gray-600/50'
                            }`}
                          >
                            {transaction.expenseType.replace('_expense', '')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditingTransaction(transaction)} className="text-yellow-600 hover:text-yellow-500 hover:bg-yellow-500/10">
                          <Edit3 className="h-4 w-4" />
                           <span className="sr-only">Edit Spell (Transaction)</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-500 hover:bg-red-500/10">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Banish Spell (Delete Transaction)</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background/90 border-primary/30">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-primary">Are you sure you want to banish this transaction?</AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground/80">
                                This action cannot be undone. This will permanently remove the transaction: "{transaction.description}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-primary/50 hover:bg-primary/10">Nevermind (Cancel)</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteTransaction(transaction.id)} className="bg-destructive hover:bg-destructive/80 text-destructive-foreground">
                                Banish! (Delete)
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground/70 py-10">
                      No transactions found. Perhaps the Nifflers took them? Or try adjusting your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
      
      {/* Add New Transaction and Edit Transaction Modals */}
      <AlertDialog open={editingTransaction !== null} onOpenChange={(isOpen) => !isOpen && setEditingTransaction(null)}>
          <AlertDialogContent className="bg-background/90 border-primary/30 sm:max-w-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-primary text-xl">
                    {editingTransaction ? "Revise Your Spell (Edit Transaction)" : "Cast a New Spell (Add Transaction)"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground/80">
                    {editingTransaction ? "Modify the details of this financial enchantment." : "Record a new income or expense charm."}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              {/* The TransactionForm will be conditionally rendered here or its content integrated */}
              {/* For simplicity, we'll assume TransactionForm can handle an initialData prop for editing */}
              <div className="py-4">
                 {/* A simplified version: if editingTransaction, show a form prefilled with its data */}
                 {/* In a real app, TransactionForm would take `initialData={editingTransaction}` and `onSubmit={handleEditTransaction}` */}
                <TransactionForm 
                  onAddTransaction={editingTransaction ? handleEditTransaction : handleAddTransaction} 
                  // @ts-ignore - This is a simplified example, a real form would handle initial data
                  initialTransactionData={editingTransaction} 
                  onCancel={() => setEditingTransaction(null)}
                />
              </div>
              {/* Footer with cancel can be part of TransactionForm or managed here */}
          </AlertDialogContent>
      </AlertDialog>


    </main>
  );
}

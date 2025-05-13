
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Transaction, TransactionEnumType, ExpenseEnumType } from '@/lib/types';
import { initialTransactions, expenseCategories, incomeCategories, paymentMethods } from '@/lib/data'; 
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Filter, Edit3, Trash2, Download, ListFilter } from "lucide-react";
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
import { TransactionForm } from '@/components/transaction-form';
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
  const { selectedMonth, selectedYear, monthNamesList } = useDateSelection(); 

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
    setEditingTransaction(null); 
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
      `"${t.description.replace(/"/g, '""')}"`, 
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
             <ListFilter className="w-8 h-8 text-primary transform -rotate-6"/>
             Manage Transactions
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            View and manage all your financial transactions. Filters available below.
            Currently viewing data for: {monthNamesList[selectedMonth]} {selectedYear}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            <Input
              type="text"
              placeholder="Search transactions (e.g., 'Groceries', 'Salary')"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"
            />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as TransactionEnumType | 'all')}>
                <SelectTrigger className="bg-background/70 border-primary/30 focus:border-accent focus:ring-accent"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
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
              <Button onClick={exportToCSV} variant="outline" className="bg-primary/10 border-primary/50 hover:bg-primary/20 text-primary">
                <Download className="mr-2 h-4 w-4" />
                Export to CSV
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
                           <span className="sr-only">Edit Transaction</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-500 hover:bg-red-500/10">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete Transaction</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background/90 border-primary/30">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-primary">Are you sure you want to delete this transaction?</AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground/80">
                                This action cannot be undone. This will permanently remove the transaction: "{transaction.description}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-primary/50 hover:bg-primary/10">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteTransaction(transaction.id)} className="bg-destructive hover:bg-destructive/80 text-destructive-foreground">
                                Delete
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
                      No transactions found. Try adjusting your filters or adding new transactions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
      
      <AlertDialog open={editingTransaction !== null} onOpenChange={(isOpen) => !isOpen && setEditingTransaction(null)}>
          <AlertDialogContent className="bg-background/90 border-primary/30 sm:max-w-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-primary text-xl">
                    {editingTransaction ? "Edit Transaction" : "Add Transaction"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground/80">
                    {editingTransaction ? "Modify the details of this transaction." : "Record a new income or expense."}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <TransactionForm 
                  onAddTransaction={editingTransaction ? handleEditTransaction : handleAddTransaction} 
                  initialTransactionData={editingTransaction} 
                  onCancel={() => setEditingTransaction(null)}
                />
              </div>
          </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}


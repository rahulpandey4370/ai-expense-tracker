
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppTransaction, Category, PaymentMethod } from '@/lib/types'; // Using AppTransaction
import { getTransactions, deleteTransaction, getCategories, getPaymentMethods } from '@/lib/actions/transactions';
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Edit3, Trash2, Download, BookOpen, Loader2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { TransactionForm } from '@/components/transaction-form';
import { useToast } from "@/hooks/use-toast";

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const tableContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const tableRowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 120 } },
};

export default function TransactionsPage() {
  const [allTransactions, setAllTransactions] = useState<AppTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<AppTransaction[]>([]);
  const [allCategories, setAllCategoriesState] = useState<Category[]>([]); // Renamed to avoid conflict
  const [allPaymentMethodsState, setAllPaymentMethodsState] = useState<PaymentMethod[]>([]); // Renamed
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | 'all'>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string | 'all'>('all');
  const [filterPaymentMethodId, setFilterPaymentMethodId] = useState<string | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof AppTransaction | 'categoryName' | 'paymentMethodName' | null; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  
  const [editingTransaction, setEditingTransaction] = useState<AppTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  // useDateSelection is not used here, so it can be removed if not needed elsewhere on this page.

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedTransactions, fetchedCategories, fetchedPaymentMethods] = await Promise.all([
        getTransactions(),
        getCategories(),
        getPaymentMethods()
      ]);
      setAllTransactions(fetchedTransactions.map(t => ({...t, date: new Date(t.date)})));
      setAllCategoriesState(fetchedCategories); // Use renamed state setter
      setAllPaymentMethodsState(fetchedPaymentMethods); // Use renamed state setter
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
      toast({ title: "Error Fetching Data", description: "Could not load initial transaction data, categories, or payment methods. Please try again.", variant: "destructive"});
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

    if (filterCategoryId !== 'all') {
      // Assuming AppTransaction has category.id
      tempTransactions = tempTransactions.filter(t => t.category?.id === filterCategoryId);
    }

    if (filterPaymentMethodId !== 'all') {
       // Assuming AppTransaction has paymentMethod.id
      tempTransactions = tempTransactions.filter(t => t.paymentMethod?.id === filterPaymentMethodId);
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
  }, [allTransactions, searchTerm, filterType, filterCategoryId, filterPaymentMethodId, sortConfig]);


  const handleTransactionUpdateOrAdd = () => {
    fetchData(); 
    setEditingTransaction(null); 
  };

  const handleDeleteTransaction = async (transactionId: string) => {
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
  
  const requestSort = (key: keyof AppTransaction | 'categoryName' | 'paymentMethodName') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof AppTransaction | 'categoryName' | 'paymentMethodName') => {
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
    const headers = ["ID", "Type", "Date", "Amount (₹)", "Description", "Category/Source", "Payment Method", "Expense Type"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.type,
      format(new Date(t.date), "yyyy-MM-dd"),
      t.amount.toFixed(2),
      `"${(t.description || '').replace(/"/g, '""')}"`, 
      t.category?.name || t.source || '',
      t.paymentMethod?.name || '',
      t.expenseType || ''
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rahuls_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Data Exported!", description: "Your transactions have been exported to a CSV file." });
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className="shadow-xl border-primary/30 border-2 rounded-xl bg-card/90">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
              <BookOpen className="w-8 h-8 text-accent transform -rotate-6"/>
              Manage Transactions
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              View and manage all your financial entries. Filters available below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 space-y-4">
              <Input
                type="text"
                placeholder="Search transactions (e.g., 'Groceries', 'Salary')"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground/70"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Select value={filterType} onValueChange={(value) => setFilterType(value as string | 'all')}>
                  <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                  <SelectContent className="bg-card border-primary/60 text-foreground">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                  <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground"><SelectValue placeholder="Filter by Category/Source" /></SelectTrigger>
                  <SelectContent className="bg-card border-primary/60 text-foreground">
                    <SelectItem value="all">All Categories/Sources</SelectItem>
                    {allCategoriesState.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPaymentMethodId} onValueChange={setFilterPaymentMethodId}>
                  <SelectTrigger className="bg-background/70 border-primary/40 focus:border-accent focus:ring-accent text-foreground"><SelectValue placeholder="Filter by Payment Method" /></SelectTrigger>
                  <SelectContent className="bg-card border-primary/60 text-foreground">
                    <SelectItem value="all">All Payment Methods</SelectItem>
                    {allPaymentMethodsState.map(pm => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={exportToCSV} variant="outline" className="w-full bg-accent/20 border-accent/50 hover:bg-accent/30 text-accent-foreground">
                    <Download className="mr-2 h-4 w-4" />
                    Export to CSV
                  </Button>
                </motion.div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-[400px]">
                <Loader2 className="h-12 w-12 text-accent animate-spin" />
                <p className="ml-4 text-primary">Loading transactions...</p>
              </div>
            ) : (
            <ScrollArea className="h-[500px] rounded-md border border-primary/30 p-1 bg-background/50">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-primary/10 border-b-primary/30">
                    <TableHead onClick={() => requestSort('date')} className="cursor-pointer text-primary/80 hover:text-accent">Date{getSortIndicator('date')}</TableHead>
                    <TableHead onClick={() => requestSort('description')} className="cursor-pointer text-primary/80 hover:text-accent">Description{getSortIndicator('description')}</TableHead>
                    <TableHead onClick={() => requestSort('type')} className="cursor-pointer text-primary/80 hover:text-accent">Type{getSortIndicator('type')}</TableHead>
                    <TableHead onClick={() => requestSort('amount')} className="text-right cursor-pointer text-primary/80 hover:text-accent">Amount (₹){getSortIndicator('amount')}</TableHead>
                    <TableHead onClick={() => requestSort('categoryName')} className="cursor-pointer text-primary/80 hover:text-accent">Category/Source{getSortIndicator('categoryName')}</TableHead>
                    <TableHead onClick={() => requestSort('paymentMethodName')} className="cursor-pointer text-primary/80 hover:text-accent">Payment Method{getSortIndicator('paymentMethodName')}</TableHead>
                    <TableHead onClick={() => requestSort('expenseType')} className="cursor-pointer text-primary/80 hover:text-accent">Expense Type{getSortIndicator('expenseType')}</TableHead>
                    <TableHead className="text-primary/80">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <motion.tbody variants={tableContainerVariants} initial="hidden" animate="visible">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => (
                      <motion.tr 
                        key={transaction.id} 
                        variants={tableRowVariants}
                        layout 
                        className="hover:bg-accent/10 border-b-primary/20"
                      >
                        <TableCell className="text-foreground/90">{format(new Date(transaction.date), "dd MMM, yyyy")}</TableCell>
                        <TableCell className="font-medium text-foreground">{transaction.description}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'} 
                                className={transaction.type === 'income' ? 'bg-green-600/30 text-green-200 border-green-500/50 hover:bg-green-600/40' : 'bg-red-600/30 text-red-200 border-red-500/50 hover:bg-red-600/40'}>
                            {transaction.type === 'income' ? <ArrowUpCircle className="mr-1 h-3 w-3" /> : <ArrowDownCircle className="mr-1 h-3 w-3" />}
                            {transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${transaction.type === 'income' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {transaction.type === 'income' ? '+' : '-'}₹{transaction.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-foreground/90">{transaction.category?.name || transaction.source}</TableCell>
                        <TableCell className="text-foreground/90">{transaction.paymentMethod?.name || 'N/A'}</TableCell>
                        <TableCell>
                          {transaction.type === 'expense' && transaction.expenseType && (
                            <Badge 
                              variant={transaction.expenseType === 'need' ? 'default' : transaction.expenseType === 'want' ? 'secondary' : 'outline'}
                              className={`capitalize ${
                                transaction.expenseType === 'need' ? 'bg-blue-600/30 text-blue-200 border-blue-500/50' :
                                transaction.expenseType === 'want' ? 'bg-purple-600/30 text-purple-200 border-purple-500/50' :
                                'bg-gray-600/30 text-gray-200 border-gray-500/50'
                              }`}
                            >
                              {transaction.expenseType.replace('_expense', '')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1">
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                            <Button variant="ghost" size="icon" onClick={() => setEditingTransaction(transaction)} className="text-accent hover:text-accent/80 hover:bg-accent/10">
                              <Edit3 className="h-4 w-4" />
                              <span className="sr-only">Edit Transaction</span>
                            </Button>
                          </motion.div>
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-400 hover:bg-red-500/10">
                                <Trash2 className="h-4 w-4" />
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
                                <AlertDialogAction onClick={() => handleDeleteTransaction(transaction.id)} disabled={isDeleting} className="bg-red-600 hover:bg-red-700/80 text-primary-foreground">
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
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        No transactions found. Try adjusting your filters or adding a new transaction.
                      </TableCell>
                    </TableRow>
                  )}
                </motion.tbody>
              </Table>
            </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>
      
      <AlertDialog open={editingTransaction !== null} onOpenChange={(isOpen) => !isOpen && setEditingTransaction(null)}>
          <AlertDialogContent className="bg-background/95 border-primary/50 shadow-lg sm:max-w-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-accent text-xl">
                    {editingTransaction ? "Edit Transaction" : "New Transaction"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    {editingTransaction ? "Modify the details of this transaction." : "Record a new income or expense."}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <TransactionForm 
                  onTransactionAdded={handleTransactionUpdateOrAdd} 
                  initialTransactionData={editingTransaction} // Pass the whole AppTransaction object
                  onCancel={() => setEditingTransaction(null)}
                />
              </div>
          </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

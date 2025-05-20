
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Transaction, TransactionEnumType, ExpenseEnumType, TransactionInput } from '@/lib/types';
import { getTransactions, deleteTransaction } from '@/lib/actions/transactions';
import { expenseCategories, incomeCategories, paymentMethods } from '@/lib/data';
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Filter, Edit3, Trash2, Download, ListFilter, BookOpen, Loader2 } from "lucide-react";
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
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<TransactionEnumType | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction | null; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const { selectedMonth, selectedYear, monthNamesList } = useDateSelection(); 

  const fetchTransactionsCallback = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedTransactions = await getTransactions();
      setAllTransactions(fetchedTransactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      toast({ title: "Error Fetching Transactions", description: "Could not load your transaction data. Please try again.", variant: "destructive"});
      setAllTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTransactionsCallback();
  }, [fetchTransactionsCallback]);

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
           return sortConfig.direction === 'ascending' ? (new Date(aValue as Date).getTime()) - (new Date(bValue as Date).getTime()) : (new Date(bValue as Date).getTime()) - (new Date(aValue as Date).getTime());
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


  const handleTransactionUpdateOrAdd = () => {
    fetchTransactionsCallback(); 
    setEditingTransaction(null); 
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    setIsDeleting(true);
    try {
      await deleteTransaction(transactionId);
      toast({ title: "Transaction Deleted!", description: "The transaction has been successfully removed." });
      fetchTransactionsCallback(); 
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      toast({ title: "Deletion Failed", description: "Could not remove the transaction.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
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
  
  const allCategoriesForFilter = useMemo(() => {
    const uniqueCategories = new Set<string>();
    expenseCategories.forEach(cat => uniqueCategories.add(cat.name));
    incomeCategories.forEach(cat => uniqueCategories.add(cat.name));
    return Array.from(uniqueCategories).sort();
  }, []);

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: "No Data to Export", description: "There are no transactions matching your current filters.", variant: "default"});
      return;
    }
    const headers = ["ID", "Type", "Date", "Amount (INR)", "Description", "Category/Source", "Payment Method", "Expense Type"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.type,
      format(new Date(t.date), "yyyy-MM-dd"),
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
        <Card className="shadow-xl border-purple-500/30 border-2 rounded-xl bg-card/80">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-purple-300 flex items-center gap-2">
              <BookOpen className="w-8 h-8 text-yellow-400 transform -rotate-6"/>
              Manage Transactions
            </CardTitle>
            <CardDescription className="text-purple-400/80">
              View and manage all your financial entries. Filters available below.
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
                className="w-full bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground placeholder:text-muted-foreground/70"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Select value={filterType} onValueChange={(value) => setFilterType(value as TransactionEnumType | 'all')}>
                  <SelectTrigger className="bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                  <SelectContent className="bg-card border-purple-500/60 text-foreground">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground"><SelectValue placeholder="Filter by Category/Source" /></SelectTrigger>
                  <SelectContent className="bg-card border-purple-500/60 text-foreground">
                    <SelectItem value="all">All Categories/Sources</SelectItem>
                    {allCategoriesForFilter.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                  <SelectTrigger className="bg-background/70 border-purple-500/40 focus:border-yellow-400 focus:ring-yellow-400 text-foreground"><SelectValue placeholder="Filter by Payment Method" /></SelectTrigger>
                  <SelectContent className="bg-card border-purple-500/60 text-foreground">
                    <SelectItem value="all">All Payment Methods</SelectItem>
                    {paymentMethods.map(pm => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={exportToCSV} variant="outline" className="w-full bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30 text-yellow-200">
                    <Download className="mr-2 h-4 w-4" />
                    Export to CSV
                  </Button>
                </motion.div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-[400px]">
                <Loader2 className="h-12 w-12 text-yellow-400 animate-spin" />
                <p className="ml-4 text-purple-300">Loading transactions...</p>
              </div>
            ) : (
            <ScrollArea className="h-[500px] rounded-md border border-purple-500/30 p-1 bg-background/50">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-purple-500/10 border-b-purple-500/30">
                    <TableHead onClick={() => requestSort('date')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Date{getSortIndicator('date')}</TableHead>
                    <TableHead onClick={() => requestSort('description')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Description{getSortIndicator('description')}</TableHead>
                    <TableHead onClick={() => requestSort('type')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Type{getSortIndicator('type')}</TableHead>
                    <TableHead onClick={() => requestSort('amount')} className="text-right cursor-pointer text-purple-300/80 hover:text-yellow-300">Amount (₹){getSortIndicator('amount')}</TableHead>
                    <TableHead onClick={() => requestSort('category')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Category/Source{getSortIndicator('category')}</TableHead>
                    <TableHead onClick={() => requestSort('paymentMethod')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Payment Method{getSortIndicator('paymentMethod')}</TableHead>
                    <TableHead onClick={() => requestSort('expenseType')} className="cursor-pointer text-purple-300/80 hover:text-yellow-300">Expense Type{getSortIndicator('expenseType')}</TableHead>
                    <TableHead className="text-purple-300/80">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <motion.tbody variants={tableContainerVariants} initial="hidden" animate="visible">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => (
                      <motion.tr 
                        key={transaction.id} 
                        variants={tableRowVariants}
                        layout // Enables smooth reordering if list changes
                        className="hover:bg-yellow-500/10 border-b-purple-500/20"
                      >
                        <TableCell className="text-purple-200/90">{format(new Date(transaction.date), "dd MMM, yyyy")}</TableCell>
                        <TableCell className="font-medium text-purple-100">{transaction.description}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === 'income' ? 'default' : 'destructive'} 
                                className={transaction.type === 'income' ? 'bg-green-600/30 text-green-200 border-green-500/50 hover:bg-green-600/40' : 'bg-red-600/30 text-red-200 border-red-500/50 hover:bg-red-600/40'}>
                            {transaction.type === 'income' ? <ArrowUpCircle className="mr-1 h-3 w-3" /> : <ArrowDownCircle className="mr-1 h-3 w-3" />}
                            {transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${transaction.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                          {transaction.type === 'income' ? '+' : '-'}₹{transaction.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-purple-200/90">{transaction.type === 'expense' ? transaction.category : transaction.source}</TableCell>
                        <TableCell className="text-purple-200/90">{transaction.paymentMethod || 'N/A'}</TableCell>
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
                            <Button variant="ghost" size="icon" onClick={() => setEditingTransaction(transaction)} className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10">
                              <Edit3 className="h-4 w-4" />
                              <span className="sr-only">Edit Transaction</span>
                            </Button>
                          </motion.div>
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Transaction</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-background/95 border-purple-600/50 shadow-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-yellow-400">Are you sure you want to delete this transaction?</AlertDialogTitle>
                                <AlertDialogDescription className="text-purple-300/80">
                                  This action cannot be undone. This will permanently remove the transaction: "{transaction.description}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-purple-500/70 text-purple-300 hover:bg-purple-700/30">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTransaction(transaction.id)} disabled={isDeleting} className="bg-red-600 hover:bg-red-700/80 text-red-100">
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
                      <TableCell colSpan={8} className="text-center text-purple-400/70 py-10">
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
          <AlertDialogContent className="bg-background/95 border-purple-600/50 shadow-lg sm:max-w-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-yellow-400 text-xl">
                    {editingTransaction ? "Edit Transaction" : "New Transaction"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-purple-300/80">
                    {editingTransaction ? "Modify the details of this transaction." : "Record a new income or expense."}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <TransactionForm 
                  onTransactionAdded={handleTransactionUpdateOrAdd} 
                  initialTransactionData={editingTransaction} 
                  onCancel={() => setEditingTransaction(null)}
                />
              </div>
          </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

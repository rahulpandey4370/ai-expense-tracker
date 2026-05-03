"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Repeat, Loader2, Trash2, Pause, Play, Plus, RefreshCw, Calendar } from "lucide-react";
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
  getRecurringRules,
  addRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  materializeRecurringTransactions,
} from "@/lib/actions/recurring";
import { getCategories, getPaymentMethods } from "@/lib/actions/transactions";
import type { RecurringRule, Category, PaymentMethod } from "@/lib/types";

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RecurringPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMaterializing, setIsMaterializing] = useState(false);

  // Form state for "Add new rule"
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [expenseType, setExpenseType] = useState<'need' | 'want' | 'investment'>('need');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [r, c, pm] = await Promise.all([getRecurringRules(), getCategories(), getPaymentMethods()]);
      setRules(r);
      setCategories(c);
      setPaymentMethods(pm);
    } catch (err: any) {
      toast({ title: "Failed to load recurring rules", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredCategories = categories.filter(c => c.type === type);

  const resetForm = () => {
    setType('expense');
    setAmount('');
    setDescription('');
    setCategoryId('');
    setPaymentMethodId('');
    setExpenseType('need');
    setDayOfMonth(1);
    setStartDate(todayYmd());
    setEndDate('');
  };

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (!description.trim() || isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid input", description: "Provide a description and a positive amount.", variant: "destructive" });
      return;
    }
    if (type === 'expense' && (!categoryId || !paymentMethodId)) {
      toast({ title: "Missing fields", description: "Expense rules need a category and payment method.", variant: "destructive" });
      return;
    }
    if (type === 'income' && !categoryId) {
      toast({ title: "Missing fields", description: "Income rules need a category (e.g. Salary).", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await addRecurringRule({
        type,
        amount: amountNum,
        description: description.trim(),
        categoryId: categoryId || undefined,
        paymentMethodId: type === 'expense' ? paymentMethodId : undefined,
        expenseType: type === 'expense' ? expenseType : undefined,
        dayOfMonth,
        startDate,
        endDate: endDate || undefined,
        isActive: true,
      });
      toast({ title: "Recurring rule added", description: "Future months will auto-create this transaction." });
      resetForm();
      setShowForm(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Could not add rule", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (rule: RecurringRule) => {
    try {
      await updateRecurringRule(rule.id, { isActive: !rule.isActive });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecurringRule(id);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRunNow = async () => {
    setIsMaterializing(true);
    try {
      const result = await materializeRecurringTransactions();
      toast({
        title: result.inserted > 0 ? `${result.inserted} transaction(s) inserted` : "Nothing was due",
        description: result.ruleErrors > 0 ? `${result.ruleErrors} rule(s) errored — check logs.` : undefined,
      });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Run failed", description: err.message, variant: "destructive" });
    } finally {
      setIsMaterializing(false);
    }
  };

  const categoryNameById = (id?: string) => categories.find(c => c.id === id)?.name || '—';
  const pmNameById = (id?: string) => paymentMethods.find(p => p.id === id)?.name || '—';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
                  <Repeat className="w-7 h-7 text-accent" />
                  Recurring Transactions
                </CardTitle>
                <CardDescription className="text-sm md:text-base text-muted-foreground">
                  Define rules for entries that repeat every month (rent, wifi, salary, EMIs). When a rule's day of the month passes, the transaction is auto-created the next time you open the app.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRunNow} variant="outline" size="sm" disabled={isMaterializing}>
                  {isMaterializing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Run now
                </Button>
                <Button onClick={() => setShowForm(s => !s)} size="sm">
                  <Plus className="mr-2 h-4 w-4" /> {showForm ? 'Close' : 'New rule'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {showForm && (
              <div className="p-4 rounded-md border border-primary/20 bg-background/50 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(v) => { setType(v as any); setCategoryId(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 25000" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Rent, Wifi, Salary, etc." />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                      <SelectContent>
                        {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {type === 'expense' && (
                    <>
                      <div>
                        <Label>Payment Method</Label>
                        <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                          <SelectTrigger><SelectValue placeholder="Pick payment method" /></SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Expense Type</Label>
                        <Select value={expenseType} onValueChange={(v) => setExpenseType(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="need">Need</SelectItem>
                            <SelectItem value="want">Want</SelectItem>
                            <SelectItem value="investment">Investment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Day of month</Label>
                    <Input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))))} />
                    <p className="text-[11px] text-muted-foreground mt-1">If month has fewer days, the last day is used.</p>
                  </div>
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End date (optional)</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save rule
                  </Button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading rules…
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 border border-dashed border-primary/30 rounded-md">
                No recurring rules yet. Click "New rule" to add one (e.g. Rent on the 1st of every month).
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className={cn(
                    "flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-md border bg-background/40",
                    !rule.isActive && "opacity-60"
                  )}>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", rule.type === 'income' ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700')}>
                          {rule.type}
                        </span>
                        <strong className="text-foreground">{rule.description}</strong>
                        <span className="text-foreground font-semibold">₹{rule.amount.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> day {rule.dayOfMonth}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {categoryNameById(rule.categoryId)}
                        {rule.paymentMethodId && ` · ${pmNameById(rule.paymentMethodId)}`}
                        {rule.expenseType && ` · ${rule.expenseType}`}
                        {` · from ${rule.startDate}`}
                        {rule.endDate && ` to ${rule.endDate}`}
                        {rule.lastGeneratedDate && ` · last run ${rule.lastGeneratedDate}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleToggleActive(rule)} title={rule.isActive ? 'Pause' : 'Resume'}>
                        {rule.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete recurring rule?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{rule.description}" will no longer auto-create transactions. Existing transactions are kept.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(rule.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

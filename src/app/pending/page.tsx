"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MessageSquareText, Loader2, Check, X, Sparkles } from "lucide-react";
import { getCategories, getPaymentMethods } from "@/lib/actions/transactions";
import {
  getPendingTransactions,
  confirmPendingTransaction,
  dismissPendingTransaction,
  aiFillPendingTransaction,
  type PendingTransaction,
} from "@/lib/actions/pending";
import type { Category, PaymentMethod } from "@/lib/types";

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";
const EXPENSE_TYPES = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'investment', label: 'Investment' },
  { value: 'investment_expense', label: 'Investment expense' },
] as const;

export default function PendingPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [pending, cats, pms] = await Promise.all([getPendingTransactions(), getCategories('expense'), getPaymentMethods()]);
      setItems(pending);
      setCategories(cats);
      setPaymentMethods(pms);
    } catch (e: any) {
      toast({ title: "Could not load SMS inbox", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const update = (id: string, patch: Partial<PendingTransaction>) =>
    setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const confirm = async (item: PendingTransaction) => {
    if (!item.categoryId || !item.paymentMethodId || !item.expenseType || !(item.amount > 0) || !item.description.trim()) {
      toast({ title: "Fill in all fields", description: "Category, payment method and need/want are required.", variant: "destructive" });
      return;
    }
    setBusyId(item.id);
    try {
      await confirmPendingTransaction(item.id, {
        date: item.date,
        amount: item.amount,
        description: item.description.trim(),
        categoryId: item.categoryId,
        paymentMethodId: item.paymentMethodId,
        expenseType: item.expenseType,
      });
      setItems(list => list.filter(i => i.id !== item.id));
      toast({ title: "Logged", description: `₹${item.amount.toLocaleString('en-IN')} added to transactions.` });
    } catch (e: any) {
      toast({ title: "Could not log it", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const aiFill = async (item: PendingTransaction) => {
    setAiBusyId(item.id);
    try {
      const g = await aiFillPendingTransaction(item.id, notes[item.id] ?? '');
      // Amount and date stay as read from the SMS.
      update(item.id, {
        description: g.description ?? item.description,
        categoryId: g.categoryId ?? item.categoryId,
        paymentMethodId: g.paymentMethodId ?? item.paymentMethodId,
        expenseType: g.expenseType ?? item.expenseType,
      });
    } catch (e: any) {
      toast({ title: "AI couldn't fill it", description: e.message, variant: "destructive" });
    } finally {
      setAiBusyId(null);
    }
  };

  const dismiss = async (item: PendingTransaction) => {
    setBusyId(item.id);
    try {
      await dismissPendingTransaction(item.id);
      setItems(list => list.filter(i => i.id !== item.id));
    } catch (e: any) {
      toast({ title: "Could not dismiss", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
            <MessageSquareText className="w-7 h-7 text-accent" />
            SMS Inbox
          </CardTitle>
          <CardDescription className="text-sm md:text-base text-muted-foreground">
            Bank SMS forwarded by your iPhone Shortcut. Check the details, then log or dismiss.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nothing to review. New bank SMS will show up here.</p>
      ) : (
        items.map(item => (
          <Card key={item.id} className="rounded-xl border-primary/20">
            <CardContent className="pt-6 space-y-4">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3">
                {item.sender ? <span className="font-semibold">{item.sender}: </span> : null}
                {item.rawText}
              </p>

              <div className="space-y-1">
                <Label htmlFor={`note-${item.id}`}>What was it? (AI fills the rest)</Label>
                <div className="flex gap-2">
                  <Input id={`note-${item.id}`} placeholder="e.g. team lunch, paid by credit card"
                    value={notes[item.id] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') aiFill(item); }} />
                  <Button type="button" variant="secondary" onClick={() => aiFill(item)} disabled={aiBusyId === item.id || busyId === item.id}>
                    {aiBusyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    AI
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor={`desc-${item.id}`}>Description</Label>
                  <Input id={`desc-${item.id}`} value={item.description} onChange={e => update(item.id, { description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`amt-${item.id}`}>Amount (₹)</Label>
                  <Input id={`amt-${item.id}`} type="number" inputMode="decimal" step="0.01" min="0"
                    value={Number.isFinite(item.amount) ? item.amount : ''}
                    onChange={e => update(item.id, { amount: parseFloat(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`date-${item.id}`}>Date</Label>
                  <Input id={`date-${item.id}`} type="date" value={item.date} onChange={e => update(item.id, { date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={item.categoryId ?? undefined} onValueChange={v => update(item.id, { categoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payment method</Label>
                  <Select value={item.paymentMethodId ?? undefined} onValueChange={v => update(item.id, { paymentMethodId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose payment method" /></SelectTrigger>
                    <SelectContent>{paymentMethods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Need / want</Label>
                  <Select value={item.expenseType ?? undefined} onValueChange={v => update(item.id, { expenseType: v as PendingTransaction['expenseType'] })}>
                    <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
                    <SelectContent>{EXPENSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => dismiss(item)} disabled={busyId === item.id}>
                  <X className="mr-2 h-4 w-4" /> Dismiss
                </Button>
                <Button onClick={() => confirm(item)} disabled={busyId === item.id}>
                  {busyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Log it
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

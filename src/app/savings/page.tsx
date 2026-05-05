"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PiggyBank, Loader2, Trash2, Plus, Pencil, X, Check } from "lucide-react";
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
  getSavingsAllocations,
  addSavingsAllocation,
  updateSavingsAllocation,
  deleteSavingsAllocation,
} from "@/lib/actions/savings";
import type { SavingsAllocation, SavingsAllocationCategory, SavingsAllocationInput } from "@/lib/types";

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CATEGORY_LABELS: Record<SavingsAllocationCategory, string> = {
  savings_account: 'Savings Account',
  liquid_fund: 'Liquid Fund',
  fd: 'Fixed Deposit',
  rd: 'Recurring Deposit',
  cash: 'Cash',
  other: 'Other',
};

const CATEGORY_ORDER: SavingsAllocationCategory[] = [
  'savings_account', 'liquid_fund', 'fd', 'rd', 'cash', 'other',
];

const emptyForm = (): SavingsAllocationInput => ({
  name: '',
  location: '',
  category: 'savings_account',
  amount: 0,
  asOfDate: todayYmd(),
  notes: '',
});

export default function SavingsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<SavingsAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SavingsAllocationInput>(emptyForm());
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await getSavingsAllocations();
      setItems(all);
    } catch (err: any) {
      toast({ title: "Could not load savings", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const total = useMemo(() => items.reduce((s, i) => s + (i.amount || 0), 0), [items]);
  const grouped = useMemo(() => {
    const map: Record<SavingsAllocationCategory, SavingsAllocation[]> = {
      savings_account: [], liquid_fund: [], fd: [], rd: [], cash: [], other: [],
    };
    for (const it of items) map[it.category].push(it);
    return map;
  }, [items]);

  const resetForm = () => {
    setForm(emptyForm());
    setAmountText('');
    setEditingId(null);
  };

  const startEdit = (item: SavingsAllocation) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      location: item.location,
      category: item.category,
      amount: item.amount,
      asOfDate: item.asOfDate,
      notes: item.notes || '',
    });
    setAmountText(String(item.amount));
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(amountText);
    if (!form.name.trim() || !form.location.trim() || !form.asOfDate || !(amount > 0)) {
      toast({ title: "Please fill name, location, a positive amount, and as-of date.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: SavingsAllocationInput = {
        ...form,
        amount,
        notes: form.notes?.trim() ? form.notes.trim() : undefined,
      };
      if (editingId) {
        await updateSavingsAllocation(editingId, payload);
        toast({ title: "Updated" });
      } else {
        await addSavingsAllocation(payload);
        toast({ title: "Added" });
      }
      resetForm();
      setShowForm(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavingsAllocation(id);
      toast({ title: "Deleted" });
      if (editingId === id) { resetForm(); setShowForm(false); }
      fetchAll();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
                  <PiggyBank className="w-7 h-7 text-accent" />
                  Cash Savings Locations
                </CardTitle>
                <CardDescription className="text-sm md:text-base text-muted-foreground">
                  Record where your idle cash is parked — savings accounts, liquid funds, FDs, RDs, etc. — so you always know how much money is kept where.
                </CardDescription>
              </div>
              <Button
                onClick={() => { if (showForm) { resetForm(); } setShowForm(s => !s); }}
                size="sm"
              >
                {showForm
                  ? <><X className="mr-2 h-4 w-4" /> Close</>
                  : <><Plus className="mr-2 h-4 w-4" /> New entry</>}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-baseline justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">Total tracked</div>
              <div className="text-2xl font-bold text-primary">
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {showForm && (
              <div className="rounded-lg border bg-background/60 p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="sv-name">Name</Label>
                    <Input id="sv-name" placeholder="e.g. Emergency Fund" value={form.name}
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="sv-location">Location</Label>
                    <Input id="sv-location" placeholder="e.g. HDFC Savings A/c, Quant Liquid Fund"
                      value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="sv-category">Type</Label>
                    <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as SavingsAllocationCategory }))}>
                      <SelectTrigger id="sv-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sv-amount">Amount (₹)</Label>
                    <Input id="sv-amount" type="number" inputMode="decimal" placeholder="0.00"
                      value={amountText} onChange={(e) => setAmountText(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="sv-as-of">As of date</Label>
                    <Input id="sv-as-of" type="date" value={form.asOfDate}
                      onChange={(e) => setForm(f => ({ ...f, asOfDate: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="sv-notes">Notes (optional)</Label>
                    <Textarea id="sv-notes" rows={2} placeholder="e.g. tagged for house down-payment"
                      value={form.notes || ''} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    {editingId ? 'Update' : 'Save'}
                  </Button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nothing tracked yet. Click <strong>New entry</strong> to record your first allocation.
              </p>
            ) : (
              <div className="space-y-5">
                {CATEGORY_ORDER.filter(c => grouped[c].length > 0).map(c => {
                  const subTotal = grouped[c].reduce((s, i) => s + i.amount, 0);
                  return (
                    <div key={c}>
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[c]}</h3>
                        <div className="text-xs text-muted-foreground">
                          ₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="ml-1">({((subTotal / (total || 1)) * 100).toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {grouped[c].map(item => (
                          <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border bg-background/40 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <strong className="text-foreground">{item.name}</strong>
                                <span className="text-foreground font-semibold">
                                  ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.location} · as of {item.asOfDate}
                                {item.notes && ` · ${item.notes}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="icon" onClick={() => startEdit(item)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This entry will be removed. You can re-add it any time.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

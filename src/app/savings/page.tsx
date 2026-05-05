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
import { PiggyBank, Loader2, Trash2, Plus, Pencil, X, Check, Wand2, Sparkles, Palette, RefreshCw } from "lucide-react";
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
  parseAndApplySavingsAllocation,
  getSavingsSmartKpis,
} from "@/lib/actions/savings";
import { useAIModel } from "@/contexts/AIModelContext";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import type { SavingsAllocation, SavingsAllocationCategory, SavingsAllocationInput } from "@/lib/types";
import type { SavingsSmartKpisOutput } from "@/ai/flows/savings-smart-kpis-flow";
import "@/components/savings/savings-crayon.css";

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

const formatINR = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const UI_MODE_KEY = 'finwise.savings.uiMode.v1';
type UiMode = 'normal' | 'crayon';

export default function SavingsPage() {
  const { toast } = useToast();
  const { selectedModel } = useAIModel();
  const { selectedYear } = useDateSelection();
  const [items, setItems] = useState<SavingsAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [uiMode, setUiMode] = useState<UiMode>('normal');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(UI_MODE_KEY);
    if (saved === 'crayon' || saved === 'normal') setUiMode(saved);
  }, []);
  const setUiModePersisted = (m: UiMode) => {
    setUiMode(m);
    if (typeof window !== 'undefined') window.localStorage.setItem(UI_MODE_KEY, m);
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SavingsAllocationInput>(emptyForm());
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // AI natural-language input
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // Smart KPIs
  const [kpis, setKpis] = useState<SavingsSmartKpisOutput | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState<string | null>(null);

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

  const handleAiSubmit = async () => {
    const text = aiText.trim();
    if (!text) return;
    setAiBusy(true);
    try {
      const result = await parseAndApplySavingsAllocation(text, selectedModel);
      if (!result.ok) {
        toast({ title: "Couldn't apply", description: result.reason, variant: "destructive" });
      } else if (result.mode === 'add') {
        toast({ title: "Added", description: `${result.record.name} — ${formatINR(result.record.amount)}` });
        setAiText('');
        fetchAll();
      } else {
        toast({
          title: "Updated",
          description: `${result.record.name}: ${formatINR(result.previous.amount)} → ${formatINR(result.record.amount)}`,
        });
        setAiText('');
        fetchAll();
      }
    } catch (err: any) {
      toast({ title: "AI failed", description: err.message, variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const refreshKpis = useCallback(async () => {
    if (items.length === 0) { setKpis(null); return; }
    setKpisLoading(true);
    setKpisError(null);
    try {
      const out = await getSavingsSmartKpis(selectedYear, selectedModel);
      setKpis(out);
    } catch (err: any) {
      setKpisError(err.message || "Failed to compute KPIs");
    } finally {
      setKpisLoading(false);
    }
  }, [selectedYear, selectedModel, items.length]);

  // Auto-refresh KPIs when the underlying data changes (debounced via length+total).
  useEffect(() => {
    if (items.length === 0) { setKpis(null); return; }
    refreshKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, total]);

  const showKpis = items.length > 0;

  // ----- root render -----
  if (uiMode === 'crayon') {
    return (
      <div className="crayon-ui min-h-[calc(100svh-4rem)] p-4 sm:p-6 lg:p-8 space-y-6">
        <CrayonSvgDefs />
        <CrayonHeader
          uiMode={uiMode}
          setUiMode={setUiModePersisted}
          onNew={() => { if (showForm) resetForm(); setShowForm(s => !s); }}
          showForm={showForm}
        />
        <CrayonAiInput aiText={aiText} setAiText={setAiText} aiBusy={aiBusy} onSubmit={handleAiSubmit} />
        {showKpis && <CrayonKpis kpis={kpis} loading={kpisLoading} error={kpisError} onRefresh={refreshKpis} fallbackTotal={total} />}
        {showForm && (
          <CrayonForm
            form={form} setForm={setForm}
            amountText={amountText} setAmountText={setAmountText}
            onCancel={() => { resetForm(); setShowForm(false); }}
            onSubmit={handleSubmit}
            submitting={submitting}
            editing={!!editingId}
          />
        )}
        <CrayonList
          isLoading={isLoading}
          items={items}
          grouped={grouped}
          total={total}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  // Normal UI
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
              <div className="flex items-center gap-2">
                <UiModeToggle uiMode={uiMode} setUiMode={setUiModePersisted} />
                <Button
                  onClick={() => { if (showForm) { resetForm(); } setShowForm(s => !s); }}
                  size="sm"
                >
                  {showForm
                    ? <><X className="mr-2 h-4 w-4" /> Close</>
                    : <><Plus className="mr-2 h-4 w-4" /> New entry</>}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <NormalAiInput aiText={aiText} setAiText={setAiText} aiBusy={aiBusy} onSubmit={handleAiSubmit} />
            {showKpis && <NormalKpis kpis={kpis} loading={kpisLoading} error={kpisError} onRefresh={refreshKpis} fallbackTotal={total} />}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-baseline justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">Total tracked</div>
              <div className="text-2xl font-bold text-primary">
                {formatINR(total)}
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
                Nothing tracked yet. Click <strong>New entry</strong> or use the AI box above.
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
                          {formatINR(subTotal)}
                          <span className="ml-1">({((subTotal / (total || 1)) * 100).toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {grouped[c].map(item => (
                          <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border bg-background/40 p-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <strong className="text-foreground">{item.name}</strong>
                                <span className="text-foreground font-semibold">{formatINR(item.amount)}</span>
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

/* ---------------- shared bits ---------------- */

function UiModeToggle({ uiMode, setUiMode }: { uiMode: UiMode; setUiMode: (m: UiMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-primary/40 bg-background/70 p-0.5 text-xs">
      <button
        className={cn("px-3 py-1 rounded-full transition-colors", uiMode === 'normal' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        onClick={() => setUiMode('normal')}
        title="Default UI"
      >Normal</button>
      <button
        className={cn("px-3 py-1 rounded-full transition-colors flex items-center gap-1", uiMode === 'crayon' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        onClick={() => setUiMode('crayon')}
        title="Hand-drawn crayon UI"
      ><Palette className="h-3 w-3" />Crayon</button>
    </div>
  );
}

function NormalAiInput({ aiText, setAiText, aiBusy, onSubmit }: {
  aiText: string;
  setAiText: (v: string) => void;
  aiBusy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="font-semibold text-sm">AI quick entry</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Try: "I have ₹50k in HDFC savings tagged emergency fund" or "update emergency fund to ₹60k".
      </p>
      <div className="flex gap-2 flex-col sm:flex-row">
        <Textarea rows={2} value={aiText} onChange={(e) => setAiText(e.target.value)}
          placeholder="Type a savings instruction in plain English..." disabled={aiBusy} className="flex-1" />
        <Button onClick={onSubmit} disabled={aiBusy || !aiText.trim()} className="self-end sm:self-stretch">
          {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {aiBusy ? 'Thinking...' : 'Apply with AI'}
        </Button>
      </div>
    </div>
  );
}

function CrayonAiInput({ aiText, setAiText, aiBusy, onSubmit }: {
  aiText: string;
  setAiText: (v: string) => void;
  aiBusy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="crayon-card crayon-anim-in">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5" />
        <span className="crayon-title text-2xl">Tell me what changed</span>
      </div>
      <p className="text-sm text-[color:var(--crayon-muted)] mb-3">
        Try: "I have ₹50k in HDFC savings tagged emergency fund" or "update emergency fund to ₹60k".
      </p>
      <textarea
        className="crayon-textarea"
        rows={2}
        value={aiText}
        onChange={(e) => setAiText(e.target.value)}
        placeholder="Type a savings instruction in plain English..."
        disabled={aiBusy}
      />
      <div className="flex justify-end mt-3">
        <button className="crayon-btn" onClick={onSubmit} disabled={aiBusy || !aiText.trim()}>
          {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          <span>{aiBusy ? 'Thinking...' : 'Apply with AI'}</span>
        </button>
      </div>
    </div>
  );
}

function NormalKpis({ kpis, loading, error, onRefresh, fallbackTotal }: {
  kpis: SavingsSmartKpisOutput | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  fallbackTotal: number;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="font-semibold text-sm">AI Smart KPIs</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {kpis?.headline && <p className="text-xs italic text-muted-foreground mb-3">{kpis.headline}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {(kpis?.kpis || [{ label: 'Total Parked', amount: fallbackTotal }]).map((k, i) => (
          <div key={i} className="rounded-md border bg-card/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="text-lg font-bold text-primary">{formatINR(k.amount)}</div>
            {k.share != null && <div className="text-[11px] text-muted-foreground">{k.share.toFixed(1)}% of total</div>}
            {k.detail && <div className="text-[11px] text-muted-foreground mt-1 truncate" title={k.detail}>{k.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- crayon variant ---------------- */

function CrayonSvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="crayon-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
      </defs>
    </svg>
  );
}

function CrayonHeader({ uiMode, setUiMode, onNew, showForm }: {
  uiMode: UiMode;
  setUiMode: (m: UiMode) => void;
  onNew: () => void;
  showForm: boolean;
}) {
  return (
    <div className="crayon-card crayon-anim-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="crayon-title text-3xl sm:text-4xl flex items-center gap-2">
            <PiggyBank className="w-8 h-8" />
            Where my money lives
          </h1>
          <p className="text-sm text-[color:var(--crayon-muted)] mt-1">
            A scrappy, hand-drawn ledger of every place your cash is parked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UiModeToggle uiMode={uiMode} setUiMode={setUiMode} />
          <button className="crayon-btn" onClick={onNew}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showForm ? 'Close' : 'New entry'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CrayonKpis({ kpis, loading, error, onRefresh, fallbackTotal }: {
  kpis: SavingsSmartKpisOutput | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  fallbackTotal: number;
}) {
  const list = kpis?.kpis || [{ label: 'Total Parked', amount: fallbackTotal, color: 'purple' as const }];
  return (
    <div className="crayon-card crayon-anim-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <span className="crayon-title text-2xl">Smart KPIs</span>
        </div>
        <button className="crayon-btn" data-variant="ghost" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          <span>Refresh</span>
        </button>
      </div>
      {error && <p className="text-sm text-[color:var(--crayon-red)] mb-2">{error}</p>}
      {kpis?.headline && (
        <p className="crayon-title text-lg italic mb-3 text-[color:var(--crayon-ink)]">"{kpis.headline}"</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((k, i) => (
          <div key={i} className="crayon-kpi" data-color={k.color || 'purple'}>
            <div className="label">{k.label}</div>
            <div className="value">{formatINR(k.amount)}</div>
            {k.share != null && <div className="sub">{k.share.toFixed(1)}% of total</div>}
            {k.detail && <div className="sub mt-1" title={k.detail}>{k.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CrayonForm({ form, setForm, amountText, setAmountText, onCancel, onSubmit, submitting, editing }: {
  form: SavingsAllocationInput;
  setForm: React.Dispatch<React.SetStateAction<SavingsAllocationInput>>;
  amountText: string;
  setAmountText: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  editing: boolean;
}) {
  return (
    <div className="crayon-card crayon-anim-in">
      <h2 className="crayon-title text-2xl mb-3">{editing ? 'Edit entry' : 'New entry'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="crayon-label">Name</label>
          <input className="crayon-input" placeholder="Emergency Fund"
            value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="crayon-label">Where</label>
          <input className="crayon-input" placeholder="HDFC Savings A/c, Quant Liquid..."
            value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
        </div>
        <div>
          <label className="crayon-label">Type</label>
          <select className="crayon-select" value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value as SavingsAllocationCategory }))}>
            {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="crayon-label">Amount (₹)</label>
          <input className="crayon-input" type="number" inputMode="decimal" placeholder="0.00"
            value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </div>
        <div>
          <label className="crayon-label">As of date</label>
          <input className="crayon-input" type="date" value={form.asOfDate}
            onChange={(e) => setForm(f => ({ ...f, asOfDate: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="crayon-label">Notes</label>
          <textarea className="crayon-textarea" rows={2} placeholder="tagged for down-payment..."
            value={form.notes || ''} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button className="crayon-btn" data-variant="ghost" onClick={onCancel}>Cancel</button>
        <button className="crayon-btn" onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{editing ? 'Update' : 'Save'}</span>
        </button>
      </div>
    </div>
  );
}

function CrayonList({ isLoading, items, grouped, total, onEdit, onDelete }: {
  isLoading: boolean;
  items: SavingsAllocation[];
  grouped: Record<SavingsAllocationCategory, SavingsAllocation[]>;
  total: number;
  onEdit: (item: SavingsAllocation) => void;
  onDelete: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="crayon-card flex items-center justify-center py-8 text-[color:var(--crayon-muted)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="crayon-card text-center py-8 crayon-title text-lg text-[color:var(--crayon-muted)]">
        Nothing scribbled in here yet — try the AI box or hit "New entry".
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {CATEGORY_ORDER.filter(c => grouped[c].length > 0).map(c => {
        const subTotal = grouped[c].reduce((s, i) => s + i.amount, 0);
        const share = (subTotal / (total || 1)) * 100;
        return (
          <div key={c} className="crayon-card crayon-anim-in">
            <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`crayon-tag ${c}`}>{CATEGORY_LABELS[c]}</span>
              </div>
              <div className="crayon-title text-xl">
                {formatINR(subTotal)} <span className="text-base text-[color:var(--crayon-muted)]">· {share.toFixed(1)}%</span>
              </div>
            </div>
            <div className="crayon-progress mb-3"><span style={{ width: `${Math.min(100, share)}%` }} /></div>
            <div className="space-y-2">
              {grouped[c].map(item => (
                <div key={item.id} className="crayon-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-lg">{item.name}</strong>
                      <span className="crayon-amount">{formatINR(item.amount)}</span>
                    </div>
                    <div className="text-sm text-[color:var(--crayon-muted)]">
                      {item.location} · as of {item.asOfDate}
                      {item.notes && ` · ${item.notes}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button className="crayon-btn" data-variant="ghost" onClick={() => onEdit(item)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="crayon-btn" data-variant="danger" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This entry will be removed. You can re-add it any time.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(item.id)}>Delete</AlertDialogAction>
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
  );
}

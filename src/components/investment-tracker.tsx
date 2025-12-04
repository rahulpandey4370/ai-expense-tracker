
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import { getInvestmentSettings, getMonthlyInvestmentData, addFundEntry, deleteFundEntry, saveAISummary, saveInvestmentSettings } from '@/lib/actions/investments';
import { summarizeInvestments } from '@/ai/flows/investment-summary-flow';
import type { InvestmentSettings, FundEntry, MonthlyInvestmentData, FundEntryInput, FundTarget, InvestmentCategory } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { BarChart, BrainCircuit, Save, Loader2, Wand2, PlusCircle, Trash2, CalendarIcon, Copy, Settings, CheckCircle } from "lucide-react";
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import cuid from 'cuid';


const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

const progressColors: { [key in InvestmentCategory]: string } = {
  Equity: "bg-blue-500",
  Debt: "bg-green-500",
  "Gold/Silver": "bg-yellow-500",
  "US Stocks": "bg-red-500",
  Crypto: "bg-purple-500",
  Other: "bg-gray-500",
};

interface InvestmentTrackerProps {
    onDataChanged: () => void;
}

export function InvestmentTracker({ onDataChanged }: InvestmentTrackerProps) {
  const { selectedMonth, selectedYear } = useDateSelection();
  const { toast } = useToast();

  const [settings, setSettings] = useState<InvestmentSettings | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyInvestmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // New states for managing forms
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAddingFund, setIsAddingFund] = useState(false);

  // Form states
  const [editableSettings, setEditableSettings] = useState<InvestmentSettings | null>(null);
  const [newFundName, setNewFundName] = useState('');
  const [newFundCategory, setNewFundCategory] = useState<InvestmentCategory>('Equity');
  const [newFundTargetAmount, setNewFundTargetAmount] = useState('');
  
  const [newEntryFundTargetId, setNewEntryFundTargetId] = useState('');
  const [newEntryAmount, setNewEntryAmount] = useState('');
  const [newEntryDate, setNewEntryDate] = useState<Date | undefined>(new Date());

  const monthYearKey = useMemo(() => `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`, [selectedYear, selectedMonth]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedSettings, fetchedMonthlyData] = await Promise.all([
        getInvestmentSettings(),
        getMonthlyInvestmentData(monthYearKey),
      ]);
      setSettings(fetchedSettings);
      setEditableSettings(JSON.parse(JSON.stringify(fetchedSettings))); // Deep copy for editing
      setMonthlyData(fetchedMonthlyData);
    } catch (err: any) {
      toast({ title: "Error Loading Investment Data", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [monthYearKey, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Settings Handlers ---
  const handleSaveSettings = async () => {
    if (!editableSettings) return;
    setIsSavingSettings(true);
    try {
      const updatedSettings = await saveInvestmentSettings(editableSettings);
      setSettings(updatedSettings);
      setEditableSettings(JSON.parse(JSON.stringify(updatedSettings))); // Re-sync after save
      toast({ title: "Settings Saved!", description: "Your investment targets have been updated." });
    } catch(err: any) {
        toast({ title: "Error Saving Settings", description: err.message, variant: "destructive" });
    } finally {
        setIsSavingSettings(false);
    }
  };

  const handleAddFundTarget = () => {
    if (!newFundName.trim() || !newFundTargetAmount) {
        toast({ title: "Missing Details", description: "Please provide a fund name and target amount.", variant: "destructive" });
        return;
    }
    const amount = parseFloat(newFundTargetAmount);
    if(isNaN(amount) || amount <= 0) {
        toast({ title: "Invalid Amount", description: "Target amount must be a positive number.", variant: "destructive" });
        return;
    }

    const newFund: FundTarget = {
        id: cuid(),
        name: newFundName.trim(),
        category: newFundCategory,
        targetAmount: amount,
    };

    setEditableSettings(prev => {
        if (!prev) return null;
        return {
            ...prev,
            fundTargets: [...prev.fundTargets, newFund],
        };
    });

    setNewFundName('');
    setNewFundTargetAmount('');
  };

  const handleDeleteFundTarget = (fundId: string) => {
      setEditableSettings(prev => {
          if (!prev) return null;
          return { ...prev, fundTargets: prev.fundTargets.filter(ft => ft.id !== fundId) };
      });
  };

  // --- Entry Handlers ---
  const handleAddEntry = async () => {
    if (!newEntryFundTargetId || !newEntryAmount || !newEntryDate) {
      toast({ title: "Missing Information", description: "Please select a fund and provide an amount and date.", variant: "destructive" });
      return;
    }
    const amountNum = parseFloat(newEntryAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a positive number for the amount.", variant: "destructive" });
      return;
    }
    
    const entryInput: FundEntryInput = {
        monthYear: monthYearKey,
        fundTargetId: newEntryFundTargetId,
        amount: amountNum,
        date: newEntryDate,
    };

    setIsSubmittingEntry(true);
    try {
      await addFundEntry(entryInput);
      toast({ title: "Investment Logged" });
      setNewEntryFundTargetId('');
      setNewEntryAmount('');
      fetchData(); // Refresh data
      onDataChanged(); // Notify parent dashboard page
    } catch (err: any) {
      toast({ title: "Error Adding Entry", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    setIsDeletingEntry(entryId);
    try {
      await deleteFundEntry(monthYearKey, entryId);
      toast({ title: "Entry Deleted" });
      fetchData();
      onDataChanged();
    } catch (err: any) {
      toast({ title: "Error Deleting Entry", description: err.message, variant: "destructive" });
    } finally {
      setIsDeletingEntry(null);
    }
  };
  
  // --- AI Summary Handlers ---
  const handleAnalyze = async () => {
      if (!settings || !monthlyData || monthlyData.entries.length === 0) {
          toast({ title: "No Data to Analyze", description: "Please add some investment entries for this month first.", variant: "default" });
          return;
      }
      setIsAnalyzing(true);
      try {
          const totalInvested = monthlyData.entries.reduce((sum, entry) => sum + entry.amount, 0);

          const categoryMap = new Map<InvestmentCategory, { target: number, actual: number }>();
          settings.fundTargets.forEach(ft => {
              const catData = categoryMap.get(ft.category) || { target: 0, actual: 0 };
              catData.target += ft.targetAmount;
              categoryMap.set(ft.category, catData);
          });
          monthlyData.entries.forEach(entry => {
              const fundTarget = settings.fundTargets.find(ft => ft.id === entry.fundTargetId);
              if (fundTarget) {
                  const catData = categoryMap.get(fundTarget.category);
                  if (catData) catData.actual += entry.amount;
              }
          });
          const targetBreakdown = Array.from(categoryMap.entries()).map(([name, data]) => ({ name, targetAmount: data.target, actualAmount: data.actual }));

          const fundEntries = monthlyData.entries.map(entry => {
              const fundTarget = settings.fundTargets.find(ft => ft.id === entry.fundTargetId);
              return { fundName: fundTarget?.name || 'Unknown Fund', amount: entry.amount, category: fundTarget?.category || 'Other' };
          });

          const summary = await summarizeInvestments({
              monthYear: monthYearKey,
              totalInvested,
              monthlyTarget: settings.monthlyTarget,
              targetBreakdown,
              fundEntries,
          });

          await saveAISummary(monthYearKey, summary.summary);
          setMonthlyData(prev => prev ? { ...prev, aiSummary: summary.summary } : null);
          toast({ title: "AI Summary Generated" });

      } catch (err: any) {
          toast({ title: "AI Analysis Failed", description: err.message, variant: "destructive" });
      } finally {
          setIsAnalyzing(false);
      }
  };

  const copySummary = () => {
    if (monthlyData?.aiSummary) {
      navigator.clipboard.writeText(monthlyData.aiSummary);
      toast({ title: "Copied!", description: "AI summary copied to clipboard." });
    }
  };

  const totalInvested = useMemo(() => monthlyData?.entries.reduce((sum, entry) => sum + entry.amount, 0) || 0, [monthlyData]);

  const categoryProgress = useMemo(() => {
    const progressMap = new Map<InvestmentCategory, { target: number; actual: number }>();
    if (!settings) return [];
    
    settings.fundTargets.forEach(ft => {
        const catData = progressMap.get(ft.category) || { target: 0, actual: 0 };
        catData.target += ft.targetAmount;
        progressMap.set(ft.category, catData);
    });

    monthlyData?.entries.forEach(entry => {
        const fundTarget = settings.fundTargets.find(ft => ft.id === entry.fundTargetId);
        if (fundTarget) {
            const catData = progressMap.get(fundTarget.category);
            if (catData) catData.actual += entry.amount;
        }
    });

    return Array.from(progressMap.entries())
        .map(([category, data]) => ({ category, ...data }))
        .filter(item => item.target > 0 || item.actual > 0);
  }, [settings, monthlyData]);

  if (isLoading || !editableSettings) {
    return <Card className={cn("shadow-lg", glowClass)}><CardContent><Skeleton className="h-96 w-full" /></CardContent></Card>;
  }
  
  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart className="h-6 w-6 text-accent" /> Monthly Investment Tracker
          </CardTitle>
          <CardDescription>
            Log your monthly investments against your targets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            
            <Accordion type="single" collapsible>
                <AccordionItem value="settings">
                    <AccordionTrigger>
                        <div className="flex items-center gap-2 font-semibold text-primary">
                            <Settings className="h-5 w-5"/>
                            Investment Settings & Targets
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 space-y-4">
                        <div className="p-3 border rounded-lg bg-background/50 space-y-4">
                            <div>
                                <Label htmlFor="monthly-target-input">Overall Monthly SIP Target (₹)</Label>
                                <Input id="monthly-target-input" type="number" value={editableSettings.monthlyTarget || ''} onChange={e => setEditableSettings({...editableSettings, monthlyTarget: parseFloat(e.target.value) || 0})} className="h-9 text-sm mt-1" />
                            </div>
                            <Separator/>
                            
                            <h4 className="font-medium text-foreground">Fund Targets</h4>
                            <div className="space-y-2">
                                {editableSettings.fundTargets.map((target, index) => (
                                    <div key={target.id} className="flex items-center gap-2 p-1.5 rounded-md border bg-background/50">
                                        <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                                           <span>{target.name}</span>
                                           <span>{target.category}</span>
                                           <span>₹{target.targetAmount.toLocaleString()}</span>
                                        </div>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteFundTarget(target.id)}>
                                            <Trash2 className="h-3 w-3 text-destructive"/>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                             <Accordion type="single" collapsible onValueChange={(val) => setIsAddingFund(!!val)}>
                                <AccordionItem value="add-fund">
                                    <AccordionTrigger className="text-sm font-medium text-accent">
                                        <PlusCircle className="mr-2 h-4 w-4"/>
                                        {isAddingFund ? "Close Form" : "Add New Fund Target"}
                                    </AccordionTrigger>
                                    <AccordionContent className="space-y-3 pt-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div><Label htmlFor="new-fund-name" className="text-xs">Fund Name</Label><Input id="new-fund-name" value={newFundName} onChange={e => setNewFundName(e.target.value)} className="h-8 mt-1 text-sm"/></div>
                                            <div><Label htmlFor="new-fund-category" className="text-xs">Category</Label>
                                                <Select value={newFundCategory} onValueChange={(v) => setNewFundCategory(v as InvestmentCategory)}>
                                                    <SelectTrigger id="new-fund-category" className="h-8 mt-1 text-sm"><SelectValue/></SelectTrigger>
                                                    <SelectContent>{Object.values(progressColors).map((_, i) => <SelectItem key={Object.keys(progressColors)[i]} value={Object.keys(progressColors)[i]}>{Object.keys(progressColors)[i]}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                            <div><Label htmlFor="new-fund-target" className="text-xs">Monthly Target (₹)</Label><Input id="new-fund-target" type="number" value={newFundTargetAmount} onChange={e => setNewFundTargetAmount(e.target.value)} className="h-8 mt-1 text-sm"/></div>
                                        </div>
                                        <Button size="sm" onClick={handleAddFundTarget} withMotion>Add Fund</Button>
                                    </AccordionContent>
                                </AccordionItem>
                             </Accordion>

                            <Button onClick={handleSaveSettings} disabled={isSavingSettings} size="sm" className="mt-4" withMotion>
                                {isSavingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save All Settings
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            
            {/* --- Progress Display --- */}
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <p className="font-semibold text-primary">Overall Monthly Progress</p>
                        <p className="text-sm font-bold text-primary">₹{totalInvested.toLocaleString()} / <span className="text-muted-foreground">₹{settings.monthlyTarget.toLocaleString()}</span></p>
                    </div>
                    <Progress value={settings.monthlyTarget > 0 ? (totalInvested / settings.monthlyTarget) * 100 : 0} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categoryProgress.map(({ category, target, actual }) => (
                        <div key={category} className="p-3 rounded-lg border bg-background/50">
                             <div className="flex justify-between items-baseline text-sm mb-1">
                                <span className="font-semibold text-foreground truncate">{category}</span>
                                <span className="text-xs text-muted-foreground">{(target > 0 ? (actual/target) * 100 : 0).toFixed(0)}%</span>
                            </div>
                            <Progress value={target > 0 ? (actual / target) * 100 : 0} indicatorClassName={cn(progressColors[category] || "bg-gray-500")} className="h-2" />
                            <p className="text-right font-semibold text-xs text-primary mt-1">₹{actual.toLocaleString()} / <span className="text-muted-foreground">₹{target.toLocaleString()}</span></p>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />

            {/* --- New Entry Form --- */}
            <div className="space-y-3 p-3 border rounded-lg bg-background/50">
                <h4 className="font-semibold text-primary">Log New Investment</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <Label htmlFor="fund-entry-target" className="text-xs">Fund</Label>
                        <Select value={newEntryFundTargetId} onValueChange={setNewEntryFundTargetId}>
                            <SelectTrigger id="fund-entry-target" className="h-9 mt-1 text-sm"><SelectValue placeholder="Select Fund"/></SelectTrigger>
                            <SelectContent>{(settings.fundTargets || []).map(ft => <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                     <div>
                        <Label htmlFor="fund-entry-amount" className="text-xs">Amount (₹)</Label>
                        <Input id="fund-entry-amount" type="number" value={newEntryAmount} onChange={e => setNewEntryAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="fund-entry-date" className="text-xs">Date</Label>
                        <Popover>
                            <PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full h-9 text-sm mt-1 justify-start font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{newEntryDate ? format(newEntryDate, "PPP") : "Pick date"}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newEntryDate} onSelect={setNewEntryDate} initialFocus /></PopoverContent>
                        </Popover>
                    </div>
                </div>
                <Button onClick={handleAddEntry} disabled={isSubmittingEntry} className="w-full sm:w-auto" size="sm" withMotion>
                    {isSubmittingEntry ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Add Entry
                </Button>
            </div>

            {/* --- Logged Entries & AI Summary --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <h4 className="font-semibold text-primary mb-2">Logged Entries for {monthYearKey}</h4>
                     {monthlyData && monthlyData.entries.length > 0 ? (
                        <ScrollArea className="h-48 border rounded-md p-2 bg-background/50">
                           <ul className="space-y-2">
                                {monthlyData.entries.map(entry => {
                                   const fundTarget = settings.fundTargets.find(ft => ft.id === entry.fundTargetId);
                                   return (
                                   <li key={entry.id} className="flex justify-between items-center text-sm p-1.5 rounded hover:bg-accent/5">
                                       <div>
                                           <p className="font-medium">{fundTarget?.name || 'Unknown Fund'}</p>
                                           <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "dd MMM, yyyy")}</p>
                                       </div>
                                       <div className="flex items-center gap-2">
                                           <span className="font-semibold">₹{entry.amount.toLocaleString()}</span>
                                           <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70" onClick={() => handleDeleteEntry(entry.id)} disabled={isDeletingEntry === entry.id}>
                                                {isDeletingEntry === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                           </Button>
                                       </div>
                                   </li> 
                                )})}
                           </ul>
                        </ScrollArea>
                     ) : <p className="text-sm text-muted-foreground text-center p-4 border rounded-md bg-background/50">No investments logged for this month.</p>}
                </div>
                <div className="space-y-2">
                     <h4 className="font-semibold text-primary mb-2 flex items-center gap-2"><BrainCircuit className="text-accent" /> AI Summary</h4>
                     <div className="p-3 border rounded-md bg-accent/5 h-48 relative">
                        {isAnalyzing ? <p className="text-sm text-muted-foreground">AI is generating your summary...</p> : monthlyData?.aiSummary ? (
                           <>
                            <ScrollArea className="h-full text-sm text-foreground/90 pr-8">
                                <p className="whitespace-pre-wrap">{monthlyData.aiSummary}</p>
                            </ScrollArea>
                            <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-7 w-7 text-muted-foreground" onClick={copySummary}><Copy className="h-4 w-4"/></Button>
                           </>
                        ) : <p className="text-sm text-muted-foreground">Click the button to generate a copiable AI summary of this month's investments.</p>}
                     </div>
                      <Button onClick={handleAnalyze} disabled={isAnalyzing || !monthlyData || monthlyData.entries.length === 0} className="w-full bg-accent text-accent-foreground" withMotion>
                        {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Generate AI Summary
                    </Button>
                </div>
            </div>

        </CardContent>
      </Card>
    </motion.div>
  );
}

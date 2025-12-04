
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import { getInvestmentSettings, getMonthlyInvestmentData, addFundEntry, deleteFundEntry, saveAISummary, saveInvestmentSettings } from '@/lib/actions/investments';
import { summarizeInvestments } from '@/ai/flows/investment-summary-flow';
import type { InvestmentSettings, FundEntry, MonthlyInvestmentData, FundEntryInput, InvestmentCategory } from '@/lib/types';
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
import { BarChart, BrainCircuit, Save, Loader2, Wand2, PlusCircle, Trash2, CalendarIcon, AlertTriangle, Copy, Settings, CheckCircle } from "lucide-react";
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"


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

  // Component State
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Settings form state
  const [editableSettings, setEditableSettings] = useState<Partial<InvestmentSettings>>({});

  // New entry form state
  const [newEntryFundName, setNewEntryFundName] = useState('');
  const [newEntryAmount, setNewEntryAmount] = useState('');
  const [newEntryDate, setNewEntryDate] = useState<Date | undefined>(new Date());
  const [newEntryCategory, setNewEntryCategory] = useState<InvestmentCategory>('Equity');

  const monthYearKey = useMemo(() => `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`, [selectedYear, selectedMonth]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedSettings, fetchedMonthlyData] = await Promise.all([
        getInvestmentSettings(),
        getMonthlyInvestmentData(monthYearKey),
      ]);
      setSettings(fetchedSettings);
      setEditableSettings(fetchedSettings);
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
  
  const handleSettingsChange = (field: keyof InvestmentSettings, value: any) => {
      setEditableSettings(prev => ({...prev, [field]: value}));
  };
  
  const handleTargetChange = (index: number, value: string) => {
      const newTargets = [...(editableSettings.targets || [])];
      const amount = parseFloat(value) || 0;
      if (newTargets[index]) {
          newTargets[index] = {...newTargets[index], targetAmount: amount};
          handleSettingsChange('targets', newTargets);
      }
  };

  const handleSaveSettings = async () => {
    if (!editableSettings) return;
    setIsSavingSettings(true);
    try {
        const updatedSettings = await saveInvestmentSettings(editableSettings);
        setSettings(updatedSettings); // Update main settings state
        toast({ title: "Settings Saved!", description: "Your investment targets have been updated." });
    } catch(err: any) {
        toast({ title: "Error Saving Settings", description: err.message, variant: "destructive" });
    } finally {
        setIsSavingSettings(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntryCategory || !newEntryFundName.trim() || !newEntryAmount || !newEntryDate) {
      toast({ title: "Missing Information", description: "Please fill all fields for the new entry.", variant: "destructive" });
      return;
    }
    const amountNum = parseFloat(newEntryAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a positive number for the amount.", variant: "destructive" });
      return;
    }
    
    // Find the targetId based on the selected category name
    const targetId = settings?.targets.find(t => t.category === newEntryCategory)?.id;
    if (!targetId) {
        toast({ title: "Invalid Category", description: `Could not find a target setting for the category "${newEntryCategory}". Please save your settings.`, variant: "destructive" });
        return;
    }

    const entryInput: FundEntryInput = {
        monthYear: monthYearKey,
        targetId: targetId,
        fundName: newEntryFundName.trim(),
        amount: amountNum,
        date: newEntryDate,
    };

    setIsSubmittingEntry(true);
    try {
      await addFundEntry(entryInput);
      toast({ title: "Investment Logged" });
      setNewEntryFundName('');
      setNewEntryAmount('');
      fetchData(); // Refresh data
      onDataChanged(); // Notify parent
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
  
  const handleAnalyze = async () => {
      if (!settings || !monthlyData || monthlyData.entries.length === 0) {
          toast({ title: "No Data to Analyze", description: "Please add some investment entries for this month first.", variant: "default" });
          return;
      }
      setIsAnalyzing(true);
      try {
          const totalInvested = monthlyData.entries.reduce((sum, entry) => sum + entry.amount, 0);
          const targetBreakdown = settings.targets.map(target => ({
              ...target,
              actualAmount: monthlyData.entries
                  .filter(entry => entry.targetId === target.id)
                  .reduce((sum, entry) => sum + entry.amount, 0),
          }));
          const fundEntries = monthlyData.entries.map(entry => {
              const target = settings.targets.find(t => t.id === entry.targetId);
              return { fundName: entry.fundName, amount: entry.amount, category: target?.category || 'Other' };
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

  if (isLoading) {
    return <Card className={cn("shadow-lg", glowClass)}><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>;
  }
  
  if (!settings) {
    return <Card className={cn("shadow-lg", glowClass)}><CardContent><p className="text-muted-foreground p-4 text-center">Could not load investment settings.</p></CardContent></Card>;
  }

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart className="h-6 w-6 text-accent" /> Monthly Investment Tracker
          </CardTitle>
          <CardDescription>
            Log your monthly investments against your targets. Configure targets in the settings section below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            
            <Accordion type="single" collapsible>
                <AccordionItem value="settings">
                    <AccordionTrigger>
                        <div className="flex items-center gap-2 font-semibold text-primary">
                            <Settings className="h-5 w-5"/>
                            Investment Settings
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 space-y-4">
                        <div className="p-3 border rounded-lg bg-background/50 space-y-3">
                            <div>
                                <Label htmlFor="monthly-target-input">Overall Monthly Target (₹)</Label>
                                <Input id="monthly-target-input" type="number" value={editableSettings.monthlyTarget || ''} onChange={e => handleSettingsChange('monthlyTarget', parseFloat(e.target.value) || 0)} className="h-9 text-sm mt-1" />
                            </div>
                            <Separator/>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {editableSettings.targets?.map((target, index) => (
                                    <div key={target.id}>
                                        <Label htmlFor={`target-input-${target.id}`}>{target.category} Target (₹)</Label>
                                        <Input id={`target-input-${target.id}`} type="number" value={target.targetAmount} onChange={e => handleTargetChange(index, e.target.value)} className="h-9 text-sm mt-1" />
                                    </div>
                                ))}
                            </div>
                            <Button onClick={handleSaveSettings} disabled={isSavingSettings} size="sm" withMotion>
                                {isSavingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Settings
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            
            {/* Overall Progress */}
            <div>
                <div className="flex justify-between items-baseline mb-1">
                    <p className="font-semibold text-primary">Overall Monthly Progress</p>
                    <p className="text-sm font-bold text-primary">₹{totalInvested.toLocaleString()} / <span className="text-muted-foreground">₹{settings.monthlyTarget.toLocaleString()}</span></p>
                </div>
                <Progress value={settings.monthlyTarget > 0 ? (totalInvested / settings.monthlyTarget) * 100 : 0} />
            </div>

            {/* Targets Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {settings.targets.map(target => {
                    const investedInTarget = monthlyData?.entries
                        .filter(e => e.targetId === target.id)
                        .reduce((sum, e) => sum + e.amount, 0) || 0;
                    const progress = target.targetAmount > 0 ? (investedInTarget / target.targetAmount) * 100 : 0;
                    return (
                        <div key={target.id} className="p-3 rounded-lg border bg-background/50">
                             <div className="flex justify-between items-baseline text-sm mb-1">
                                <span className="font-semibold text-foreground truncate" title={target.name}>{target.name}</span>
                                <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={progress} indicatorClassName={cn(progressColors[target.category] || "bg-gray-500")} className="h-2" />
                            <p className="text-right font-semibold text-xs text-primary mt-1">₹{investedInTarget.toLocaleString()} / <span className="text-muted-foreground">₹{target.targetAmount.toLocaleString()}</span></p>
                        </div>
                    );
                })}
            </div>

            <Separator />

            {/* New Entry Form */}
            <div className="space-y-3 p-3 border rounded-lg bg-background/50">
                <h4 className="font-semibold text-primary">Log New Investment</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <Label htmlFor="fund-name" className="text-xs">Fund Name</Label>
                        <Input id="fund-name" value={newEntryFundName} onChange={e => setNewEntryFundName(e.target.value)} placeholder="e.g., Parag Parikh Flexi" className="h-9 text-sm mt-1" />
                    </div>
                     <div>
                        <Label htmlFor="fund-category" className="text-xs">Category</Label>
                        <Select value={newEntryCategory} onValueChange={(val) => setNewEntryCategory(val as InvestmentCategory)}>
                            <SelectTrigger id="fund-category" className="h-9 text-sm mt-1"><SelectValue placeholder="Select Category" /></SelectTrigger>
                            <SelectContent>{settings.targets.map(t => <SelectItem key={t.id} value={t.category}>{t.category}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                     <div>
                        <Label htmlFor="fund-amount" className="text-xs">Amount (₹)</Label>
                        <Input id="fund-amount" type="number" value={newEntryAmount} onChange={e => setNewEntryAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="fund-date" className="text-xs">Date</Label>
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

            {/* Logged Entries & AI Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <h4 className="font-semibold text-primary mb-2">Logged Entries for {monthYearKey}</h4>
                     {monthlyData && monthlyData.entries.length > 0 ? (
                        <ScrollArea className="h-48 border rounded-md p-2 bg-background/50">
                           <ul className="space-y-2">
                                {monthlyData.entries.map(entry => (
                                   <li key={entry.id} className="flex justify-between items-center text-sm p-1.5 rounded hover:bg-accent/5">
                                       <div>
                                           <p className="font-medium">{entry.fundName}</p>
                                           <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "dd MMM, yyyy")}</p>
                                       </div>
                                       <div className="flex items-center gap-2">
                                           <span className="font-semibold">₹{entry.amount.toLocaleString()}</span>
                                           <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70" onClick={() => handleDeleteEntry(entry.id)} disabled={isDeletingEntry === entry.id}>
                                                {isDeletingEntry === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                           </Button>
                                       </div>
                                   </li> 
                                ))}
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

    
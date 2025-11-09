
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from "framer-motion";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import { getInvestmentAnalysisForMonth, saveInvestmentAnalysis } from '@/lib/actions/investment-analysis';
import { analyzeInvestments, type InvestmentAnalysisOutput } from '@/ai/flows/investment-analyzer-flow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BarChart, BrainCircuit, Save, Loader2, Wand2, Star, AlertTriangle } from "lucide-react";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";
const progressColors: { [key: string]: string } = {
  Equity: "bg-blue-500",
  Debt: "bg-green-500",
  Gold: "bg-yellow-500",
  "US Stocks": "bg-red-500",
  Crypto: "bg-purple-500",
  Other: "bg-gray-500",
};

export function InvestmentAnalysis() {
  const { selectedMonth, selectedYear } = useDateSelection();
  const { toast } = useToast();

  const [notes, setNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<InvestmentAnalysisOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const monthYearKey = useMemo(() => `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`, [selectedYear, selectedMonth]);

  const fetchDataForMonth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getInvestmentAnalysisForMonth(monthYearKey);
      setNotes(data?.investmentNotes || "");
      setAiAnalysis(data?.aiAnalysis || null);
    } catch (err) {
      console.error(`Failed to fetch investment analysis for ${monthYearKey}:`, err);
      setError("Could not load investment data for this month.");
      toast({ title: "Error", description: "Could not load investment data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [monthYearKey, toast]);

  useEffect(() => {
    fetchDataForMonth();
  }, [fetchDataForMonth]);

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      await saveInvestmentAnalysis(monthYearKey, { investmentNotes: notes });
      toast({ title: "Notes Saved", description: "Your investment notes have been saved for this month." });
    } catch (err: any) {
      console.error("Failed to save notes:", err);
      toast({ title: "Save Error", description: err.message || "Could not save notes.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!notes.trim()) {
      toast({ title: "Notes are empty", description: "Please enter your investment notes before analyzing.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const analysisResult = await analyzeInvestments({ investmentNotes: notes });
      setAiAnalysis(analysisResult);
      await saveInvestmentAnalysis(monthYearKey, { investmentNotes: notes, aiAnalysis: analysisResult });
      toast({ title: "Analysis Complete", description: "Your investment analysis has been generated and saved." });
    } catch (err: any) {
      console.error("Failed to analyze investments:", err);
      const errorMessage = err.message || "An unexpected error occurred during analysis.";
      setError(errorMessage);
      toast({ title: "Analysis Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart className="h-6 w-6 text-accent" /> Monthly Investment Journal & AI Analysis
          </CardTitle>
          <CardDescription>
            Log your investments for the month and get an AI-powered breakdown and rating.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Side: Manual Notes */}
          <div className="space-y-4">
            <h3 className="font-semibold text-primary">Your Investment Notes</h3>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Textarea
                placeholder="Log your investments for the month here. E.g.&#10;- Parag Parikh Flexi Cap (Equity): ₹5000&#10;- UTI Nifty 50 Index Fund (Equity): ₹3000&#10;- ICICI Pru Liquid Fund (Debt): ₹10000&#10;- SGB Gold Bond: ₹2000"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="bg-background/50 border-primary/20 focus:border-accent focus:ring-accent"
              />
            )}
            <div className="flex gap-2">
              <Button onClick={handleSaveNotes} disabled={isSaving || isLoading} className="w-full sm:w-auto" withMotion>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Notes
              </Button>
              <Button onClick={handleAnalyze} disabled={isAnalyzing || isLoading || !notes.trim()} className="w-full sm:w-auto bg-accent text-accent-foreground" withMotion>
                {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Analyze with AI
              </Button>
            </div>
          </div>

          {/* Right Side: AI Analysis */}
          <div className="space-y-4">
             <h3 className="font-semibold text-primary flex items-center gap-2"><BrainCircuit className="text-accent" /> AI-Powered Analysis</h3>
             
             {isAnalyzing && (
                 <div className="p-4 border rounded-lg bg-background/50 space-y-3">
                     <Skeleton className="h-5 w-3/4" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-4/5" />
                     <p className="text-center text-muted-foreground text-sm pt-2">AI is analyzing your investments...</p>
                 </div>
             )}

             {error && !isAnalyzing && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Analysis Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
             )}

             {!isAnalyzing && !error && !aiAnalysis && (
                <div className="p-4 border rounded-lg bg-background/50 text-center text-muted-foreground">
                    <p>Your AI analysis will appear here once generated.</p>
                </div>
             )}

             {aiAnalysis && !isAnalyzing && !error && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 border rounded-lg bg-accent/5 border-accent/20 space-y-4"
                >
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Investment</p>
                            <p className="text-2xl font-bold text-primary">₹{aiAnalysis.totalInvestment.toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={cn("h-5 w-5", i < aiAnalysis.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30")} />
                                ))}
                            </div>
                             <p className="text-xs text-muted-foreground mt-1">AI Rating: {aiAnalysis.rating}/5</p>
                        </div>
                    </div>
                    
                    <p className="text-sm italic text-foreground/80 border-t border-accent/10 pt-2">{aiAnalysis.justification}</p>

                    <div className="space-y-3">
                        {aiAnalysis.categoryAllocations.map(cat => (
                            <div key={cat.category}>
                                <div className="flex justify-between items-baseline text-sm mb-1">
                                    <span className="font-semibold">{cat.category}</span>
                                    <span className="text-muted-foreground">{cat.percentage.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2.5">
                                    <div className={cn("h-2.5 rounded-full", progressColors[cat.category] || "bg-gray-500")} style={{ width: `${cat.percentage}%` }}></div>
                                </div>
                                <ul className="text-xs mt-1 pl-2 space-y-0.5">
                                    {cat.allocations.map(alloc => (
                                        <li key={alloc.name} className="flex justify-between">
                                            <span className="text-muted-foreground truncate pr-2" title={alloc.name}>- {alloc.name}</span>
                                            <span className="font-medium">₹{alloc.amount.toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </motion.div>
             )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

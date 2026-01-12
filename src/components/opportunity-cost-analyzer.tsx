
"use client";

import { useState } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BrainCircuit, Loader2, Wand2, AlertTriangle, Lightbulb, Briefcase, TrendingUp, Sparkles } from "lucide-react";
import { Skeleton } from './ui/skeleton';
import { OpportunityCostInput, OpportunityCostOutput } from '@/lib/types';
import { analyzeOpportunityCost } from '@/ai/flows/opportunity-cost-analysis-flow';
import { useAIModel } from '@/contexts/AIModelContext';
import { ModelInfoBadge } from './model-info-badge';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

interface OpportunityCostAnalyzerProps {
  averageMonthlyIncome?: number;
}

export function OpportunityCostAnalyzer({ averageMonthlyIncome }: OpportunityCostAnalyzerProps) {
  const { toast } = useToast();
  const [itemName, setItemName] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [userIncome, setUserIncome] = useState(averageMonthlyIncome?.toString() || '');
  
  const [analysis, setAnalysis] = useState<OpportunityCostOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedModel } = useAIModel();

  const handleAnalyze = async () => {
    const costNum = parseFloat(itemCost);
    const incomeNum = parseFloat(userIncome);

    if (!itemName.trim() || isNaN(costNum) || costNum <= 0) {
      toast({ title: "Invalid Input", description: "Please enter a valid item name and a positive cost.", variant: "destructive" });
      return;
    }
    if (isNaN(incomeNum) || incomeNum <= 0) {
        toast({ title: "Invalid Income", description: "Please provide your monthly income for an accurate analysis.", variant: "destructive" });
        return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    const input: OpportunityCostInput = {
      itemName,
      itemCost: costNum,
      userIncome: incomeNum,
      model: selectedModel,
    };

    try {
      const result = await analyzeOpportunityCost(input);
      setAnalysis(result);
    } catch (err: any) {
      console.error("Error analyzing opportunity cost:", err);
      setError(err.message || "Failed to get AI analysis. Please try again.");
      toast({ title: "AI Analysis Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BrainCircuit className="h-6 w-6 text-accent" /> AI Opportunity Cost Analyzer
          </CardTitle>
          <CardDescription>
            Before you buy a 'want', see what it really costs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 p-4 border rounded-lg bg-background/50 border-primary/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-name">"Want" Item Name</Label>
                <Input id="item-name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., New Gaming Mouse, Designer Bag" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="item-cost">Item Cost (₹)</Label>
                <Input id="item-cost" type="number" value={itemCost} onChange={(e) => setItemCost(e.target.value)} placeholder="e.g., 5000" className="mt-1" />
              </div>
            </div>
            <div>
                <Label htmlFor="user-income">Your Monthly Income (₹)</Label>
                <Input id="user-income" type="number" value={userIncome} onChange={(e) => setUserIncome(e.target.value)} placeholder="e.g., 80000" className="mt-1" />
                {!averageMonthlyIncome && <p className="text-xs text-muted-foreground mt-1">Provide your income for an accurate time-cost calculation.</p>}
            </div>
            <Button onClick={handleAnalyze} disabled={isLoading} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" withMotion>
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
              {isLoading ? 'Analyzing...' : 'Analyze Purchase'}
            </Button>
          </div>

          {isLoading && (
            <div className="p-4 border rounded-lg bg-background/50 border-accent/20">
              <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg text-accent">AI is calculating the true cost...</CardTitle>
                <ModelInfoBadge model={selectedModel} />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4 bg-muted" />
                <Skeleton className="h-4 w-full bg-muted" />
                <Skeleton className="h-4 w-5/6 bg-muted" />
              </div>
            </div>
          )}

          {error && !isLoading && (
            <Alert variant="destructive" className="shadow-md">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>AI Analysis Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {analysis && !isLoading && !error && (
            <div className="p-4 border rounded-lg bg-accent/10 border-accent/30 space-y-4">
              <div className="flex justify-between items-center">
                 <CardTitle className="text-lg text-accent dark:text-accent-foreground">FinWise AI Analysis: '{itemName}'</CardTitle>
                 {analysis.model && <ModelInfoBadge model={analysis.model}/>}
              </div>
             
              <div className="p-3 rounded-md bg-background/70 shadow-inner">
                <h4 className="font-semibold text-primary flex items-center gap-2"><Briefcase className="h-4 w-4" /> Time Cost</h4>
                <p className="text-foreground/90">{analysis.timeCost}</p>
              </div>

              <div className="p-3 rounded-md bg-background/70 shadow-inner">
                <h4 className="font-semibold text-primary flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Investment Alternative</h4>
                <p className="text-foreground/90">{analysis.investmentAlternative}</p>
              </div>
              
              <div className="p-3 rounded-md bg-background/70 shadow-inner">
                <h4 className="font-semibold text-primary flex items-center gap-2"><Sparkles className="h-4 w-4" /> Alternative Uses</h4>
                <ul className="list-disc list-inside space-y-1 mt-1 text-foreground/90">
                    {analysis.alternativeUses.map((use, index) => (
                        <li key={index}>{use}</li>
                    ))}
                </ul>
              </div>

               <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
                <h4 className="font-semibold text-primary flex items-center gap-2"><Lightbulb className="h-4 w-4" /> FinWise Verdict</h4>
                <p className="text-foreground/90 italic mt-1">{analysis.summary}</p>
              </div>

            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

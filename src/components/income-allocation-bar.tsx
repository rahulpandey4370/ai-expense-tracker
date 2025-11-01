
"use client";

import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { HandCoins, ShoppingBasket, TrendingUp, Wallet, Info } from "lucide-react";

interface IncomeAllocationBarProps {
  income: number;
  needs: number;
  wants: number;
  investments: number;
}

const glowClass = "shadow-[0_0_10px_hsl(var(--primary)/0.3)] dark:shadow-[0_0_15px_hsl(var(--primary)/0.5)]";

// New gradient-based segment configuration
const segmentConfig = {
  needs: { 
    name: "Needs", 
    gradient: "from-blue-400 to-blue-600", 
    icon: HandCoins, 
    ideal: "<=50%" 
  },
  wants: { 
    name: "Wants", 
    gradient: "from-purple-400 to-purple-600", 
    icon: ShoppingBasket, 
    ideal: "<=30%" 
  },
  investments: { 
    name: "Investments", 
    gradient: "from-yellow-400 to-yellow-600", 
    icon: TrendingUp, 
    ideal: ">=20%" 
  },
  savings: { 
    name: "Cash Savings", 
    gradient: "from-green-400 to-green-600", 
    icon: Wallet, 
    ideal: "Flexible" 
  },
};

export function IncomeAllocationBar({ income, needs, wants, investments }: IncomeAllocationBarProps) {
  if (income === 0) {
    return (
      <Card className={cn("shadow-lg border-primary/20", glowClass)}>
        <CardHeader>
          <CardTitle className="text-xl text-primary flex items-center gap-2"><Info className="text-accent" /> Monthly Income Allocation</CardTitle>
          <CardDescription>Visual breakdown of your income based on the 50/30/20 rule.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="text-center text-muted-foreground p-4">
                No income recorded for this month to display allocation.
            </div>
        </CardContent>
      </Card>
    )
  }

  const savings = Math.max(0, income - (needs + wants + investments));
  
  const segments = [
    { name: "Needs", percentage: (needs / income) * 100, value: needs, config: segmentConfig.needs },
    { name: "Wants", percentage: (wants / income) * 100, value: wants, config: segmentConfig.wants },
    { name: "Investments", percentage: (investments / income) * 100, value: investments, config: segmentConfig.investments },
    { name: "Cash Savings", percentage: (savings / income) * 100, value: savings, config: segmentConfig.savings },
  ].filter(segment => segment.percentage > 0.1); 

  return (
     <Card className={cn("shadow-xl border-2 border-primary/20 bg-background/80 backdrop-blur-sm", glowClass)}>
        <CardHeader>
          <CardTitle className="text-xl text-primary">Monthly Income Allocation</CardTitle>
          <CardDescription>A visual breakdown of where your income is going, with the 50/30/20 rule as a guideline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
            <TooltipProvider>
                <div className="w-full h-4 sm:h-5 flex rounded-full overflow-hidden bg-muted shadow-inner border border-primary/10">
                    {segments.map((segment) => (
                    <Tooltip key={segment.name}>
                        <TooltipTrigger asChild>
                        <motion.div
                            className={cn("h-full bg-gradient-to-r", segment.config.gradient)}
                            style={{ width: `${segment.percentage}%` }}
                            initial={{ width: 0 }}
                            animate={{ width: `${segment.percentage}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                        </TooltipTrigger>
                        <TooltipContent className="bg-background/80 backdrop-blur-sm border-primary/30">
                            <p className="font-bold">{segment.name}: ₹{segment.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                            <p>{segment.percentage.toFixed(1)}% of income</p>
                        </TooltipContent>
                    </Tooltip>
                    ))}
                </div>
            </TooltipProvider>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                {segments.map((segment) => (
                    <div key={segment.name} className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-primary/10 shadow-sm">
                        <segment.config.icon className={cn("w-5 h-5 shrink-0 bg-gradient-to-r rounded-full p-0.5 text-white", segment.config.gradient)} />
                        <div className="flex flex-col flex-grow">
                            <span className="text-muted-foreground text-xs">{segment.name}</span>
                            <div className="flex justify-between items-baseline">
                                <span className="font-semibold text-foreground">
                                    {segment.percentage.toFixed(1)}%
                                </span>
                                <span className="text-xs text-muted-foreground/80">(Ideal: {segment.config.ideal})</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </CardContent>
     </Card>
  );
}

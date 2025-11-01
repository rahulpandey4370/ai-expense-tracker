"use client";

import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { HandCoins, ShoppingBasket, TrendingUp, Wallet } from "lucide-react";

interface IncomeAllocationBarProps {
  income: number;
  needs: number;
  wants: number;
  investments: number;
}

const glowClass = "shadow-[0_0_8px_hsl(var(--primary)/0.2)] dark:shadow-[0_0_10px_hsl(var(--primary)/0.4)]";

export function IncomeAllocationBar({ income, needs, wants, investments }: IncomeAllocationBarProps) {
  if (income === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="text-xl text-primary">Monthly Income Allocation</CardTitle>
          <CardDescription>Visual breakdown of your income.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="text-center text-muted-foreground p-4">
                No income recorded for this month to display allocation.
            </div>
        </CardContent>
      </Card>
    )
  }

  const savings = income - (needs + wants + investments);
  
  const needsPercentage = (needs / income) * 100;
  const wantsPercentage = (wants / income) * 100;
  const investmentsPercentage = (investments / income) * 100;
  const savingsPercentage = (savings / income) * 100;

  const segments = [
    { name: "Needs", percentage: needsPercentage, value: needs, color: "bg-blue-500", icon: HandCoins, ideal: "50%" },
    { name: "Wants", percentage: wantsPercentage, value: wants, color: "bg-purple-500", icon: ShoppingBasket, ideal: "30% (Wants+Savings)" },
    { name: "Investments", percentage: investmentsPercentage, value: investments, color: "bg-indigo-500", icon: TrendingUp, ideal: "20%" },
    { name: "Cash Savings", percentage: savingsPercentage, value: savings, color: "bg-green-500", icon: Wallet, ideal: "30% (Wants+Savings)" },
  ].filter(segment => segment.percentage > 0.1); // Filter out very small or zero segments for cleaner visuals


  return (
     <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="text-xl text-primary">Monthly Income Allocation</CardTitle>
          <CardDescription>A visual breakdown of where your income is going this month, with the 50/30/20 rule as a guideline.</CardDescription>
        </CardHeader>
        <CardContent>
            <TooltipProvider>
                <div className="w-full h-8 flex rounded-full overflow-hidden bg-muted shadow-inner">
                    {segments.map((segment) => (
                    <Tooltip key={segment.name}>
                        <TooltipTrigger asChild>
                        <motion.div
                            className={cn("h-full", segment.color)}
                            style={{ width: `${segment.percentage}%` }}
                            initial={{ width: 0 }}
                            animate={{ width: `${segment.percentage}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                        </TooltipTrigger>
                        <TooltipContent>
                        <p className="font-bold">{segment.name}: ₹{segment.value.toLocaleString()}</p>
                        <p>{segment.percentage.toFixed(1)}% of income</p>
                        </TooltipContent>
                    </Tooltip>
                    ))}
                </div>
            </TooltipProvider>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                {segments.map((segment) => (
                    <div key={segment.name} className="flex items-center gap-2">
                        <segment.icon className={cn("w-4 h-4 shrink-0", segment.color.replace('bg-', 'text-'))} />
                        <div className="flex flex-col flex-grow">
                            <span className="text-muted-foreground text-xs">{segment.name}</span>
                            <div className="flex justify-between items-baseline">
                                <span className="font-semibold text-foreground">
                                    {segment.percentage.toFixed(1)}%
                                </span>
                                <span className="text-xs text-muted-foreground/80">(Ideal: {segment.ideal})</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </CardContent>
     </Card>
  );
}


"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Budget {
  id: string;
  name: string;
  budgetAmount: number;
  spentAmount: number;
}

interface BudgetTrackerCardProps {
  budgets: Budget[];
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--primary)/0.2)] dark:shadow-[0_0_10px_hsl(var(--primary)/0.4)]";

export function BudgetTrackerCard({ budgets }: BudgetTrackerCardProps) {
  if (!budgets || budgets.length === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-primary"><Target /> Monthly Budgets</CardTitle>
          <CardDescription>No budgets set for this month.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Budget tracking will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-primary"><Target /> Monthly Budgets</CardTitle>
          <CardDescription>Track your spending against your monthly limits.</CardDescription>
        </CardHeader>
        <CardContent>
          <motion.div 
            className="space-y-4"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            initial="hidden"
            animate="visible"
          >
            {budgets.map((budget) => {
              const progress = budget.budgetAmount > 0 ? (budget.spentAmount / budget.budgetAmount) * 100 : 0;
              const isOverBudget = progress > 100;
              const remainingAmount = budget.budgetAmount - budget.spentAmount;

              let progressColor = "bg-primary";
              if (progress > 80 && progress <= 100) progressColor = "bg-yellow-500";
              if (isOverBudget) progressColor = "bg-destructive";

              return (
                <motion.div key={budget.id} variants={itemVariants} className="space-y-1.5">
                  <div className="flex justify-between items-baseline text-sm">
                    <p className="font-medium text-foreground">{budget.name}</p>
                    <p className={cn("font-semibold", isOverBudget ? "text-destructive" : "text-muted-foreground")}>
                        ₹{budget.spentAmount.toLocaleString()} / ₹{budget.budgetAmount.toLocaleString()}
                    </p>
                  </div>
                  <Progress value={Math.min(progress, 100)} indicatorClassName={progressColor} />
                  <div className="flex justify-between items-baseline text-xs text-muted-foreground">
                    <span>{progress.toFixed(1)}% Used</span>
                    {isOverBudget ? (
                        <span className="text-destructive font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Over by ₹{Math.abs(remainingAmount).toLocaleString()}</span>
                    ) : (
                        <span>₹{remainingAmount.toLocaleString()} Left</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

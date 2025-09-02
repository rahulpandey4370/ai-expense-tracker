
"use client";

import { useEffect, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";

interface Budget {
  id: string;
  name: string;
  budgetAmount: number;
  spentAmount: number;
}

const thresholds = [100, 80, 50];

export function useBudgetAlerts(budgets: Budget[]) {
  const { toast } = useToast();
  const previousProgressRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Only run if notifications are supported and permission has been granted
    if (typeof window === 'undefined' || !("Notification" in window) || Notification.permission !== 'granted') {
      return;
    }

    const checkBudgetsAndNotify = () => {
      const newProgress: Record<string, number> = {};

      for (const budget of budgets) {
        const progress = budget.budgetAmount > 0 ? (budget.spentAmount / budget.budgetAmount) * 100 : 0;
        newProgress[budget.id] = progress;

        const prevProgress = previousProgressRef.current[budget.id] || 0;

        for (const threshold of thresholds) {
          if (progress >= threshold && prevProgress < threshold) {
            const message = `You've used ${progress.toFixed(0)}% of your ${budget.name} budget (₹${budget.spentAmount.toLocaleString()} / ₹${budget.budgetAmount.toLocaleString()}).`;
            
            // Show a toast as a primary, less intrusive notification
            toast({
                title: `Budget Alert: ${budget.name}`,
                description: message,
                variant: progress >= 100 ? "destructive" : "default",
            });

            // Also show a system notification
            new Notification('FinWise AI - Budget Alert', {
              body: message,
              icon: '/logo.png', // Make sure you have a logo in public folder
            });
          }
        }
      }
      
      // Update the ref for the next render
      previousProgressRef.current = newProgress;
    };

    checkBudgetsAndNotify();

  }, [budgets, toast]);
}

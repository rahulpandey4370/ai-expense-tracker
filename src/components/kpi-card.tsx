
"use client";

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  className?: string;
  valueClassName?: string;
  kpiKey: string; // e.g., 'totalIncome', 'totalExpenses'
  insightText: string;
  selectedMonth: number;
  selectedYear: number;
}

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

const cardVariants = {
  front: { rotateY: 0 },
  back: { rotateY: 180 },
};

export function KpiCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  className, 
  valueClassName,
  kpiKey,
  insightText,
  selectedMonth,
  selectedYear 
}: KpiCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const router = useRouter();

  const handleCardClick = () => {
    const queryParams = new URLSearchParams();
    queryParams.append('month', selectedMonth.toString());
    queryParams.append('year', selectedYear.toString());

    if (kpiKey === 'totalIncome') {
      queryParams.append('type', 'income');
    } else if (kpiKey === 'totalExpenses') {
      queryParams.append('type', 'expense');
    } else if (kpiKey === 'investmentPercentage') {
      queryParams.append('type', 'expense');
      queryParams.append('expenseType', 'investment_expense');
    } else if (kpiKey === 'cashbackInterests') {
      queryParams.append('type', 'income');
      // Further filtering by category for cashback/interests would ideally be handled on the transactions page
      // For simplicity, we'll just filter by income type here and rely on categories for specific items.
    }
    
    router.push(`/transactions?${queryParams.toString()}`);
  };

  return (
    <motion.div
      className="h-full perspective" // perspective class for 3D effect
      onHoverStart={() => setIsFlipped(true)}
      onHoverEnd={() => setIsFlipped(false)}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      <motion.div
        className={cn(
          "shadow-lg h-full flex flex-col relative preserve-3d w-full", 
          glowClass, 
          className
        )}
        variants={cardVariants}
        animate={isFlipped ? "back" : "front"}
        transition={{ duration: 0.6 }}
      >
        {/* Front of the card */}
        <motion.div 
          className="absolute w-full h-full backface-hidden bg-card rounded-lg border border-transparent" // Added border-transparent
        >
          <Card className="h-full flex flex-col border-none shadow-none"> {/* Removed border and shadow from inner card */}
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <Icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              <div className={cn("text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words", valueClassName)}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </div>
              {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
            </CardContent>
          </Card>
        </motion.div>

        {/* Back of the card */}
        <motion.div 
          className="absolute w-full h-full backface-hidden bg-accent/20 rounded-lg border border-accent/30 rotate-y-180"
          style={{ transform: 'rotateY(180deg)' }} // Ensure it's initially rotated
        >
           <Card className="h-full flex flex-col items-center justify-center p-4 border-none shadow-none bg-transparent"> {/* bg-transparent */}
            <CardTitle className="text-sm font-semibold text-center text-accent-foreground mb-2">Insight</CardTitle>
            <p className="text-xs text-center text-accent-foreground/90">{insightText}</p>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// Add these utility classes to your globals.css or a utility CSS file if not already present
// .perspective { perspective: 1000px; }
// .preserve-3d { transform-style: preserve-3d; }
// .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
// .rotate-y-180 { transform: rotateY(180deg); }
// (Or handle directly with Tailwind's transform utilities if preferred)

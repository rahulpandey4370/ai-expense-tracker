
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  className?: string;
  valueClassName?: string;
}

const glowClass = "shadow-[0_0_15px_hsl(var(--accent)/0.4)] dark:shadow-[0_0_15px_hsl(var(--accent)/0.5)]";

export function KpiCard({ title, value, icon: Icon, description, className, valueClassName }: KpiCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -3, transition: { duration: 0.2, ease: "easeOut" } }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 h-full", glowClass, className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold text-foreground", valueClassName)}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
          {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

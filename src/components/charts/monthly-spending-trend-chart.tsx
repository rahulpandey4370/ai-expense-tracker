
"use client"

import { useMemo } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { Transaction as AppTransaction } from "@/lib/types" // Changed to AppTransaction
import { subMonths, getMonth, getYear } from "date-fns"; // format removed as it's not used
import { cn } from "@/lib/utils";

interface MonthlySpendingTrendChartProps {
  transactions: AppTransaction[]; // Use AppTransaction
  numberOfMonths?: number;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function MonthlySpendingTrendChart({ transactions, numberOfMonths = 6 }: MonthlySpendingTrendChartProps) {
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();

    for (let i = numberOfMonths - 1; i >= 0; i--) {
      const targetDate = subMonths(today, i);
      const month = getMonth(targetDate);
      const year = getYear(targetDate);

      // Ensure date objects are being compared correctly
      const monthlySpending = transactions
        .filter(t => t.type === 'expense' && new Date(t.date).getMonth() === month && new Date(t.date).getFullYear() === year)
        .reduce((sum, t) => sum + t.amount, 0);
      
      data.push({
        name: `${monthNames[month]} '${String(year).slice(-2)}`,
        spending: monthlySpending,
      });
    }
    return data;
  }, [transactions, numberOfMonths]);

  const chartConfig = {
    spending: {
      label: "Spending (₹)",
      color: "hsl(var(--primary))",
    },
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Monthly Spending Trend</CardTitle>
          <CardDescription>Spending over the last {numberOfMonths} months.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">No transaction data available for trend analysis.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("shadow-lg", glowClass)}>
      <CardHeader>
        <CardTitle>Monthly Spending Trend</CardTitle>
        <CardDescription>Spending over the last {numberOfMonths} months.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value.slice(0, 6)} 
                className="fill-foreground" 
              />
              <YAxis
                tickFormatter={(value) => `₹${value / 1000}k`}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={50}
                className="fill-foreground" 
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent 
                    formatter={(value, name) => ([`₹${(value as number).toLocaleString()}`, chartConfig.spending.label])} 
                    indicator="line" 
                />}
              />
              <Line
                dataKey="spending"
                type="monotone"
                stroke={chartConfig.spending.color}
                strokeWidth={2}
                dot={{
                  fill: chartConfig.spending.color,
                }}
                activeDot={{
                  r: 6,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

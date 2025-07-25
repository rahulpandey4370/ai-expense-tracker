
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
import type { AppTransaction } from "@/lib/types" 
import { subMonths, getMonth, getYear } from "date-fns";
import { cn } from "@/lib/utils";

interface MonthlySpendingTrendChartProps {
  transactions: AppTransaction[]; 
  numberOfMonths?: number;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const glowClass = "shadow-card-glow";

export function MonthlySpendingTrendChart({ transactions, numberOfMonths = 6 }: MonthlySpendingTrendChartProps) {
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();

    for (let i = numberOfMonths - 1; i >= 0; i--) {
      const targetDate = subMonths(today, i);
      const month = getMonth(targetDate);
      const year = getYear(targetDate);

      const monthlySpending = transactions
        .filter(t => {
            const transactionDate = new Date(t.date);
            // Core Expenses: 'need' or 'want'
            return t.type === 'expense' && 
                   (t.expenseType === 'need' || t.expenseType === 'want') &&
                   transactionDate.getMonth() === month && 
                   transactionDate.getFullYear() === year;
        })
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
      label: "Core Spending (₹)",
      color: "hsl(var(--primary))",
    },
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
        <CardHeader>
          <CardTitle>Monthly Core Spending Trend</CardTitle>
          <CardDescription>Core spending over the last {numberOfMonths} months.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No transaction data available for trend analysis.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
      <CardHeader>
        <CardTitle>Monthly Core Spending Trend</CardTitle>
        <CardDescription>Core spending (Needs & Wants) over the last {numberOfMonths} months.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig} className="h-full w-full">
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


"use client"

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
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
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { Transaction } from "@/lib/types"
import { format, subMonths, getMonth, getYear } from "date-fns";
import { cn } from "@/lib/utils";

interface IncomeExpenseTrendChartProps {
  transactions: Transaction[];
  numberOfMonths?: number;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function IncomeExpenseTrendChart({ transactions, numberOfMonths = 6 }: IncomeExpenseTrendChartProps) {
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();

    for (let i = numberOfMonths - 1; i >= 0; i--) {
      const targetDate = subMonths(today, i);
      const month = getMonth(targetDate);
      const year = getYear(targetDate);

      const monthlyIncome = transactions
        .filter(t => t.type === 'income' && t.date.getMonth() === month && t.date.getFullYear() === year)
        .reduce((sum, t) => sum + t.amount, 0);
      
      const monthlyExpenses = transactions
        .filter(t => t.type === 'expense' && t.date.getMonth() === month && t.date.getFullYear() === year)
        .reduce((sum, t) => sum + t.amount, 0);
      
      data.push({
        name: `${monthNames[month]} '${String(year).slice(-2)}`,
        income: monthlyIncome,
        expense: monthlyExpenses,
      });
    }
    return data;
  }, [transactions, numberOfMonths]);

  const chartConfig = {
    income: {
      label: "Income (₹)",
      color: "hsl(var(--chart-2))", // Using a chart color
    },
    expense: {
      label: "Expense (₹)",
      color: "hsl(var(--chart-1))", // Using a chart color
    },
  }

  if (!transactions || transactions.length === 0) {
     return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Income vs. Expense Trend</CardTitle>
          <CardDescription>Comparison over the last {numberOfMonths} months.</CardDescription>
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
        <CardTitle>Income vs. Expense Trend</CardTitle>
        <CardDescription>Comparison over the last {numberOfMonths} months.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer data={chartData} margin={{left:12, right: 12}}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value.slice(0, 6)}
                className="fill-foreground" // Added fill for light mode
              />
              <YAxis 
                tickFormatter={(value) => `₹${value / 1000}k`} 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={50}
                className="fill-foreground" // Added fill for light mode
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent 
                    formatter={(value, name, props) => ([`₹${(value as number).toLocaleString()}`, chartConfig[name as keyof typeof chartConfig]?.label || name])}
                />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="income" fill={chartConfig.income.color} radius={4} />
              <Bar dataKey="expense" fill={chartConfig.expense.color} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

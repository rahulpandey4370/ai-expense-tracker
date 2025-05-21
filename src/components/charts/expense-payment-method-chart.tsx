
"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { AppTransaction } from "@/lib/types"; 
import { cn } from "@/lib/utils"

interface ExpensePaymentMethodChartProps {
  transactions: AppTransaction[]; 
  selectedMonthName: string;
  selectedYear: number;
  chartHeightClass?: string; // New prop
}

const glowClass = "shadow-chart-glow dark:shadow-chart-glow-dark";

export function ExpensePaymentMethodChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px] w-full" }: ExpensePaymentMethodChartProps) {
 const expenseData = transactions 
    .filter(t => t.type === 'expense' && t.paymentMethod && t.paymentMethod.name) 
    .reduce((acc, curr) => {
      const paymentMethodName = curr.paymentMethod!.name; 
      acc[paymentMethodName] = (acc[paymentMethodName] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expenseData).map(([name, expenses]) => ({
    name,
    expenses,
    fill: "hsl(var(--primary))", 
  }));
  
  const chartConfig = {
    expenses: {
      label: "Expenses (₹)",
      color: "hsl(var(--primary))",
    },
  }

  if (chartData.length === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Expenses by Payment Method</CardTitle>
          <CardDescription>Payment methods for {selectedMonthName} {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent className={cn("flex items-center justify-center", chartHeightClass || "h-[300px]")}>
          <p className="text-muted-foreground">No expense data for {selectedMonthName} {selectedYear}.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("shadow-lg", glowClass)}>
      <CardHeader>
        <CardTitle>Expenses by Payment Method</CardTitle>
        <CardDescription>Payment methods for {selectedMonthName} {selectedYear}.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className={chartHeightClass}>
          <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" dataKey="expenses" hide tickFormatter={(value) => `₹${value}`} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.length > 15 ? `${value.slice(0,12)}...` : value}
              className="text-xs fill-foreground"
              width={100} 
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={(value, name) => ([`₹${(value as number).toLocaleString()}`, name === 'expenses' ? chartConfig.expenses.label : name ])} />}
            />
            <Bar dataKey="expenses" radius={5} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          Breakdown of expenses by payment method for {selectedMonthName} {selectedYear}.
        </div>
      </CardFooter>
    </Card>
  )
}


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
import type { Transaction } from "@/lib/types"

interface ExpensePaymentMethodChartProps {
  transactions: Transaction[];
}

export function ExpensePaymentMethodChart({ transactions }: ExpensePaymentMethodChartProps) {
 const expenseData = transactions
    .filter(t => t.type === 'expense' && t.paymentMethod)
    .reduce((acc, curr) => {
      const paymentMethod = curr.paymentMethod!;
      acc[paymentMethod] = (acc[paymentMethod] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expenseData).map(([name, expenses]) => ({
    name,
    expenses,
    fill: "hsl(var(--primary))", // Use primary color for bars
  }));
  
  const chartConfig = {
    expenses: {
      label: "Expenses (₹)",
      color: "hsl(var(--primary))",
    },
  }

  if (chartData.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Expenses by Payment Method</CardTitle>
          <CardDescription>How you paid for your expenses this month.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">No expense data available for this period.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Expenses by Payment Method</CardTitle>
        <CardDescription>How you paid for your expenses this month.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="max-h-[300px] w-full">
          <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" dataKey="expenses" hide tickFormatter={(value) => `₹${value}`} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.length > 15 ? `${value.slice(0,12)}...` : value}
              className="text-xs"
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
          Breakdown of expenses by payment method.
        </div>
      </CardFooter>
    </Card>
  )
}

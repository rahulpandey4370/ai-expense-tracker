
"use client"

import { Pie, PieChart, Cell } from "recharts"
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
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { AppTransaction } from "@/lib/types"; 
import { cn } from "@/lib/utils"

interface ExpensePaymentMethodChartProps {
  transactions: AppTransaction[]; 
  selectedMonthName: string;
  selectedYear: number;
  chartHeightClass?: string;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
];

const glowClass = "shadow-chart-glow dark:shadow-chart-glow-dark";

export function ExpensePaymentMethodChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px] w-full" }: ExpensePaymentMethodChartProps) {
  const expenseData = transactions 
    .filter(t => t.type === 'expense' && t.paymentMethod && t.paymentMethod.name) 
    .reduce((acc, curr) => {
      const paymentMethodName = curr.paymentMethod!.name; 
      acc[paymentMethodName] = (acc[paymentMethodName] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expenseData)
    .map(([name, value]) => ({ name, value, fill: "" }))
    .sort((a,b) => b.value - a.value)
    .map((item, index) => ({...item, fill: CHART_COLORS[index % CHART_COLORS.length]}));
  
  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.name] = { label: item.name, color: item.fill };
    return acc;
  }, {} as any);

  const totalExpenses = chartData.reduce((sum, item) => sum + item.value, 0);

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
    <Card className={cn("flex flex-col shadow-lg", glowClass)}>
      <CardHeader className="items-center pb-0">
        <CardTitle>Expenses by Payment Method</CardTitle>
        <CardDescription>Payment methods for {selectedMonthName} {selectedYear}.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className={cn("mx-auto aspect-square", chartHeightClass)}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="name" formatter={(value) => `₹${(value as number).toLocaleString()}`} />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="30%"
              outerRadius="80%"
              strokeWidth={2}
            >
              {chartData.map((entry, index) => (
                 <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
             <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap justify-center"/>} />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm mt-auto">
        <div className="flex items-center gap-2 font-medium leading-none text-foreground">
          Total Expenses: ₹{totalExpenses.toLocaleString()}
        </div>
      </CardFooter>
    </Card>
  )
}

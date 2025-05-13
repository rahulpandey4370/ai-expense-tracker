"use client"

import { TrendingUp } from "lucide-react"
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
import type { Transaction } from "@/lib/types"

interface ExpenseCategoryChartProps {
  transactions: Transaction[];
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


export function ExpenseCategoryChart({ transactions }: ExpenseCategoryChartProps) {
  const expenseData = transactions
    .filter(t => t.type === 'expense' && t.category)
    .reduce((acc, curr) => {
      const category = curr.category!;
      acc[category] = (acc[category] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expenseData)
    .map(([name, value]) => ({ name, value, fill: "" }))
    .sort((a,b) => b.value - a.value) // Sort for consistent color assignment
    .map((item, index) => ({...item, fill: CHART_COLORS[index % CHART_COLORS.length]}));


  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.name] = { label: item.name, color: item.fill };
    return acc;
  }, {} as any);
  
  const totalExpenses = chartData.reduce((sum, item) => sum + item.value, 0);

  if (chartData.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Expenses by Category</CardTitle>
          <CardDescription>Distribution of your spending across categories this month.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">No expense data available for this period.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col shadow-lg">
      <CardHeader className="items-center pb-0">
        <CardTitle>Expenses by Category</CardTitle>
        <CardDescription>Distribution of your spending across categories this month.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[300px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="name" />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              strokeWidth={5}
            >
              {chartData.map((entry, index) => (
                 <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
             <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap justify-center" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
       <CardFooter className="flex-col gap-2 text-sm mt-auto">
        <div className="flex items-center gap-2 font-medium leading-none">
          Total Expenses: ${totalExpenses.toLocaleString()}
        </div>
        <div className="leading-none text-muted-foreground">
          Showing data for the current period.
        </div>
      </CardFooter>
    </Card>
  )
}

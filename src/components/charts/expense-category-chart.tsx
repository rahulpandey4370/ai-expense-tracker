
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
import type { AppTransaction } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ExpenseCategoryChartProps {
  transactions: AppTransaction[]; 
  selectedMonthName: string;
  selectedYear: number;
  chartHeightClass?: string; // New prop for dynamic height
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

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function ExpenseCategoryChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px]" }: ExpenseCategoryChartProps) {
  const expenseData = transactions
    .filter(t => t.type === 'expense' && t.category && t.category.name)
    .reduce((acc, curr) => {
      const categoryName = curr.category!.name; 
      acc[categoryName] = (acc[categoryName] || 0) + curr.amount;
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
          <CardTitle>Expenses by Category</CardTitle>
          <CardDescription>Spending distribution for {selectedMonthName} {selectedYear}.</CardDescription>
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
        <CardTitle>Expenses by Category</CardTitle>
        <CardDescription>Spending distribution for {selectedMonthName} {selectedYear}.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className={cn("mx-auto aspect-square", chartHeightClass)}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="name" formatter={(value, name, props) => ([`₹${(props.payload?.value as number || 0).toLocaleString()}`, name])} />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="30%" // Makes it a doughnut chart
              outerRadius="80%" // Control size
              strokeWidth={2}
              labelLine={false}
              // label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} // Example label
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
        <div className="flex items-center gap-2 font-medium leading-none text-foreground">
          Total Expenses: ₹{totalExpenses.toLocaleString()}
        </div>
        <div className="leading-none text-muted-foreground">
          Showing data for {selectedMonthName} {selectedYear}.
        </div>
      </CardFooter>
    </Card>
  )
}

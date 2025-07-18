
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

interface ExpenseTypeSplitChartProps {
  transactions: AppTransaction[];
  selectedMonthName: string;
  selectedYear: number;
  chartHeightClass?: string;
}

const CHART_COLORS_EXPENSE_TYPE = {
  need: "hsl(var(--chart-3))", 
  want: "hsl(var(--chart-4))", 
  investment: "hsl(var(--chart-2))", 
  other: "hsl(var(--muted))", 
};

const glowClass = "shadow-[var(--chart-glow-accent)]";

export function ExpenseTypeSplitChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px]" }: ExpenseTypeSplitChartProps) {
  const expenseData = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => {
      let expenseType = curr.expenseType || 'other';
      // Normalize 'investment_expense' to 'investment' for charting
      if (expenseType === 'investment_expense') {
          expenseType = 'investment';
      }
      acc[expenseType] = (acc[expenseType] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalExpenses = Object.values(expenseData).reduce((sum, value) => sum + value, 0);

  const chartData = Object.entries(expenseData)
    .map(([name, value]) => {
      const percentage = totalExpenses > 0 ? (value / totalExpenses) * 100 : 0;
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        name: displayName,
        value,
        percentage: parseFloat(percentage.toFixed(1)), // Store percentage
        fill: CHART_COLORS_EXPENSE_TYPE[name as keyof typeof CHART_COLORS_EXPENSE_TYPE] || CHART_COLORS_EXPENSE_TYPE.other,
      };
    })
    .sort((a, b) => b.value - a.value);


  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.name] = { 
      label: `${item.name} (${item.percentage}%)`, // Label for legend
      color: item.fill 
    };
    return acc;
  }, {} as any);

  const topExpenseType = chartData.length > 0 ? chartData[0] : null;

  if (chartData.length === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Expense Split (Need/Want/Investment)</CardTitle>
          <CardDescription>Distribution for {selectedMonthName} {selectedYear}.</CardDescription>
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
        <CardTitle>Expense Split (Need/Want/Investment)</CardTitle>
        <CardDescription>
          Distribution for {selectedMonthName} {selectedYear}.
          {topExpenseType && ` Top: ${topExpenseType.name} (${topExpenseType.percentage}%)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className={cn("mx-auto aspect-square", chartHeightClass)}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent 
                hideLabel 
                nameKey="name" 
                formatter={(value, name, props) => {
                  const percentage = props.payload?.percentage || 0;
                  return [`₹${(value as number || 0).toLocaleString()} (${percentage}%)`, name];
                }} 
              />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name" // This will be used by ChartLegendContent if not overridden
              innerRadius="30%"
              outerRadius="80%"
              strokeWidth={2}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <ChartLegend 
              content={<ChartLegendContent nameKey="name" formatter={(value, entry: any) => {
                 // entry.payload here is the actual item from chartData
                 const item = chartData.find(d => d.name === entry.payload.name);
                 return item ? `${item.name} (${item.percentage}%)` : value;
              }} />} 
              className="flex-wrap justify-center" 
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm mt-auto">
        <div className="flex items-center gap-2 font-medium leading-none text-foreground">
          Total Expenses: ₹{totalExpenses.toLocaleString()}
        </div>
        <div className="leading-none text-muted-foreground">
          Breakdown by expense type for {selectedMonthName} {selectedYear}.
        </div>
      </CardFooter>
    </Card>
  )
}

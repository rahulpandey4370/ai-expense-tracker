
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
  need: "hsl(var(--chart-3))", // Bluish
  want: "hsl(var(--chart-4))", // Orange-ish
  investment_expense: "hsl(var(--chart-2))", // Greenish
  other: "hsl(var(--muted))", // Muted for anything not categorized
};

const glowClass = "shadow-[var(--chart-glow-accent)]";

export function ExpenseTypeSplitChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px]" }: ExpenseTypeSplitChartProps) {
  const expenseData = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => {
      const expenseType = curr.expenseType || 'other';
      acc[expenseType] = (acc[expenseType] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const chartData = Object.entries(expenseData)
    .map(([name, value]) => ({
      name: name === 'investment_expense' ? 'Investment' : name.charAt(0).toUpperCase() + name.slice(1), // Capitalize and rename
      value,
      fill: CHART_COLORS_EXPENSE_TYPE[name as keyof typeof CHART_COLORS_EXPENSE_TYPE] || CHART_COLORS_EXPENSE_TYPE.other,
    }))
    .sort((a, b) => b.value - a.value);


  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.name] = { label: item.name, color: item.fill };
    return acc;
  }, {} as any);

  const totalExpenses = chartData.reduce((sum, item) => sum + item.value, 0);

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
        <CardDescription>Distribution for {selectedMonthName} {selectedYear}.</CardDescription>
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
              innerRadius="30%"
              outerRadius="80%"
              strokeWidth={2}
              labelLine={false}
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
          Breakdown by expense type for {selectedMonthName} {selectedYear}.
        </div>
      </CardFooter>
    </Card>
  )
}

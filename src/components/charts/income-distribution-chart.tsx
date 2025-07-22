
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

interface IncomeDistributionChartProps {
  transactions: AppTransaction[];
  selectedMonthName: string;
  selectedYear: number;
  chartHeightClass?: string;
}

const CHART_COLORS_INCOME_DIST = {
  "Needs": "hsl(var(--chart-4))",      // Orange-like
  "Wants": "hsl(var(--chart-1))",      // Teal-like
  "Investments": "hsl(var(--chart-2))", // Blue-like
  "Cash Savings": "hsl(var(--chart-3))", // Purple-like
};

const glowClass = "shadow-[var(--chart-glow-accent)]";

export function IncomeDistributionChart({ transactions, selectedMonthName, selectedYear, chartHeightClass = "max-h-[300px]" }: IncomeDistributionChartProps) {
  const investmentCategoryNames = ["Stocks", "Mutual Funds", "Recurring Deposit"];
  
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const needsSpending = transactions
    .filter(t => t.type === 'expense' && t.expenseType === 'need')
    .reduce((sum, t) => sum + t.amount, 0);

  const wantsSpending = transactions
    .filter(t => t.type === 'expense' && t.expenseType === 'want')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const investmentSpending = transactions
    .filter(t => t.type === 'expense' && (t.expenseType === 'investment' || (t.category && investmentCategoryNames.includes(t.category.name))))
    .reduce((sum, t) => sum + t.amount, 0);
    
  const totalSpending = needsSpending + wantsSpending + investmentSpending;
  const cashSavings = totalIncome - totalSpending;

  const chartData = [
    { name: "Needs", value: needsSpending },
    { name: "Wants", value: wantsSpending },
    { name: "Investments", value: investmentSpending },
    { name: "Cash Savings", value: Math.max(0, cashSavings) }, // Don't show negative savings in the chart
  ]
  .filter(item => item.value > 0) // Only show categories with spending/saving
  .map(item => {
    const percentage = totalIncome > 0 ? (item.value / totalIncome) * 100 : 0;
    return {
      ...item,
      percentage: parseFloat(percentage.toFixed(1)),
      fill: CHART_COLORS_INCOME_DIST[item.name as keyof typeof CHART_COLORS_INCOME_DIST],
    };
  });

  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.name] = { 
      label: `${item.name} (${item.percentage}%)`,
      color: item.fill 
    };
    return acc;
  }, {} as any);

  if (totalIncome === 0) {
    return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Income Distribution</CardTitle>
          <CardDescription>Allocation for {selectedMonthName} {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent className={cn("flex items-center justify-center", chartHeightClass || "h-[300px]")}>
          <p className="text-muted-foreground">No income data for {selectedMonthName} {selectedYear}.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col shadow-lg", glowClass)}>
      <CardHeader className="items-center pb-0">
        <CardTitle>Income Distribution</CardTitle>
        <CardDescription>
          Allocation of your income for {selectedMonthName} {selectedYear}.
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
            <ChartLegend 
              content={<ChartLegendContent nameKey="name" formatter={(value, entry: any) => {
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
          Total Income: ₹{totalIncome.toLocaleString()}
        </div>
        <div className="leading-none text-muted-foreground">
          Breakdown of your income allocation for {selectedMonthName} {selectedYear}.
        </div>
      </CardFooter>
    </Card>
  )
}


"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts"
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
  ChartLegendContent,
} from "@/components/ui/chart"
import type { MonthlySummary } from "@/app/yearly-overview/page"
import { cn } from "@/lib/utils"

interface MonthlyIncomeExpenseSavingsChartProps {
  monthlyData: MonthlySummary[];
}

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export function MonthlyIncomeExpenseSavingsChart({ monthlyData }: MonthlyIncomeExpenseSavingsChartProps) {
  const chartData = monthlyData.map(data => ({
    name: `${data.monthShortName} '${String(data.year).slice(-2)}`,
    income: data.totalIncome,
    spend: data.totalSpend,
    savings: data.totalSavings,
  }));

  const chartConfig = {
    income: { label: "Income (₹)", color: "hsl(var(--chart-2))" }, // Greenish
    spend: { label: "Spend (₹)", color: "hsl(var(--chart-1))" }, // Reddish
    savings: { label: "Savings (₹)", color: "hsl(var(--chart-3))" }, // Bluish/Purplish
  }

  if (!monthlyData || monthlyData.length === 0) {
     return (
      <Card className={cn("shadow-lg", glowClass)}>
        <CardHeader>
          <CardTitle>Monthly Financial Summary</CardTitle>
          <CardDescription>Income, spend, and savings per month.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">No data available for summary chart.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("shadow-lg", glowClass)}>
      <CardHeader>
        <CardTitle>Monthly Financial Summary</CardTitle>
        <CardDescription>Income, spend, and savings per month for {monthlyData[0]?.year}.</CardDescription>
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
                    formatter={(value, name, props) => ([`₹${(value as number).toLocaleString()}`, chartConfig[name as keyof typeof chartConfig]?.label || name])}
                />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="income" fill={chartConfig.income.color} radius={4} />
              <Bar dataKey="spend" fill={chartConfig.spend.color} radius={4} />
              <Bar dataKey="savings" fill={chartConfig.savings.color} radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

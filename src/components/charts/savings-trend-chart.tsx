
"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
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
import type { MonthlySummary } from "@/app/yearly-overview/page"
import { cn } from "@/lib/utils"

interface MonthlyFinancialTrendsChartProps {
  monthlyData: MonthlySummary[];
}

const glowClass = "shadow-card-glow";

export function SavingsTrendChart({ monthlyData }: MonthlyFinancialTrendsChartProps) {
  const chartData = monthlyData.map(data => ({
    name: `${data.monthShortName} '${String(data.year).slice(-2)}`,
    income: data.totalIncome,
    coreSpend: data.totalSpend - data.totalInvestment, // Core spend is total spend minus investments
    investment: data.totalInvestment,
    savings: data.totalSavings,
  }));

  const chartConfig = {
    income: {
      label: "Income (₹)",
      color: "hsl(var(--chart-2))", // Greenish
    },
    coreSpend: {
      label: "Core Spend (₹)",
      color: "hsl(var(--chart-5))", // Reddish/Orange
    },
    investment: {
        label: "Investments (₹)",
        color: "hsl(var(--chart-1))", // Teal/Blue
    },
    savings: {
      label: "Cash Savings (₹)",
      color: "hsl(var(--chart-3))", // Purple/Accent
    },
  }

  if (!monthlyData || monthlyData.length === 0) {
    return (
      <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
        <CardHeader>
          <CardTitle>Monthly Financial Trends</CardTitle>
          <CardDescription>Income, spending, investment, and savings trends.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No data available for trend chart.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
      <CardHeader>
        <CardTitle>Monthly Financial Trends</CardTitle>
        <CardDescription>Income, spending, investment, and savings for {monthlyData[0]?.year}.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
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
                    formatter={(value, name) => ([`₹${(value as number).toLocaleString()}`, chartConfig[name as keyof typeof chartConfig]?.label || String(name)])} 
                    indicator="line" 
                />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="income"
                type="monotone"
                stroke={chartConfig.income.color}
                strokeWidth={2}
                dot={{
                  fill: chartConfig.income.color,
                }}
                activeDot={{ r: 6 }}
              />
               <Line
                dataKey="coreSpend"
                type="monotone"
                stroke={chartConfig.coreSpend.color}
                strokeWidth={2}
                dot={{
                  fill: chartConfig.coreSpend.color,
                }}
                activeDot={{ r: 6 }}
              />
               <Line
                dataKey="investment"
                type="monotone"
                stroke={chartConfig.investment.color}
                strokeWidth={2}
                dot={{
                  fill: chartConfig.investment.color,
                }}
                activeDot={{ r: 6 }}
              />
              <Line
                dataKey="savings"
                type="monotone"
                stroke={chartConfig.savings.color}
                strokeWidth={3} // Make savings line thicker
                strokeDasharray="3 3"
                dot={{
                  fill: chartConfig.savings.color,
                  r: 5,
                }}
                activeDot={{
                  r: 7,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

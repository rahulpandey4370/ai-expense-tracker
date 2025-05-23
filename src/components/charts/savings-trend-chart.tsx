
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

interface SavingsTrendChartProps {
  monthlyData: MonthlySummary[];
}

const glowClass = "shadow-card-glow";

export function SavingsTrendChart({ monthlyData }: SavingsTrendChartProps) {
  // totalSavings here is Income - Core Spend
  const chartData = monthlyData.map(data => ({
    name: `${data.monthShortName} '${String(data.year).slice(-2)}`,
    savings: data.totalSavings, 
  }));

  const chartConfig = {
    savings: {
      label: "Savings (Income - Core Spend) (₹)",
      color: "hsl(var(--chart-4))", 
    },
  }

  if (!monthlyData || monthlyData.length === 0) {
    return (
      <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
        <CardHeader>
          <CardTitle>Monthly Savings Trend</CardTitle>
          <CardDescription>Savings (Income - Core Spend) trend over the months.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No data available for savings trend.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("shadow-lg h-full flex flex-col", glowClass)}>
      <CardHeader>
        <CardTitle>Monthly Savings Trend</CardTitle>
        <CardDescription>Savings (Income - Core Spend) trend for {monthlyData[0]?.year}.</CardDescription>
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
                    formatter={(value) => `₹${(value as number).toLocaleString()}`} 
                    indicator="line" 
                />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="savings"
                type="monotone"
                stroke={chartConfig.savings.color}
                strokeWidth={3}
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

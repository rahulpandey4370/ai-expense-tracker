
"use client"

import { useState } from "react"
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
} from "@/components/ui/chart"
import type { MonthlySummary } from "@/app/yearly-overview/page"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"


interface MonthlyFinancialTrendsChartProps {
  monthlyData: MonthlySummary[];
}

const glowClass = "shadow-card-glow";

const initialChartConfig = {
  income: {
    label: "Income",
    color: "hsl(140, 60%, 50%)", // Green
  },
  coreSpend: {
    label: "Core Spend",
    color: "hsl(0, 70%, 55%)", // Red
  },
  investment: {
    label: "Investments",
    color: "hsl(48, 90%, 55%)", // Yellow
  },
  savings: {
    label: "Cash Savings",
    color: "hsl(220, 80%, 60%)", // A new distinct blue
  },
};


export function SavingsTrendChart({ monthlyData }: MonthlyFinancialTrendsChartProps) {
  const [config, setConfig] = useState(initialChartConfig as typeof initialChartConfig & { [key: string]: { inactive?: boolean } });

  const toggleSeries = (key: string) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      [key]: {
        ...prevConfig[key],
        inactive: !prevConfig[key]?.inactive,
      }
    }));
  };

  const chartData = monthlyData.map(data => ({
    name: `${data.monthShortName} '${String(data.year).slice(-2)}`,
    income: data.totalIncome,
    coreSpend: data.totalSpend - data.totalInvestment,
    investment: data.totalInvestment,
    savings: data.totalSavings,
  }));

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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
            <div>
                <CardTitle>Monthly Financial Trends</CardTitle>
                <CardDescription>Income, spending, investment, and savings for {monthlyData[0]?.year}.</CardDescription>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2 sm:mt-0">
                {Object.entries(config).map(([key, value]) => (
                   <div key={key} className="flex items-center space-x-2">
                    <Switch
                        id={key}
                        checked={!value.inactive}
                        onCheckedChange={() => toggleSeries(key)}
                        style={{
                            '--switch-bg-checked': value.color,
                        } as React.CSSProperties}
                        className="data-[state=checked]:bg-[var(--switch-bg-checked)]"
                    />
                    <Label htmlFor={key} className="text-xs" style={{ color: value.inactive ? undefined : value.color }}>
                        {value.label}
                    </Label>
                    </div>
                ))}
            </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer
          config={config}
          className="h-full w-full"
        >
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
                tickFormatter={(value) => `₹${Number(value) / 1000}k`}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={50}
                className="fill-foreground" 
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent 
                    formatter={(value, name) => ([`₹${(value as number).toLocaleString()}`, config[name as keyof typeof config]?.label || String(name)])} 
                    indicator="line" 
                />}
              />
              {Object.keys(config).map((key) => {
                  const configItem = config[key as keyof typeof config];
                  if (configItem.inactive) return null;
                  return (
                    <Line
                      key={key}
                      dataKey={key}
                      type="monotone"
                      stroke={configItem.color}
                      strokeWidth={key === 'savings' ? 3 : 2}
                      strokeDasharray={key === 'savings' ? "3 3" : ""}
                      dot={{ fill: configItem.color, r: key === 'savings' ? 4 : 2 }}
                      activeDot={{ r: key === 'savings' ? 6 : 4 }}
                    />
                  )
              })}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

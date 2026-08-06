"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatCurrency, formatCurrencyCompact, formatNumberCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RankedDatum {
  name: string;
  value: number;
}

interface RankedBarChartProps {
  title: string;
  description?: string;
  data: RankedDatum[];
  /** Beyond this, the tail is folded into a single "Other" bar. */
  maxBars?: number;
  emptyMessage?: string;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * A sorted horizontal bar chart, used where the app previously drew donuts.
 *
 * A donut asks you to compare arc angles and match six near-identical teals to
 * a legend below the chart; with three of six slices under 6% that's simply
 * unreadable. A ranked bar chart puts the labels on the bars, sorts by size,
 * and makes "which is biggest / how much bigger" a length comparison — the one
 * visual judgement people are reliably good at.
 */
export function RankedBarChart({
  title,
  description,
  data,
  maxBars = 8,
  emptyMessage = "No data for this period.",
  footer,
  className,
}: RankedBarChartProps) {
  const sorted = [...data].filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  const shown = sorted.slice(0, maxBars);
  const rest = sorted.slice(maxBars);
  if (rest.length > 0) {
    shown.push({ name: `Other (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0) });
  }

  const total = sorted.reduce((s, d) => s + d.value, 0);

  if (shown.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-primary">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex h-[220px] items-center justify-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  // A single hue with a descending ramp: rank is already encoded by order and
  // length, so spending eight categorical colours on it just adds noise.
  const shade = (i: number) => `hsl(var(--chart-2) / ${Math.max(0.35, 1 - i * 0.09)})`;

  // ~34px per bar keeps labels legible without the card ballooning.
  const height = Math.max(180, shown.length * 34 + 40);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-primary">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="w-full" style={{ height }}>
          <BarChart
            accessibilityLayer
            data={shown}
            layout="vertical"
            margin={{ left: 4, right: 56, top: 4, bottom: 4 }}
            barCategoryGap={6}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={112}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--accent) / 0.08)' }}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => [
                    `${formatCurrency(Number(value))}${total > 0 ? ` · ${((Number(value) / total) * 100).toFixed(1)}%` : ''}`,
                    name,
                  ]}
                />
              }
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {shown.map((_, i) => <Cell key={i} fill={shade(i)} />)}
              {/* Value on the bar — no legend round-trip to read the chart. */}
              <LabelList
                dataKey="value"
                position="right"
                offset={6}
                className="fill-foreground"
                style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                formatter={(v: number) => formatCurrencyCompact(v)}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      {footer && <div className="px-6 pb-4 text-sm text-muted-foreground">{footer}</div>}
    </Card>
  );
}

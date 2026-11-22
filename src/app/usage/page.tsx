"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, Coins, Gauge, Loader2, Timer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, slimOnPhone } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RankedBarChart } from '@/components/charts/ranked-bar-chart';
import { read } from '@/lib/read-client';
import { financeKeys } from '@/hooks/use-finance-queries';
import { cn } from '@/lib/utils';
import type { Granularity, UsageRange, UsageTotals } from '@/lib/usage-report';

const glowClass = "shadow-[shadow:var(--card-glow)] dark:shadow-[shadow:var(--card-glow-dark)]";

const RANGES: { value: UsageRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
];

// Costs are small; show enough digits to be useful.
const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
const num = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className="text-xs text-muted-foreground">no earlier data</span>;
  const change = ((now - before) / before) * 100;
  const up = change > 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("text-xs", Math.abs(change) < 1 ? "text-muted-foreground" : good ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400")}>
      {up ? '▲' : change < 0 ? '▼' : ''} {Math.abs(change).toFixed(0)}% vs previous period
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, children }: { icon: typeof Coins; label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-1 p-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
        <p className="text-xl font-semibold tabular-nums text-foreground md:text-2xl">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  const [range, setRange] = useState<UsageRange>('30d');
  const [granularity, setGranularity] = useState<Granularity | 'auto'>('auto');
  const q = useQuery({
    queryKey: [...financeKeys.all, 'usage', range, granularity],
    queryFn: () => read('getUsageReport', range, granularity === 'auto' ? undefined : granularity),
    placeholderData: prev => prev,
  });
  const r = q.data;
  const t: UsageTotals | undefined = r?.totals;
  const per = r ? { day: 'day', week: 'week', month: 'month' }[r.granularity] : 'day';

  return (
    <main className="flex-1 space-y-6 bg-background/80 p-4 backdrop-blur-sm sm:p-6 lg:p-8 max-md:pb-24">
      <Card className={cn("rounded-xl border-2 border-primary/30 bg-card/90 shadow-xl", glowClass, slimOnPhone)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold text-primary md:text-3xl"><Gauge className="h-7 w-7 text-accent" />AI usage &amp; cost</CardTitle>
          <CardDescription>Every AI call the app makes: tokens, estimated cost, speed and errors, by model and feature.</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={range} onValueChange={v => setRange(v as UsageRange)}>
              <SelectTrigger className="w-[160px]" aria-label="Period"><SelectValue /></SelectTrigger>
              <SelectContent>{RANGES.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={granularity} onValueChange={v => setGranularity(v as Granularity | 'auto')}>
              <SelectTrigger className="w-[130px]" aria-label="Group by"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="day">Per day</SelectItem>
                <SelectItem value="week">Per week</SelectItem>
                <SelectItem value="month">Per month</SelectItem>
              </SelectContent>
            </Select>
            {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Updating" />}
          </div>
        </CardHeader>
      </Card>

      {q.isError && <p role="alert" className="text-sm text-destructive">Couldn&apos;t load usage: {(q.error as Error).message}</p>}
      {!r || !t ? (
        q.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key numbers">
            <Kpi icon={Coins} label="Estimated cost" value={usd(t.costUsd)}>
              <Delta now={t.costUsd} before={r.previous.costUsd} invert />
            </Kpi>
            <Kpi icon={Activity} label="AI calls" value={num(t.calls)} sub={`${t.errors} failed (${pct(t.errors, t.calls)}%)`}>
              <Delta now={t.calls} before={r.previous.calls} />
            </Kpi>
            <Kpi icon={Gauge} label="Tokens" value={num(t.inputTokens + t.outputTokens)}
              sub={`${num(t.inputTokens)} in · ${num(t.outputTokens)} out · ${pct(t.cachedTokens, t.inputTokens)}% of input cached`} />
            <Kpi icon={Timer} label="Avg response" value={secs(t.avgLatencyMs)} sub={`95% of calls under ${secs(t.p95LatencyMs)}`} />
          </section>

          <section className="grid grid-cols-3 gap-3" aria-label="Cost so far">
            {([['Today', r.windows.today], ['This week', r.windows.week], ['This month', r.windows.month]] as const).map(([label, v]) => (
              <div key={label} className="rounded-lg border bg-card/60 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-semibold tabular-nums">{usd(v)}</p>
              </div>
            ))}
          </section>

          {t.unpricedCalls > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t.unpricedCalls} call{t.unpricedCalls > 1 ? 's' : ''} used a model with no price in the catalog (Azure or Gemini), so the cost above leaves them out. Their tokens are counted.
            </p>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-primary">Cost per {per}</CardTitle>
                <CardDescription>Estimated, in US dollars</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ costUsd: { label: 'Cost', color: 'hsl(var(--chart-1))' } }} className="h-[220px] w-full">
                  <BarChart data={r.series} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} fontSize={11} />
                    <YAxis width={56} tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => usd(Number(v))} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="tabular-nums">{usd(Number(v))}</span>} />} />
                    <Bar dataKey="costUsd" fill="var(--color-costUsd)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-primary">Tokens per {per}</CardTitle>
                <CardDescription>Cached input is billed at about a tenth of the price</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    freshInput: { label: 'Input', color: 'hsl(var(--chart-2))' },
                    cachedInput: { label: 'Cached input', color: 'hsl(var(--chart-1))' },
                    output: { label: 'Output', color: 'hsl(var(--chart-3))' },
                  }}
                  className="h-[220px] w-full"
                >
                  <BarChart data={r.series} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} fontSize={11} />
                    <YAxis width={44} tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => num(Number(v))} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{name === 'freshInput' ? 'Input' : name === 'cachedInput' ? 'Cached input' : 'Output'}</span><span className="tabular-nums">{num(Number(v))}</span></span>} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="cachedInput" stackId="t" fill="var(--color-cachedInput)" maxBarSize={28} />
                    <Bar dataKey="freshInput" stackId="t" fill="var(--color-freshInput)" maxBarSize={28} />
                    <Bar dataKey="output" stackId="t" fill="var(--color-output)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <RankedBarChart
              title={t.costUsd > 0 ? 'Cost by model' : 'Calls by model'}
              data={r.byModel.map(m => ({ name: m.label, value: t.costUsd > 0 ? m.costUsd : m.calls }))}
              format={t.costUsd > 0 ? usd : num} formatCompact={t.costUsd > 0 ? usd : num}
              emptyMessage="No AI calls in this period."
            />
            <RankedBarChart
              title={t.costUsd > 0 ? 'Cost by feature' : 'Calls by feature'}
              data={r.byFeature.map(f => ({ name: f.feature, value: t.costUsd > 0 ? f.costUsd : f.calls }))}
              format={t.costUsd > 0 ? usd : num} formatCompact={t.costUsd > 0 ? usd : num}
              emptyMessage="No AI calls in this period."
            />
          </div>

          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-base text-primary">By model</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 pr-3 font-medium">Model</th><th className="pr-3 text-right font-medium">Calls</th><th className="pr-3 text-right font-medium">Input</th><th className="pr-3 text-right font-medium">Output</th><th className="pr-3 text-right font-medium">Cost</th><th className="pr-3 text-right font-medium">Avg time</th><th className="text-right font-medium">Failed</th></tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.byModel.map(m => (
                    <tr key={m.modelKey} className="border-t">
                      <td className="py-2 pr-3">{m.label}</td>
                      <td className="pr-3 text-right">{num(m.calls)}</td>
                      <td className="pr-3 text-right">{num(m.inputTokens)}</td>
                      <td className="pr-3 text-right">{num(m.outputTokens)}</td>
                      <td className="pr-3 text-right">{usd(m.costUsd)}</td>
                      <td className="pr-3 text-right">{secs(m.avgLatencyMs)}</td>
                      <td className="text-right">{Math.round(m.errorRate * 100)}%</td>
                    </tr>
                  ))}
                  {r.byModel.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No AI calls in this period.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-base text-primary">Latest calls</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 pr-3 font-medium">When</th><th className="pr-3 font-medium">Feature</th><th className="pr-3 font-medium">Model</th><th className="pr-3 text-right font-medium">Tokens in / out</th><th className="pr-3 text-right font-medium">Cost</th><th className="text-right font-medium">Time</th></tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.recent.map((c, i) => (
                    <tr key={i} className={cn("border-t", !c.ok && "text-destructive")}>
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(c.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="pr-3">{c.feature}{!c.ok && ' (failed)'}</td>
                      <td className="pr-3">{c.model}</td>
                      <td className="pr-3 text-right">{num(c.input)} / {num(c.output)}</td>
                      <td className="pr-3 text-right">{c.costUsd == null ? '—' : usd(c.costUsd)}</td>
                      <td className="text-right">{secs(c.latencyMs)}</td>
                    </tr>
                  ))}
                  {r.recent.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No AI calls in this period.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Costs are estimates from list prices in the model catalog (cached input at 10%). Your provider&apos;s bill is the final word. Tracking started on 22 Nov 2026.
          </p>
        </>
      )}
    </main>
  );
}

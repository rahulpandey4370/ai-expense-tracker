// Server-only: the Usage page's numbers, from ai_usage. Times are bucketed in IST.
import { getSupabase } from '@/lib/supabase';
import { ANTHROPIC_CATALOG, OPENAI_CATALOG } from '@/lib/model-catalog';
import { estimateCostUsd } from '@/lib/usage';

export type UsageRange = '7d' | '30d' | '90d' | 'mtd' | 'last-month' | '12m';
export type Granularity = 'day' | 'week' | 'month';

type Row = {
  created_at: string; feature: string; model_key: string; operation: string;
  input_tokens: number; cached_tokens: number; output_tokens: number; reasoning_tokens: number;
  cost_usd: number | null; latency_ms: number; ok: boolean; error: string | null;
};

export interface UsageTotals {
  costUsd: number; calls: number; inputTokens: number; cachedTokens: number; outputTokens: number;
  reasoningTokens: number; errors: number; avgLatencyMs: number; p95LatencyMs: number; unpricedCalls: number;
}
export interface UsageReport {
  range: UsageRange; granularity: Granularity; from: string; to: string;
  totals: UsageTotals; previous: UsageTotals;
  windows: { today: number; week: number; month: number }; // cost so far, USD
  series: { bucket: string; label: string; costUsd: number; calls: number; freshInput: number; cachedInput: number; output: number }[];
  byModel: { modelKey: string; label: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; avgLatencyMs: number; errorRate: number }[];
  byFeature: { feature: string; calls: number; tokens: number; costUsd: number }[];
  recent: { at: string; feature: string; model: string; input: number; output: number; costUsd: number | null; latencyMs: number; ok: boolean }[];
}

const IST = 5.5 * 3600_000;
const DAY = 86400_000;
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
const startOfIstDay = (t: number) => Date.parse(`${istDay(t)}T00:00:00Z`) - IST;

const LABELS = new Map([...OPENAI_CATALOG, ...ANTHROPIC_CATALOG].map(m => [m.id, m.label]));
const modelLabel = (key: string) => { const id = key.split('::').pop()!; return LABELS.get(id) ?? id; };

function bucketOf(t: number, g: Granularity): string {
  const d = new Date(t + IST);
  if (g === 'month') return d.toISOString().slice(0, 7);
  if (g === 'week') { const back = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}
function bucketLabel(b: string, g: Granularity): string {
  const d = new Date(`${b.length === 7 ? `${b}-01` : b}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = g === 'month' ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return d.toLocaleDateString('en-IN', opts);
}

function periodOf(range: UsageRange, now: number): { from: number; to: number; g: Granularity } {
  const today = startOfIstDay(now);
  const ist = new Date(now + IST);
  const monthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST;
  switch (range) {
    case '7d': return { from: today - 6 * DAY, to: now, g: 'day' };
    case '30d': return { from: today - 29 * DAY, to: now, g: 'day' };
    case '90d': return { from: today - 89 * DAY, to: now, g: 'week' };
    case 'mtd': return { from: monthStart, to: now, g: 'day' };
    case 'last-month': return { from: Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) - IST, to: monthStart - 1, g: 'day' };
    case '12m': return { from: Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 11, 1) - IST, to: now, g: 'month' };
  }
}

function totalsOf(rows: Row[]): UsageTotals {
  const lat = rows.map(r => r.latency_ms).sort((a, b) => a - b);
  return {
    costUsd: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    calls: rows.length,
    inputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
    cachedTokens: rows.reduce((s, r) => s + r.cached_tokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
    reasoningTokens: rows.reduce((s, r) => s + r.reasoning_tokens, 0),
    errors: rows.filter(r => !r.ok).length,
    avgLatencyMs: lat.length ? lat.reduce((s, x) => s + x, 0) / lat.length : 0,
    p95LatencyMs: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0,
    unpricedCalls: rows.filter(r => r.ok && r.cost_usd == null).length,
  };
}

// ponytail: sums in JS over the raw rows (fine for tens of thousands of calls);
// move to a SQL group-by if ai_usage grows past ~100k rows in a year.
async function rowsBetween(from: number, to: number): Promise<Row[]> {
  const out: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await getSupabase().from('ai_usage')
      .select('created_at, feature, model_key, operation, input_tokens, cached_tokens, output_tokens, reasoning_tokens, cost_usd, latency_ms, ok, error')
      .gte('created_at', new Date(from).toISOString()).lte('created_at', new Date(to).toISOString())
      .order('created_at', { ascending: false }).range(off, off + 999);
    if (error) throw new Error(`Could not read usage: ${error.message}`);
    // Rows saved before a model had a catalog price are priced now from their tokens.
    out.push(...((data ?? []) as Row[]).map(r => r.ok && r.cost_usd == null
      ? { ...r, cost_usd: estimateCostUsd(r.model_key, { input: r.input_tokens, cached: r.cached_tokens, output: r.output_tokens }) }
      : r));
    if (!data || data.length < 1000) return out;
  }
}

export async function getUsageReport(range: UsageRange = '30d', granularity?: Granularity): Promise<UsageReport> {
  const now = Date.now();
  const { from, to, g: auto } = periodOf(range, now);
  const g = granularity ?? auto;
  const prevFrom = from - (to - from);
  const ist = new Date(now + IST);
  const monthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST;
  const today = startOfIstDay(now);
  const weekStart = today - ((new Date(today + IST).getUTCDay() + 6) % 7) * DAY;

  const all = await rowsBetween(Math.min(prevFrom, monthStart, weekStart), Math.max(to, now));
  const at = (r: Row) => Date.parse(r.created_at);
  const rows = all.filter(r => at(r) >= from && at(r) <= to);
  const cost = (xs: Row[]) => xs.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  // Every bucket in the range, so quiet days show as zero rather than vanishing.
  const buckets = new Map<string, UsageReport['series'][number]>();
  for (let t = from; t <= to; t += DAY) {
    const b = bucketOf(t, g);
    if (!buckets.has(b)) buckets.set(b, { bucket: b, label: bucketLabel(b, g), costUsd: 0, calls: 0, freshInput: 0, cachedInput: 0, output: 0 });
  }
  for (const r of rows) {
    const s = buckets.get(bucketOf(at(r), g));
    if (!s) continue;
    s.costUsd += Number(r.cost_usd ?? 0); s.calls++;
    s.cachedInput += r.cached_tokens; s.freshInput += r.input_tokens - r.cached_tokens; s.output += r.output_tokens;
  }

  const group = <K extends string>(key: (r: Row) => K) => {
    const m = new Map<K, Row[]>();
    rows.forEach(r => m.set(key(r), [...(m.get(key(r)) ?? []), r]));
    return [...m.entries()];
  };

  return {
    range, granularity: g, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    totals: totalsOf(rows),
    previous: totalsOf(all.filter(r => at(r) >= prevFrom && at(r) < from)),
    windows: {
      today: cost(all.filter(r => at(r) >= today)),
      week: cost(all.filter(r => at(r) >= weekStart)),
      month: cost(all.filter(r => at(r) >= monthStart)),
    },
    series: [...buckets.values()],
    byModel: group(r => r.model_key).map(([modelKey, rs]) => {
      const t = totalsOf(rs);
      return { modelKey, label: modelLabel(modelKey), calls: t.calls, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: t.costUsd, avgLatencyMs: t.avgLatencyMs, errorRate: t.calls ? t.errors / t.calls : 0 };
    }).sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    byFeature: group(r => r.feature).map(([feature, rs]) => ({ feature, calls: rs.length, tokens: rs.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0), costUsd: cost(rs) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    recent: rows.slice(0, 25).map(r => ({ at: r.created_at, feature: r.feature, model: modelLabel(r.model_key), input: r.input_tokens, output: r.output_tokens, costUsd: r.cost_usd == null ? null : Number(r.cost_usd), latencyMs: r.latency_ms, ok: r.ok })),
  };
}

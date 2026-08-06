"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LayoutGrid, Rows3, Search, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import type { PortfolioAssetSummary, PortfolioAssetType } from '@/lib/types';
import { formatCurrencyWhole, formatCurrencyCompact, formatPercent, formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

type SortKey = 'value' | 'gain' | 'loss' | 'invested' | 'name' | 'weight';

const SORT_LABELS: Record<SortKey, string> = {
  value: 'Current value',
  gain: 'Best performers',
  loss: 'Worst performers',
  invested: 'Amount invested',
  weight: 'Portfolio weight',
  name: 'Name (A–Z)',
};

interface PortfolioHoldingsProps {
  summaries: PortfolioAssetSummary[];
  assetTypeLabels: Record<PortfolioAssetType, string>;
  assetTypeOrder: PortfolioAssetType[];
  renderCard: (summary: PortfolioAssetSummary) => React.ReactNode;
}

/**
 * Controls and framing for the holdings list.
 *
 * 68 holdings previously rendered as one uniform card grid — roughly 7,600px
 * of scroll in which a ₹2,000 position looked exactly like a ₹1.4L one, with
 * no way to sort, search, or see asset-class weight. This adds the three
 * things you actually want on opening a portfolio: what it's made of, what
 * moved, and a way to find one holding.
 */
export function PortfolioHoldings({
  summaries,
  assetTypeLabels,
  assetTypeOrder,
  renderCard,
}: PortfolioHoldingsProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [typeFilter, setTypeFilter] = useState<PortfolioAssetType | 'all'>('all');
  const [view, setView] = useState<'table' | 'cards'>('table');

  const totalValue = useMemo(
    () => summaries.reduce((s, x) => s + x.currentValue, 0),
    [summaries]
  );

  /** Asset-class weights — the first question anyone asks of a portfolio. */
  const allocation = useMemo(() => {
    const map = new Map<PortfolioAssetType, { value: number; count: number }>();
    for (const s of summaries) {
      const e = map.get(s.asset.assetType) ?? { value: 0, count: 0 };
      e.value += s.currentValue;
      e.count += 1;
      map.set(s.asset.assetType, e);
    }
    return assetTypeOrder
      .filter(t => map.has(t))
      .map(t => ({ type: t, ...map.get(t)!, share: totalValue > 0 ? (map.get(t)!.value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [summaries, assetTypeOrder, totalValue]);

  /** Biggest movers by percentage, ignoring positions with no P&L basis. */
  const movers = useMemo(() => {
    const withPnl = summaries.filter(s => s.netPnlPercent !== null && s.currentValue > 0);
    const sorted = [...withPnl].sort((a, b) => (b.netPnlPercent ?? 0) - (a.netPnlPercent ?? 0));
    return { best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() };
  }, [summaries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = summaries.filter(s => {
      if (typeFilter !== 'all' && s.asset.assetType !== typeFilter) return false;
      if (!q) return true;
      return s.asset.name.toLowerCase().includes(q)
        || (s.asset.symbol ?? '').toLowerCase().includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'gain': return (b.netPnlPercent ?? -Infinity) - (a.netPnlPercent ?? -Infinity);
        case 'loss': return (a.netPnlPercent ?? Infinity) - (b.netPnlPercent ?? Infinity);
        case 'invested': return b.totalInvested - a.totalInvested;
        case 'name': return a.asset.name.localeCompare(b.asset.name);
        case 'weight':
        case 'value':
        default: return b.currentValue - a.currentValue;
      }
    });
    return list;
  }, [summaries, query, sortKey, typeFilter]);

  return (
    <div className="space-y-4">
      {/* --- Allocation ------------------------------------------------- */}
      <Card className="bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-primary">
            <PieChart className="h-4 w-4 text-accent" />
            Allocation
          </CardTitle>
          <CardDescription className="text-xs">
            {formatCount(summaries.length)} holdings · {formatCurrencyWhole(totalValue)} total
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Single stacked bar reads faster than a donut for part-to-whole. */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {allocation.map((a, i) => (
              <div
                key={a.type}
                className="h-full"
                style={{
                  width: `${a.share}%`,
                  backgroundColor: `hsl(var(--chart-${(i % 5) + 1}))`,
                }}
                title={`${assetTypeLabels[a.type]}: ${formatPercent(a.share)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {allocation.map((a, i) => (
              <button
                key={a.type}
                onClick={() => setTypeFilter(prev => (prev === a.type ? 'all' : a.type))}
                className={cn(
                  'flex items-center gap-1.5 rounded px-1 text-xs transition-colors hover:bg-accent/10',
                  typeFilter === a.type && 'bg-accent/15 font-medium'
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(var(--chart-${(i % 5) + 1}))` }}
                />
                <span className="text-muted-foreground">{assetTypeLabels[a.type]}</span>
                <span className="tabular-nums font-medium text-foreground">{formatPercent(a.share, 0)}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* --- Movers ------------------------------------------------------ */}
      {(movers.best.length > 0 || movers.worst.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MoverStrip title="Top gainers" icon={TrendingUp} tone="up" items={movers.best} />
          <MoverStrip title="Biggest losers" icon={TrendingDown} tone="down" items={movers.worst} />
        </div>
      )}

      {/* --- Controls ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a holding…"
            aria-label="Search holdings"
            className="h-9 pl-8"
          />
        </div>

        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-[170px] text-xs" aria-label="Sort holdings">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <SelectItem key={k} value={k} className="text-xs">{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as PortfolioAssetType | 'all')}>
          <SelectTrigger className="h-9 w-[150px] text-xs" aria-label="Filter by asset class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All asset classes</SelectItem>
            {allocation.map(a => (
              <SelectItem key={a.type} value={a.type} className="text-xs">{assetTypeLabels[a.type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-md border">
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => setView('table')}
            aria-label="Table view"
            aria-pressed={view === 'table'}
          >
            <Rows3 className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'cards' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => setView('cards')}
            aria-label="Card view"
            aria-pressed={view === 'cards'}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {formatCount(visible.length)} of {formatCount(summaries.length)} holdings
      </p>

      {/* --- Holdings ----------------------------------------------------- */}
      {visible.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No holdings match “{query}”.
        </CardContent></Card>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map(s => <div key={s.asset.id}>{renderCard(s)}</div>)}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Holding</TableHead>
                <TableHead className="w-[110px] text-right text-xs">Value</TableHead>
                <TableHead className="hidden w-[110px] text-right text-xs sm:table-cell">Invested</TableHead>
                <TableHead className="w-[100px] text-right text-xs">P&L</TableHead>
                <TableHead className="hidden w-[70px] text-right text-xs md:table-cell">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(s => {
                const pct = s.netPnlPercent;
                const up = (pct ?? 0) >= 0;
                const weight = totalValue > 0 ? (s.currentValue / totalValue) * 100 : 0;
                return (
                  <TableRow key={s.asset.id} className="text-xs hover:bg-accent/5">
                    <TableCell className="py-2">
                      <Link
                        href={`/portfolio/${s.asset.id}`}
                        className="block truncate font-medium text-foreground hover:text-accent hover:underline"
                        title={s.asset.name}
                      >
                        {s.asset.name}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">
                        {assetTypeLabels[s.asset.assetType]}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right font-medium tabular-nums">
                      {formatCurrencyCompact(s.currentValue)}
                    </TableCell>
                    <TableCell className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatCurrencyCompact(s.totalInvested)}
                    </TableCell>
                    <TableCell className={cn(
                      'py-2 text-right font-medium tabular-nums',
                      pct === null ? 'text-muted-foreground'
                        : up ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                    )}>
                      {pct === null ? '—' : `${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
                    </TableCell>
                    <TableCell className="hidden py-2 text-right tabular-nums text-muted-foreground md:table-cell">
                      {weight.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function MoverStrip({
  title, icon: Icon, tone, items,
}: {
  title: string;
  icon: typeof TrendingUp;
  tone: 'up' | 'down';
  items: PortfolioAssetSummary[];
}) {
  if (items.length === 0) return null;
  const toneClass = tone === 'up'
    ? 'text-green-600 dark:text-green-500'
    : 'text-red-600 dark:text-red-500';

  return (
    <Card className="bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className={cn('flex items-center gap-1.5 text-xs font-semibold', toneClass)}>
          <Icon className="h-3.5 w-3.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pb-3">
        {items.map(s => (
          <Link
            key={s.asset.id}
            href={`/portfolio/${s.asset.id}`}
            className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/10"
          >
            <span className="truncate text-foreground" title={s.asset.name}>{s.asset.name}</span>
            <span className={cn('shrink-0 font-medium tabular-nums', toneClass)}>
              {(s.netPnlPercent ?? 0) >= 0 ? '+' : '−'}{Math.abs(s.netPnlPercent ?? 0).toFixed(1)}%
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

import type {
  PortfolioAsset,
  PortfolioAssetSummary,
  PortfolioDashboardData,
  PortfolioDashboardSummary,
  PortfolioTransaction,
  PortfolioValuation,
} from '@/lib/types';

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: string, end: string): number | null {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function transactionCashflow(tx: PortfolioTransaction): number {
  const extras = (tx.charges || 0) + (tx.taxes || 0);
  if (tx.type === 'buy' || tx.type === 'fee') return -(tx.amount + extras);
  return tx.amount - extras;
}

function xnpv(rate: number, cashflows: Array<{ amount: number; date: Date }>): number {
  const first = cashflows[0].date.getTime();
  return cashflows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - first) / (365 * 86_400_000);
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

export function calculateXirr(cashflows: Array<{ amount: number; date: string }>): number | null {
  const parsed = cashflows
    .map(cf => ({ amount: cf.amount, date: parseDate(cf.date) }))
    .filter((cf): cf is { amount: number; date: Date } => !!cf.date && Number.isFinite(cf.amount) && cf.amount !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (parsed.length < 2) return null;
  if (!parsed.some(cf => cf.amount < 0) || !parsed.some(cf => cf.amount > 0)) return null;
  if (parsed[0].date.getTime() === parsed[parsed.length - 1].date.getTime()) return null;

  let low = -0.9999;
  let high = 10;
  let lowValue = xnpv(low, parsed);
  let highValue = xnpv(high, parsed);

  // Expand the upper bound for unusually high returns.
  for (let i = 0; i < 20 && lowValue * highValue > 0; i++) {
    high *= 2;
    highValue = xnpv(high, parsed);
  }
  if (lowValue * highValue > 0) return null;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const midValue = xnpv(mid, parsed);
    if (Math.abs(midValue) < 0.000001) return mid;
    if (lowValue * midValue < 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  const result = (low + high) / 2;
  return Number.isFinite(result) ? result : null;
}

export function buildAssetSummary(
  asset: PortfolioAsset,
  allTransactions: PortfolioTransaction[],
  allValuations: PortfolioValuation[],
): PortfolioAssetSummary {
  const transactions = allTransactions
    .filter(tx => tx.assetId === asset.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const valuations = allValuations
    .filter(v => v.assetId === asset.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalOutflows = transactions
    .filter(tx => tx.type === 'buy' || tx.type === 'fee')
    .reduce((sum, tx) => sum + tx.amount + (tx.charges || 0) + (tx.taxes || 0), 0);
  const totalInflows = transactions
    .filter(tx => tx.type === 'sell' || tx.type === 'dividend' || tx.type === 'interest')
    .reduce((sum, tx) => sum + tx.amount - (tx.charges || 0) - (tx.taxes || 0), 0);
  const sellInflows = transactions
    .filter(tx => tx.type === 'sell')
    .reduce((sum, tx) => sum + tx.amount - (tx.charges || 0) - (tx.taxes || 0), 0);

  const latestValuation = valuations[0];
  const roughBookValue = Math.max(0, totalOutflows - sellInflows);
  const currentValue = latestValuation?.totalValue ?? roughBookValue;
  const netPnl = totalInflows + currentValue - totalOutflows;
  const netPnlPercent = totalOutflows > 0 ? (netPnl / totalOutflows) * 100 : null;

  const latestDate = latestValuation?.date || new Date().toISOString().slice(0, 10);
  const cashflows = transactions.map(tx => ({ amount: transactionCashflow(tx), date: tx.date }));
  if (currentValue > 0) cashflows.push({ amount: currentValue, date: latestDate });
  const xirr = calculateXirr(cashflows);

  const firstBuy = [...transactions]
    .filter(tx => tx.type === 'buy')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const holdingDays = firstBuy ? daysBetween(firstBuy.date, latestDate) : null;

  return {
    asset,
    transactions,
    valuations,
    totalInvested: totalOutflows,
    totalOutflows,
    totalInflows,
    currentValue,
    latestValuation,
    netPnl,
    netPnlPercent,
    xirr,
    holdingDays,
    transactionCount: transactions.length,
  };
}

export function buildPortfolioDashboardData(
  assets: PortfolioAsset[],
  transactions: PortfolioTransaction[],
  valuations: PortfolioValuation[],
): PortfolioDashboardData {
  const assetSummaries = assets
    .map(asset => buildAssetSummary(asset, transactions, valuations))
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalInvested = assetSummaries.reduce((sum, item) => sum + item.totalInvested, 0);
  const totalCurrentValue = assetSummaries.reduce((sum, item) => sum + item.currentValue, 0);
  const totalInflows = assetSummaries.reduce((sum, item) => sum + item.totalInflows, 0);
  const netPnl = totalInflows + totalCurrentValue - totalInvested;
  const netPnlPercent = totalInvested > 0 ? (netPnl / totalInvested) * 100 : null;
  const latestUpdateDate = [...valuations.map(v => v.date), ...transactions.map(t => t.date)].sort().at(-1);
  const portfolioCashflows = transactions.map(tx => ({ amount: transactionCashflow(tx), date: tx.date }));
  if (totalCurrentValue > 0) {
    portfolioCashflows.push({
      amount: totalCurrentValue,
      date: latestUpdateDate || new Date().toISOString().slice(0, 10),
    });
  }

  const comparable = assetSummaries.filter(item => item.netPnlPercent !== null && item.totalInvested > 0);
  const bestPerformer = comparable.length > 0
    ? comparable.reduce((best, item) => (item.netPnlPercent! > best.netPnlPercent! ? item : best), comparable[0])
    : undefined;
  const worstPerformer = comparable.length > 0
    ? comparable.reduce((worst, item) => (item.netPnlPercent! < worst.netPnlPercent! ? item : worst), comparable[0])
    : undefined;

  const summary: PortfolioDashboardSummary = {
    totalInvested,
    totalCurrentValue,
    totalInflows,
    netPnl,
    netPnlPercent,
    xirr: calculateXirr(portfolioCashflows),
    assetCount: assets.length,
    transactionCount: transactions.length,
    latestUpdateDate,
    bestPerformer,
    worstPerformer,
  };

  return { assets, transactions, valuations, assetSummaries, summary };
}

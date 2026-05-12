"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Camera,
  CircleDollarSign,
  Landmark,
  LineChart,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAIModel } from '@/contexts/AIModelContext';
import {
  addPortfolioEntry,
  getPortfolioDashboardData,
  parseAndApplyPortfolioEntry,
} from '@/lib/actions/portfolio';
import type {
  PortfolioAsset,
  PortfolioAssetSummary,
  PortfolioAssetType,
  PortfolioCurrency,
  PortfolioDashboardData,
  PortfolioEntryInput,
  PortfolioTransactionType,
} from '@/lib/types';

const glowClass = "shadow-[var(--card-glow)] dark:shadow-[var(--card-glow-dark)]";

const ASSET_TYPE_LABELS: Record<PortfolioAssetType, string> = {
  mutual_fund: 'Mutual Fund',
  indian_equity: 'Indian Equity',
  us_equity: 'US Equity',
  crypto: 'Crypto',
  gold: 'Gold',
  fd_rd: 'FD / RD',
  other: 'Other',
};

const ASSET_TYPE_ORDER: PortfolioAssetType[] = [
  'mutual_fund',
  'indian_equity',
  'us_equity',
  'crypto',
  'gold',
  'fd_rd',
  'other',
];

const TRANSACTION_LABELS: Record<PortfolioTransactionType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  interest: 'Interest',
  fee: 'Fee',
};

type EntryKind = 'transaction' | 'valuation';

type ManualFormState = {
  assetId: string;
  newAssetName: string;
  assetType: PortfolioAssetType;
  entryKind: EntryKind;
  transactionType: PortfolioTransactionType;
  date: string;
  amount: string;
  quantity: string;
  pricePerUnit: string;
  charges: string;
  taxes: string;
  currency: PortfolioCurrency;
  notes: string;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const emptyManualForm = (): ManualFormState => ({
  assetId: '__new',
  newAssetName: '',
  assetType: 'mutual_fund',
  entryKind: 'transaction',
  transactionType: 'buy',
  date: todayYmd(),
  amount: '',
  quantity: '',
  pricePerUnit: '',
  charges: '',
  taxes: '',
  currency: 'INR',
  notes: '',
});

function formatCurrency(value: number, currency: PortfolioCurrency = 'INR') {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

function formatXirr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export default function PortfolioPage() {
  const { toast } = useToast();
  const { selectedModel } = useAIModel();
  const [data, setData] = useState<PortfolioDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState<ManualFormState>(emptyManualForm());
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiAssetId, setAiAssetId] = useState('__auto');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getPortfolioDashboardData());
    } catch (err: any) {
      toast({ title: 'Could not load portfolio', description: err.message, variant: 'destructive' });
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assets = data?.assets || [];
  const groupedSummaries = useMemo(() => {
    const map: Record<PortfolioAssetType, PortfolioAssetSummary[]> = {
      mutual_fund: [],
      indian_equity: [],
      us_equity: [],
      crypto: [],
      gold: [],
      fd_rd: [],
      other: [],
    };
    for (const summary of data?.assetSummaries || []) {
      map[summary.asset.assetType].push(summary);
    }
    return map;
  }, [data]);

  const selectedAsset = assets.find(asset => asset.id === manualForm.assetId);
  const updateManual = <K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) => {
    setManualForm(current => {
      const next = { ...current, [key]: value };
      if (key === 'assetId') {
        const asset = assets.find(item => item.id === value);
        if (asset) {
          next.assetType = asset.assetType;
          next.currency = asset.currency;
        }
      }
      return next;
    });
  };

  const handleManualSubmit = async () => {
    const amount = parseOptionalNumber(manualForm.amount);
    const assetName = selectedAsset?.name || manualForm.newAssetName.trim();
    if (!assetName || !manualForm.date || !amount || amount <= 0) {
      toast({ title: 'Name, date, and amount are required.', variant: 'destructive' });
      return;
    }

    const base = {
      assetId: selectedAsset?.id,
      assetName,
      assetType: selectedAsset?.assetType || manualForm.assetType,
      date: manualForm.date,
      currency: selectedAsset?.currency || manualForm.currency,
      quantity: parseOptionalNumber(manualForm.quantity),
      pricePerUnit: parseOptionalNumber(manualForm.pricePerUnit),
      notes: manualForm.notes.trim() || undefined,
      source: 'manual' as const,
    };

    const payload: PortfolioEntryInput = manualForm.entryKind === 'valuation'
      ? {
          entryKind: 'valuation',
          ...base,
          totalValue: amount,
        }
      : {
          entryKind: 'transaction',
          ...base,
          type: manualForm.transactionType,
          amount,
          charges: parseOptionalNumber(manualForm.charges),
          taxes: parseOptionalNumber(manualForm.taxes),
        };

    setIsSavingManual(true);
    try {
      await addPortfolioEntry(payload);
      toast({ title: 'Portfolio entry saved' });
      setManualForm(emptyManualForm());
      setShowManualForm(false);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleAiSubmit = async () => {
    const text = aiText.trim();
    if (!text && !screenshotFile) {
      toast({ title: 'Add text or upload a screenshot first.', variant: 'destructive' });
      return;
    }

    setIsAiBusy(true);
    try {
      const imageDataUri = screenshotFile ? await fileToDataUri(screenshotFile) : undefined;
      const result = await parseAndApplyPortfolioEntry({
        text,
        imageDataUri,
        preferredAssetId: aiAssetId === '__auto' ? undefined : aiAssetId,
        model: selectedModel,
      });
      if (!result.ok) {
        toast({ title: "Couldn't add entry", description: result.reason, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Added with AI',
        description: result.summary || `${result.created.length} portfolio record(s) saved.`,
      });
      setAiText('');
      setScreenshotFile(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'AI import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAiBusy(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-background/30 backdrop-blur-sm">
        <div className="flex min-h-[60vh] items-center justify-center text-primary">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          Loading portfolio...
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn("shadow-xl border-primary/30 border-2 rounded-xl bg-card/90", glowClass)}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
                  <LineChart className="h-7 w-7 text-accent" />
                  Portfolio
                </CardTitle>
                <CardDescription>
                  Manual and AI-assisted investment ledger for funds, stocks, crypto, gold, and deposits.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchData}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
                <Button size="sm" onClick={() => setShowManualForm(value => !value)}>
                  <Plus className="h-4 w-4 mr-2" /> Entry
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <KpiGrid data={data} />
            <AiEntryCard
              assets={assets}
              aiText={aiText}
              setAiText={setAiText}
              aiAssetId={aiAssetId}
              setAiAssetId={setAiAssetId}
              screenshotFile={screenshotFile}
              setScreenshotFile={setScreenshotFile}
              isAiBusy={isAiBusy}
              onSubmit={handleAiSubmit}
            />
            {showManualForm && (
              <ManualEntryForm
                assets={assets}
                form={manualForm}
                update={updateManual}
                isSaving={isSavingManual}
                onCancel={() => {
                  setManualForm(emptyManualForm());
                  setShowManualForm(false);
                }}
                onSubmit={handleManualSubmit}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {assets.length === 0 ? (
        <Card className="bg-card/80">
          <CardContent className="py-12 text-center text-muted-foreground">
            No portfolio assets yet. Add one manually, describe a transaction in the AI box, or upload a screenshot.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {ASSET_TYPE_ORDER.filter(type => groupedSummaries[type].length > 0).map(type => (
            <section key={type} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{ASSET_TYPE_LABELS[type]}</h2>
                <Badge variant="secondary">{groupedSummaries[type].length}</Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupedSummaries[type].map(summary => (
                  <AssetCard key={summary.asset.id} summary={summary} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function KpiGrid({ data }: { data: PortfolioDashboardData | null }) {
  const summary = data?.summary;
  const cards = [
    {
      label: 'Current Value',
      value: formatCurrency(summary?.totalCurrentValue || 0),
      helper: summary?.latestUpdateDate ? `as of ${summary.latestUpdateDate}` : 'manual valuations',
      icon: Landmark,
    },
    {
      label: 'Total Invested',
      value: formatCurrency(summary?.totalInvested || 0),
      helper: 'buys + fees',
      icon: CircleDollarSign,
    },
    {
      label: 'Net P&L',
      value: formatCurrency(summary?.netPnl || 0),
      helper: formatPercent(summary?.netPnlPercent),
      icon: (summary?.netPnl || 0) >= 0 ? ArrowUpRight : ArrowDownRight,
      positive: (summary?.netPnl || 0) >= 0,
    },
    {
      label: 'Portfolio XIRR',
      value: formatXirr(summary?.xirr),
      helper: 'cashflow-based',
      icon: BarChart3,
    },
    {
      label: 'Assets',
      value: String(summary?.assetCount || 0),
      helper: `${summary?.transactionCount || 0} transactions`,
      icon: LineChart,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className="rounded-lg border bg-background/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            <card.icon className={cn("h-4 w-4", card.positive === false ? "text-destructive" : "text-accent")} />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">{card.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{card.helper}</div>
        </div>
      ))}
    </div>
  );
}

function AiEntryCard(props: {
  assets: PortfolioAsset[];
  aiText: string;
  setAiText: (value: string) => void;
  aiAssetId: string;
  setAiAssetId: (value: string) => void;
  screenshotFile: File | null;
  setScreenshotFile: (file: File | null) => void;
  isAiBusy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="font-semibold text-sm">AI portfolio entry</span>
        </div>
        <Select value={props.aiAssetId} onValueChange={props.setAiAssetId}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="Auto-detect asset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto">Auto-detect asset</SelectItem>
            {props.assets.map(asset => (
              <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        rows={3}
        value={props.aiText}
        onChange={(event) => props.setAiText(event.target.value)}
        disabled={props.isAiBusy}
        placeholder="Try: Bought Parag Parikh Flexi Cap for 10000 on 5 Jan 2026. Or: Current value of BTC is 3.2L today."
      />
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm cursor-pointer">
          <Camera className="h-4 w-4" />
          <span>{props.screenshotFile ? props.screenshotFile.name : 'Upload screenshot'}</span>
          <Input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={props.isAiBusy}
            onChange={(event) => props.setScreenshotFile(event.target.files?.[0] || null)}
          />
        </Label>
        <Button onClick={props.onSubmit} disabled={props.isAiBusy || (!props.aiText.trim() && !props.screenshotFile)}>
          {props.isAiBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
          {props.isAiBusy ? 'Parsing...' : 'Add with AI'}
        </Button>
      </div>
    </div>
  );
}

function ManualEntryForm(props: {
  assets: PortfolioAsset[];
  form: ManualFormState;
  update: <K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) => void;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { form, update } = props;
  return (
    <div className="rounded-lg border bg-background/60 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Asset</Label>
          <Select value={form.assetId} onValueChange={(value) => update('assetId', value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__new">New asset</SelectItem>
              {props.assets.map(asset => (
                <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.assetId === '__new' && (
          <>
            <div>
              <Label>Fund / stock name</Label>
              <Input value={form.newAssetName} onChange={(event) => update('newAssetName', event.target.value)} />
            </div>
            <div>
              <Label>Asset type</Label>
              <Select value={form.assetType} onValueChange={(value) => update('assetType', value as PortfolioAssetType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPE_ORDER.map(type => <SelectItem key={type} value={type}>{ASSET_TYPE_LABELS[type]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div>
          <Label>Entry kind</Label>
          <Select value={form.entryKind} onValueChange={(value) => update('entryKind', value as EntryKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="transaction">Transaction</SelectItem>
              <SelectItem value="valuation">Current value</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.entryKind === 'transaction' && (
          <div>
            <Label>Transaction type</Label>
            <Select value={form.transactionType} onValueChange={(value) => update('transactionType', value as PortfolioTransactionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TRANSACTION_LABELS) as PortfolioTransactionType[]).map(type => (
                  <SelectItem key={type} value={type}>{TRANSACTION_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} />
        </div>
        <div>
          <Label>{form.entryKind === 'valuation' ? 'Current value' : 'Amount'}</Label>
          <Input type="number" inputMode="decimal" value={form.amount} onChange={(event) => update('amount', event.target.value)} />
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(value) => update('currency', value as PortfolioCurrency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">INR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Units / quantity (optional)</Label>
          <Input type="number" inputMode="decimal" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} />
        </div>
        <div>
          <Label>Price per unit (optional)</Label>
          <Input type="number" inputMode="decimal" value={form.pricePerUnit} onChange={(event) => update('pricePerUnit', event.target.value)} />
        </div>
        {form.entryKind === 'transaction' && (
          <>
            <div>
              <Label>Charges (optional)</Label>
              <Input type="number" inputMode="decimal" value={form.charges} onChange={(event) => update('charges', event.target.value)} />
            </div>
            <div>
              <Label>Taxes (optional)</Label>
              <Input type="number" inputMode="decimal" value={form.taxes} onChange={(event) => update('taxes', event.target.value)} />
            </div>
          </>
        )}
        <div className="md:col-span-3">
          <Label>Notes (optional)</Label>
          <Textarea rows={2} value={form.notes} onChange={(event) => update('notes', event.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        <Button onClick={props.onSubmit} disabled={props.isSaving}>
          {props.isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Save entry
        </Button>
      </div>
    </div>
  );
}

function AssetCard({ summary }: { summary: PortfolioAssetSummary }) {
  const currency = summary.asset.currency;
  const positive = summary.netPnl >= 0;
  return (
    <Card className="bg-card/90 hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{summary.asset.name}</CardTitle>
            <CardDescription>{ASSET_TYPE_LABELS[summary.asset.assetType]}</CardDescription>
          </div>
          <Badge variant={positive ? 'default' : 'destructive'}>{formatPercent(summary.netPnlPercent)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Current</div>
            <div className="font-semibold">{formatCurrency(summary.currentValue, currency)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invested</div>
            <div className="font-semibold">{formatCurrency(summary.totalInvested, currency)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Net P&L</div>
            <div className={cn("font-semibold", positive ? "text-green-600" : "text-destructive")}>
              {formatCurrency(summary.netPnl, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">XIRR</div>
            <div className="font-semibold">{formatXirr(summary.xirr)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{summary.transactionCount} txns</span>
          <span>{summary.latestValuation ? `updated ${summary.latestValuation.date}` : 'no valuation yet'}</span>
        </div>
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={`/portfolio/${summary.asset.id}`}>Open ledger</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

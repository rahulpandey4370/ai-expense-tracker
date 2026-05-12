"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAIModel } from '@/contexts/AIModelContext';
import {
  addPortfolioEntry,
  deletePortfolioAsset,
  deletePortfolioTransaction,
  deletePortfolioValuation,
  getPortfolioAssetDetail,
  parseAndApplyPortfolioEntry,
} from '@/lib/actions/portfolio';
import type {
  PortfolioAsset,
  PortfolioAssetSummary,
  PortfolioCurrency,
  PortfolioDashboardData,
  PortfolioEntryInput,
  PortfolioTransaction,
  PortfolioTransactionType,
  PortfolioValuation,
} from '@/lib/types';

const TRANSACTION_LABELS: Record<PortfolioTransactionType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  interest: 'Interest',
  fee: 'Fee',
};

type EntryKind = 'transaction' | 'valuation';

type DetailFormState = {
  entryKind: EntryKind;
  transactionType: PortfolioTransactionType;
  date: string;
  amount: string;
  quantity: string;
  pricePerUnit: string;
  charges: string;
  taxes: string;
  notes: string;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): DetailFormState => ({
  entryKind: 'transaction',
  transactionType: 'buy',
  date: todayYmd(),
  amount: '',
  quantity: '',
  pricePerUnit: '',
  charges: '',
  taxes: '',
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

export default function PortfolioAssetPage() {
  const params = useParams<{ assetId: string }>();
  const assetId = params.assetId;
  const router = useRouter();
  const { toast } = useToast();
  const { selectedModel } = useAIModel();

  const [asset, setAsset] = useState<PortfolioAsset | null>(null);
  const [dashboard, setDashboard] = useState<PortfolioDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<DetailFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [aiText, setAiText] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);

  const fetchData = useCallback(async () => {
    if (!assetId) return;
    setIsLoading(true);
    try {
      const result = await getPortfolioAssetDetail(assetId);
      setAsset(result.asset);
      setDashboard(result.dashboard);
    } catch (err: any) {
      toast({ title: 'Could not load asset', description: err.message, variant: 'destructive' });
      setAsset(null);
      setDashboard(null);
    } finally {
      setIsLoading(false);
    }
  }, [assetId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo<PortfolioAssetSummary | undefined>(() => {
    return dashboard?.assetSummaries.find(item => item.asset.id === assetId);
  }, [dashboard, assetId]);

  const updateForm = <K extends keyof DetailFormState>(key: K, value: DetailFormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleManualSubmit = async () => {
    if (!asset) return;
    const amount = parseOptionalNumber(form.amount);
    if (!form.date || !amount || amount <= 0) {
      toast({ title: 'Date and amount are required.', variant: 'destructive' });
      return;
    }

    const base = {
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      date: form.date,
      currency: asset.currency,
      quantity: parseOptionalNumber(form.quantity),
      pricePerUnit: parseOptionalNumber(form.pricePerUnit),
      notes: form.notes.trim() || undefined,
      source: 'manual' as const,
    };

    const payload: PortfolioEntryInput = form.entryKind === 'valuation'
      ? {
          entryKind: 'valuation',
          ...base,
          totalValue: amount,
        }
      : {
          entryKind: 'transaction',
          ...base,
          type: form.transactionType,
          amount,
          charges: parseOptionalNumber(form.charges),
          taxes: parseOptionalNumber(form.taxes),
        };

    setIsSaving(true);
    try {
      await addPortfolioEntry(payload);
      toast({ title: 'Entry saved' });
      setForm(emptyForm());
      fetchData();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiSubmit = async () => {
    if (!asset) return;
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
        preferredAssetId: asset.id,
        model: selectedModel,
      });
      if (!result.ok) {
        toast({ title: "Couldn't add entry", description: result.reason, variant: 'destructive' });
        return;
      }
      toast({ title: 'Added with AI', description: result.summary || `${result.created.length} record(s) saved.` });
      setAiText('');
      setScreenshotFile(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'AI import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAiBusy(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deletePortfolioTransaction(id);
      toast({ title: 'Transaction deleted' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteValuation = async (id: string) => {
    try {
      await deletePortfolioValuation(id);
      toast({ title: 'Valuation deleted' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteAsset = async () => {
    if (!asset) return;
    try {
      await deletePortfolioAsset(asset.id);
      toast({ title: 'Asset deleted' });
      router.push('/portfolio');
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-background/30 backdrop-blur-sm">
        <div className="flex min-h-[60vh] items-center justify-center text-primary">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          Loading asset ledger...
        </div>
      </main>
    );
  }

  if (!asset || !summary) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-background/30 backdrop-blur-sm">
        <Card>
          <CardHeader>
            <CardTitle>Asset not found</CardTitle>
            <CardDescription>This portfolio asset may have been deleted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/portfolio"><ArrowLeft className="h-4 w-4 mr-2" /> Back to portfolio</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const buys = summary.transactions.filter(tx => tx.type === 'buy');
  const sells = summary.transactions.filter(tx => tx.type === 'sell');
  const otherTransactions = summary.transactions.filter(tx => tx.type !== 'buy' && tx.type !== 'sell');
  const positive = summary.netPnl >= 0;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/30 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link href="/portfolio"><ArrowLeft className="h-4 w-4 mr-2" /> Portfolio</Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/40">
              <Trash2 className="h-4 w-4 mr-2" /> Delete asset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the asset, all its transactions, and all its valuations from Cosmos DB.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAsset}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="shadow-xl border-primary/30 border-2 bg-card/90">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-2xl md:text-3xl font-bold text-primary">{asset.name}</CardTitle>
              <CardDescription>
                {asset.assetType.replace(/_/g, ' ')} · {asset.currency}
                {summary.latestValuation ? ` · last valuation ${summary.latestValuation.date}` : ' · no valuation yet'}
              </CardDescription>
            </div>
            <Badge variant={positive ? 'default' : 'destructive'}>{formatPercent(summary.netPnlPercent)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <MiniKpi label="Current Value" value={formatCurrency(summary.currentValue, asset.currency)} helper={summary.latestValuation ? summary.latestValuation.date : 'rough book value'} />
            <MiniKpi label="Invested" value={formatCurrency(summary.totalInvested, asset.currency)} helper="buys + fees" />
            <MiniKpi label="Inflows" value={formatCurrency(summary.totalInflows, asset.currency)} helper="sells + income" />
            <MiniKpi label="Net P&L" value={formatCurrency(summary.netPnl, asset.currency)} helper={formatPercent(summary.netPnlPercent)} danger={!positive} />
            <MiniKpi label="XIRR" value={formatXirr(summary.xirr)} helper={summary.holdingDays !== null ? `${summary.holdingDays} days` : 'cashflow-based'} />
          </div>

          <AiAssetBox
            asset={asset}
            aiText={aiText}
            setAiText={setAiText}
            screenshotFile={screenshotFile}
            setScreenshotFile={setScreenshotFile}
            isAiBusy={isAiBusy}
            onSubmit={handleAiSubmit}
          />

          <ManualAssetEntry
            form={form}
            update={updateForm}
            currency={asset.currency}
            isSaving={isSaving}
            onSubmit={handleManualSubmit}
          />
        </CardContent>
      </Card>

      <LedgerSection
        title="Buy Transactions"
        transactions={buys}
        valuations={[]}
        currency={asset.currency}
        onDeleteTransaction={handleDeleteTransaction}
        onDeleteValuation={handleDeleteValuation}
      />
      <LedgerSection
        title="Sell Transactions"
        transactions={sells}
        valuations={[]}
        currency={asset.currency}
        onDeleteTransaction={handleDeleteTransaction}
        onDeleteValuation={handleDeleteValuation}
      />
      <LedgerSection
        title="Income / Fees"
        transactions={otherTransactions}
        valuations={[]}
        currency={asset.currency}
        onDeleteTransaction={handleDeleteTransaction}
        onDeleteValuation={handleDeleteValuation}
      />
      <LedgerSection
        title="Valuation Updates"
        transactions={[]}
        valuations={summary.valuations}
        currency={asset.currency}
        onDeleteTransaction={handleDeleteTransaction}
        onDeleteValuation={handleDeleteValuation}
      />
    </main>
  );
}

function MiniKpi({ label, value, helper, danger }: { label: string; value: string; helper: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-xl font-bold", danger ? "text-destructive" : "text-foreground")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function AiAssetBox(props: {
  asset: PortfolioAsset;
  aiText: string;
  setAiText: (value: string) => void;
  screenshotFile: File | null;
  setScreenshotFile: (file: File | null) => void;
  isAiBusy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="font-semibold text-sm">AI entry for {props.asset.name}</span>
      </div>
      <Textarea
        rows={2}
        value={props.aiText}
        onChange={(event) => props.setAiText(event.target.value)}
        disabled={props.isAiBusy}
        placeholder="Try: Bought 10000 today. Sold 5000 on 2 Feb. Current value is 58200."
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

function ManualAssetEntry(props: {
  form: DetailFormState;
  update: <K extends keyof DetailFormState>(key: K, value: DetailFormState[K]) => void;
  currency: PortfolioCurrency;
  isSaving: boolean;
  onSubmit: () => void;
}) {
  const { form, update } = props;
  return (
    <div className="rounded-lg border bg-background/60 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <Label>{form.entryKind === 'valuation' ? `Current value (${props.currency})` : `Amount (${props.currency})`}</Label>
          <Input type="number" inputMode="decimal" value={form.amount} onChange={(event) => update('amount', event.target.value)} />
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
      <div className="flex justify-end">
        <Button onClick={props.onSubmit} disabled={props.isSaving}>
          {props.isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Save entry
        </Button>
      </div>
    </div>
  );
}

function LedgerSection(props: {
  title: string;
  transactions: PortfolioTransaction[];
  valuations: PortfolioValuation[];
  currency: PortfolioCurrency;
  onDeleteTransaction: (id: string) => void;
  onDeleteValuation: (id: string) => void;
}) {
  const hasRows = props.transactions.length > 0 || props.valuations.length > 0;
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <CardTitle className="text-lg">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRows ? (
          <p className="text-sm text-muted-foreground py-4">Nothing recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount / Value</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.transactions.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.date}</TableCell>
                  <TableCell><Badge variant="secondary">{TRANSACTION_LABELS[tx.type]}</Badge></TableCell>
                  <TableCell className="text-right">{formatCurrency(tx.amount, props.currency)}</TableCell>
                  <TableCell className="text-right">{tx.quantity ?? '-'}</TableCell>
                  <TableCell className="text-right">{tx.pricePerUnit ? formatCurrency(tx.pricePerUnit, props.currency) : '-'}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{tx.notes || '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => props.onDeleteTransaction(tx.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {props.valuations.map(v => (
                <TableRow key={v.id}>
                  <TableCell>{v.date}</TableCell>
                  <TableCell><Badge>Valuation</Badge></TableCell>
                  <TableCell className="text-right">{formatCurrency(v.totalValue, props.currency)}</TableCell>
                  <TableCell className="text-right">{v.quantity ?? '-'}</TableCell>
                  <TableCell className="text-right">{v.pricePerUnit ? formatCurrency(v.pricePerUnit, props.currency) : '-'}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{v.notes || '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => props.onDeleteValuation(v.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

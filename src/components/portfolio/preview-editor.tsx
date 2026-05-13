"use client";

import { useState } from 'react';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { applyPortfolioPreviewEntries } from '@/lib/actions/portfolio';
import type {
  PortfolioAsset,
  PortfolioAssetType,
  PortfolioCurrency,
  PortfolioPreviewEntry,
  PortfolioTransactionType,
} from '@/lib/types';

const ASSET_TYPE_LABELS: Record<PortfolioAssetType, string> = {
  mutual_fund: 'Mutual Fund',
  indian_equity: 'Indian Equity',
  us_equity: 'US Equity',
  crypto: 'Crypto',
  gold: 'Gold',
  fd_rd: 'FD / RD',
  other: 'Other',
};

const TRANSACTION_LABELS: Record<PortfolioTransactionType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  interest: 'Interest',
  fee: 'Fee',
};

interface PortfolioPreviewEditorProps {
  entries: PortfolioPreviewEntry[];
  assets: PortfolioAsset[];
  summary?: string | null;
  onCancel: () => void;
  onSaved: (count: number) => void;
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PortfolioPreviewEditor({ entries: initialEntries, assets, summary, onCancel, onSaved }: PortfolioPreviewEditorProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<PortfolioPreviewEntry[]>(initialEntries);
  const [isSaving, setIsSaving] = useState(false);

  const update = (tempId: string, patch: Partial<PortfolioPreviewEntry>) => {
    setEntries(prev => prev.map(entry => (entry.tempId === tempId ? { ...entry, ...patch } : entry)));
  };

  const remove = (tempId: string) => {
    setEntries(prev => prev.filter(entry => entry.tempId !== tempId));
  };

  const onAssetSelect = (tempId: string, value: string) => {
    if (value === '__new') {
      update(tempId, { assetId: undefined });
      return;
    }
    const asset = assets.find(a => a.id === value);
    if (!asset) return;
    update(tempId, {
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      currency: asset.currency,
    });
  };

  const handleSave = async () => {
    if (entries.length === 0) {
      toast({ title: 'Nothing to save', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const result = await applyPortfolioPreviewEntries(entries);
      if (!result.ok) {
        toast({ title: 'Save failed', description: result.reason, variant: 'destructive' });
        return;
      }
      toast({ title: `${result.created.length} entry(ies) saved` });
      onSaved(result.created.length);
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-accent/40 bg-background/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Review {entries.length} parsed entry(ies)</CardTitle>
            {summary ? <CardDescription className="text-xs">{summary}</CardDescription> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
              <X className="h-4 w-4 mr-1" /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || entries.length === 0}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">All parsed entries discarded. Hit Discard to close.</p>
        )}
        {entries.map(entry => (
          <div key={entry.tempId} className="rounded-lg border bg-card/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Badge variant={entry.entryKind === 'valuation' ? 'default' : 'secondary'}>
                {entry.entryKind === 'valuation' ? 'Valuation' : `Transaction · ${entry.type ? TRANSACTION_LABELS[entry.type] : '—'}`}
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(entry.tempId)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Entry kind</Label>
                <Select value={entry.entryKind} onValueChange={(v) => update(entry.tempId, { entryKind: v as 'transaction' | 'valuation' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transaction">Transaction</SelectItem>
                    <SelectItem value="valuation">Current value</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {entry.entryKind === 'transaction' && (
                <div>
                  <Label>Transaction type</Label>
                  <Select value={entry.type || 'buy'} onValueChange={(v) => update(entry.tempId, { type: v as PortfolioTransactionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TRANSACTION_LABELS) as PortfolioTransactionType[]).map(t => (
                        <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Existing asset</Label>
                <Select value={entry.assetId || '__new'} onValueChange={(v) => onAssetSelect(entry.tempId, v)}>
                  <SelectTrigger><SelectValue placeholder="New asset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new">New asset</SelectItem>
                    {assets.map(asset => (
                      <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Asset name</Label>
                <Input value={entry.assetName} onChange={(e) => update(entry.tempId, { assetName: e.target.value })} />
              </div>

              <div>
                <Label>Asset type</Label>
                <Select value={entry.assetType} onValueChange={(v) => update(entry.tempId, { assetType: v as PortfolioAssetType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ASSET_TYPE_LABELS) as PortfolioAssetType[]).map(t => (
                      <SelectItem key={t} value={t}>{ASSET_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Currency</Label>
                <Select value={entry.currency} onValueChange={(v) => update(entry.tempId, { currency: v as PortfolioCurrency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date</Label>
                <Input type="date" value={entry.date} onChange={(e) => update(entry.tempId, { date: e.target.value })} />
              </div>

              {entry.entryKind === 'transaction' ? (
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={entry.amount ?? ''}
                    onChange={(e) => update(entry.tempId, { amount: parseNumber(e.target.value) })}
                  />
                </div>
              ) : (
                <div>
                  <Label>Current value</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={entry.totalValue ?? ''}
                    onChange={(e) => update(entry.tempId, { totalValue: parseNumber(e.target.value) })}
                  />
                </div>
              )}

              <div>
                <Label>Quantity / units (optional)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={entry.quantity ?? ''}
                  onChange={(e) => update(entry.tempId, { quantity: parseNumber(e.target.value) })}
                />
              </div>

              <div>
                <Label>Price per unit (optional)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={entry.pricePerUnit ?? ''}
                  onChange={(e) => update(entry.tempId, { pricePerUnit: parseNumber(e.target.value) })}
                />
              </div>

              {entry.entryKind === 'transaction' && (
                <>
                  <div>
                    <Label>Charges (optional)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={entry.charges ?? ''}
                      onChange={(e) => update(entry.tempId, { charges: parseNumber(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Taxes (optional)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={entry.taxes ?? ''}
                      onChange={(e) => update(entry.tempId, { taxes: parseNumber(e.target.value) })}
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-3">
                <Label>Notes (optional)</Label>
                <Textarea rows={2} value={entry.notes ?? ''} onChange={(e) => update(entry.tempId, { notes: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

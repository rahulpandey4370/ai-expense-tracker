"use client";

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  updatePortfolioAsset,
  updatePortfolioTransaction,
  updatePortfolioValuation,
} from '@/lib/actions/portfolio';
import type {
  PortfolioAsset,
  PortfolioAssetType,
  PortfolioCurrency,
  PortfolioTransaction,
  PortfolioTransactionType,
  PortfolioValuation,
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

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ───── Edit Asset ──────────────────────────────────────────────────────────

interface EditAssetDialogProps {
  asset: PortfolioAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditAssetDialog({ asset, open, onOpenChange, onSaved }: EditAssetDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<PortfolioAssetType>('other');
  const [currency, setCurrency] = useState<PortfolioCurrency>('INR');
  const [symbol, setSymbol] = useState('');
  const [isin, setIsin] = useState('');
  const [schemeCode, setSchemeCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setName(asset.name);
    setAssetType(asset.assetType);
    setCurrency(asset.currency);
    setSymbol(asset.symbol || '');
    setIsin(asset.isin || '');
    setSchemeCode(asset.schemeCode || '');
    setNotes(asset.notes || '');
  }, [asset]);

  const handleSave = async () => {
    if (!asset) return;
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await updatePortfolioAsset(asset.id, {
        name: name.trim(),
        assetType,
        currency,
        symbol: symbol.trim() || undefined,
        isin: isin.trim() || undefined,
        schemeCode: schemeCode.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast({ title: 'Asset updated' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit asset</DialogTitle>
          <DialogDescription>Correct details for this portfolio asset.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Asset type</Label>
            <Select value={assetType} onValueChange={(v) => setAssetType(v as PortfolioAssetType)}>
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
            <Select value={currency} onValueChange={(v) => setCurrency(v as PortfolioCurrency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Symbol / Ticker (optional)</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </div>
          <div>
            <Label>ISIN (optional)</Label>
            <Input value={isin} onChange={(e) => setIsin(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Scheme code (optional)</Label>
            <Input value={schemeCode} onChange={(e) => setSchemeCode(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───── Edit Transaction ────────────────────────────────────────────────────

interface EditTransactionDialogProps {
  transaction: PortfolioTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditTransactionDialog({ transaction, open, onOpenChange, onSaved }: EditTransactionDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState<PortfolioTransactionType>('buy');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [charges, setCharges] = useState('');
  const [taxes, setTaxes] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setType(transaction.type);
    setDate(transaction.date);
    setAmount(String(transaction.amount ?? ''));
    setQuantity(transaction.quantity != null ? String(transaction.quantity) : '');
    setPricePerUnit(transaction.pricePerUnit != null ? String(transaction.pricePerUnit) : '');
    setCharges(transaction.charges != null ? String(transaction.charges) : '');
    setTaxes(transaction.taxes != null ? String(transaction.taxes) : '');
    setNotes(transaction.notes || '');
  }, [transaction]);

  const handleSave = async () => {
    if (!transaction) return;
    const amt = parseNumber(amount);
    if (!date.trim() || !amt || amt <= 0) {
      toast({ title: 'Date and amount are required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await updatePortfolioTransaction(transaction.id, {
        type,
        date,
        amount: amt,
        quantity: parseNumber(quantity),
        pricePerUnit: parseNumber(pricePerUnit),
        charges: parseNumber(charges),
        taxes: parseNumber(taxes),
        notes: notes.trim() || undefined,
      });
      toast({ title: 'Transaction updated' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>{transaction?.assetName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PortfolioTransactionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TRANSACTION_LABELS) as PortfolioTransactionType[]).map(t => (
                  <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Quantity (optional)</Label>
            <Input type="number" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Price per unit (optional)</Label>
            <Input type="number" inputMode="decimal" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} />
          </div>
          <div>
            <Label>Charges (optional)</Label>
            <Input type="number" inputMode="decimal" value={charges} onChange={(e) => setCharges(e.target.value)} />
          </div>
          <div>
            <Label>Taxes (optional)</Label>
            <Input type="number" inputMode="decimal" value={taxes} onChange={(e) => setTaxes(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───── Edit Valuation ──────────────────────────────────────────────────────

interface EditValuationDialogProps {
  valuation: PortfolioValuation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditValuationDialog({ valuation, open, onOpenChange, onSaved }: EditValuationDialogProps) {
  const { toast } = useToast();
  const [date, setDate] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!valuation) return;
    setDate(valuation.date);
    setTotalValue(String(valuation.totalValue ?? ''));
    setQuantity(valuation.quantity != null ? String(valuation.quantity) : '');
    setPricePerUnit(valuation.pricePerUnit != null ? String(valuation.pricePerUnit) : '');
    setNotes(valuation.notes || '');
  }, [valuation]);

  const handleSave = async () => {
    if (!valuation) return;
    const tv = parseNumber(totalValue);
    if (!date.trim() || !tv || tv <= 0) {
      toast({ title: 'Date and current value are required', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await updatePortfolioValuation(valuation.id, {
        date,
        totalValue: tv,
        quantity: parseNumber(quantity),
        pricePerUnit: parseNumber(pricePerUnit),
        notes: notes.trim() || undefined,
      });
      toast({ title: 'Valuation updated' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit valuation</DialogTitle>
          <DialogDescription>{valuation?.assetName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Current value</Label>
            <Input type="number" inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} />
          </div>
          <div>
            <Label>Quantity (optional)</Label>
            <Input type="number" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Price per unit (optional)</Label>
            <Input type="number" inputMode="decimal" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

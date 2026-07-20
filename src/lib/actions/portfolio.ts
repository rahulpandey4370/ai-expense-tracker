'use server';

import { getSupabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import {
  PortfolioAssetInputSchema,
  PortfolioEntryInputSchema,
  PortfolioTransactionInputSchema,
  PortfolioValuationInputSchema,
  type PortfolioAIImport,
  type PortfolioAsset,
  type PortfolioAssetInput,
  type PortfolioDashboardData,
  type PortfolioEntryInput,
  type PortfolioPreviewEntry,
  type PortfolioTransaction,
  type PortfolioTransactionInput,
  type PortfolioValuation,
  type PortfolioValuationInput,
} from '@/lib/types';
import { buildPortfolioDashboardData } from '@/lib/portfolio-calculations';
import { parsePortfolioEntryWithAI } from '@/ai/flows/parse-portfolio-entry-flow';
import { askPortfolioBot, type PortfolioChatMessage } from '@/ai/flows/portfolio-chat-flow';
import type { AIModel } from '@/lib/types';

const DEFAULT_USER_ID = 'default';

function nowIso() {
  return new Date().toISOString();
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function revalidatePortfolio(assetId?: string) {
  revalidatePath('/portfolio');
  if (assetId) revalidatePath(`/portfolio/${assetId}`);
}

function toAsset(row: any): PortfolioAsset {
  return {
    id: row.id,
    userId: row.user_id,
    docType: 'asset',
    name: row.name,
    assetType: row.asset_type,
    symbol: row.symbol ?? undefined,
    isin: row.isin ?? undefined,
    schemeCode: row.scheme_code ?? undefined,
    currency: row.currency,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function assetToRow(asset: PortfolioAsset): Record<string, any> {
  return {
    id: asset.id,
    user_id: asset.userId,
    name: asset.name,
    asset_type: asset.assetType,
    symbol: asset.symbol ?? null,
    isin: asset.isin ?? null,
    scheme_code: asset.schemeCode ?? null,
    currency: asset.currency,
    notes: asset.notes ?? null,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt ?? null,
  };
}

function toTransaction(row: any): PortfolioTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    docType: 'transaction',
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetType: row.asset_type,
    type: row.type,
    date: row.date,
    amount: row.amount,
    quantity: row.quantity ?? undefined,
    pricePerUnit: row.price_per_unit ?? undefined,
    charges: row.charges ?? undefined,
    taxes: row.taxes ?? undefined,
    currency: row.currency,
    notes: row.notes ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function transactionToRow(tx: PortfolioTransaction): Record<string, any> {
  return {
    id: tx.id,
    user_id: tx.userId,
    asset_id: tx.assetId,
    asset_name: tx.assetName,
    asset_type: tx.assetType,
    type: tx.type,
    date: tx.date,
    amount: tx.amount,
    quantity: tx.quantity ?? null,
    price_per_unit: tx.pricePerUnit ?? null,
    charges: tx.charges ?? null,
    taxes: tx.taxes ?? null,
    currency: tx.currency,
    notes: tx.notes ?? null,
    source: tx.source,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt ?? null,
  };
}

function toValuation(row: any): PortfolioValuation {
  return {
    id: row.id,
    userId: row.user_id,
    docType: 'valuation',
    assetId: row.asset_id,
    assetName: row.asset_name,
    assetType: row.asset_type,
    date: row.date,
    totalValue: row.total_value,
    quantity: row.quantity ?? undefined,
    pricePerUnit: row.price_per_unit ?? undefined,
    currency: row.currency,
    notes: row.notes ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function valuationToRow(v: PortfolioValuation): Record<string, any> {
  return {
    id: v.id,
    user_id: v.userId,
    asset_id: v.assetId,
    asset_name: v.assetName,
    asset_type: v.assetType,
    date: v.date,
    total_value: v.totalValue,
    quantity: v.quantity ?? null,
    price_per_unit: v.pricePerUnit ?? null,
    currency: v.currency,
    notes: v.notes ?? null,
    source: v.source,
    created_at: v.createdAt,
    updated_at: v.updatedAt ?? null,
  };
}

export async function getPortfolioAssets(): Promise<PortfolioAsset[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('portfolio_assets')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .order('name', { ascending: true });
  if (error) throw new Error(`Could not fetch portfolio assets. Original error: ${error.message}`);
  return (data as any[]).map(toAsset);
}

export async function getPortfolioTransactions(assetId?: string): Promise<PortfolioTransaction[]> {
  const supabase = getSupabase();
  let query = supabase.from('portfolio_transactions').select('*').eq('user_id', DEFAULT_USER_ID).order('date', { ascending: false });
  if (assetId) query = query.eq('asset_id', assetId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not fetch portfolio transactions. Original error: ${error.message}`);
  return (data as any[]).map(toTransaction);
}

export async function getPortfolioValuations(assetId?: string): Promise<PortfolioValuation[]> {
  const supabase = getSupabase();
  let query = supabase.from('portfolio_valuations').select('*').eq('user_id', DEFAULT_USER_ID).order('date', { ascending: false });
  if (assetId) query = query.eq('asset_id', assetId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not fetch portfolio valuations. Original error: ${error.message}`);
  return (data as any[]).map(toValuation);
}

export async function getPortfolioDashboardData(): Promise<PortfolioDashboardData> {
  try {
    const [assets, transactions, valuations] = await Promise.all([
      getPortfolioAssets(),
      getPortfolioTransactions(),
      getPortfolioValuations(),
    ]);
    return buildPortfolioDashboardData(assets, transactions, valuations);
  } catch (err: any) {
    console.error('[portfolio] getPortfolioDashboardData failed:', err);
    throw new Error(`Could not load portfolio: ${err?.message || 'unknown error'}`);
  }
}

export async function getPortfolioAssetDetail(assetId: string): Promise<{
  asset: PortfolioAsset | null;
  dashboard: PortfolioDashboardData;
}> {
  const dashboard = await getPortfolioDashboardData();
  const asset = dashboard.assets.find(item => item.id === assetId) || null;
  return { asset, dashboard };
}

async function findAssetByName(name: string): Promise<PortfolioAsset | null> {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  const assets = await getPortfolioAssets();
  return assets.find(asset => normalizeName(asset.name) === wanted) || null;
}

export async function addPortfolioAsset(data: PortfolioAssetInput): Promise<PortfolioAsset> {
  const validated = PortfolioAssetInputSchema.parse({
    ...data,
    name: data.name.trim(),
    symbol: cleanOptional(data.symbol),
    isin: cleanOptional(data.isin),
    schemeCode: cleanOptional(data.schemeCode),
    notes: cleanOptional(data.notes),
  });

  const existing = await findAssetByName(validated.name);
  if (existing) return existing;

  const now = nowIso();
  const asset: PortfolioAsset = {
    id: cuid(),
    userId: DEFAULT_USER_ID,
    docType: 'asset',
    ...validated,
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getSupabase();
  const { error } = await supabase.from('portfolio_assets').insert(assetToRow(asset));
  if (error) throw new Error(`Could not add portfolio asset. Original error: ${error.message}`);

  revalidatePortfolio(asset.id);
  return asset;
}

export async function updatePortfolioAsset(id: string, patch: Partial<PortfolioAssetInput>): Promise<PortfolioAsset> {
  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase
    .from('portfolio_assets')
    .select('*')
    .eq('id', id)
    .eq('user_id', DEFAULT_USER_ID)
    .maybeSingle();
  if (readError) throw new Error(`Could not retrieve portfolio asset. Original error: ${readError.message}`);
  if (!row) throw new Error(`Portfolio asset ${id} not found.`);
  const resource = toAsset(row);

  const merged: PortfolioAsset = {
    ...resource,
    ...patch,
    name: patch.name?.trim() || resource.name,
    symbol: cleanOptional(patch.symbol) ?? resource.symbol,
    isin: cleanOptional(patch.isin) ?? resource.isin,
    schemeCode: cleanOptional(patch.schemeCode) ?? resource.schemeCode,
    notes: cleanOptional(patch.notes) ?? resource.notes,
    updatedAt: nowIso(),
  };

  PortfolioAssetInputSchema.parse({
    name: merged.name,
    assetType: merged.assetType,
    symbol: merged.symbol,
    isin: merged.isin,
    schemeCode: merged.schemeCode,
    currency: merged.currency,
    notes: merged.notes,
  });

  const { data: updatedRow, error: updateError } = await supabase
    .from('portfolio_assets')
    .update(assetToRow(merged))
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw new Error(`Could not update portfolio asset. Original error: ${updateError.message}`);

  revalidatePortfolio(id);
  return toAsset(updatedRow);
}

async function resolveAssetForEntry(input: {
  assetId?: string;
  assetName: string;
  assetType: PortfolioAssetInput['assetType'];
  currency?: PortfolioAssetInput['currency'];
}): Promise<PortfolioAsset> {
  const supabase = getSupabase();
  if (input.assetId) {
    const { data: row } = await supabase
      .from('portfolio_assets')
      .select('*')
      .eq('id', input.assetId)
      .eq('user_id', DEFAULT_USER_ID)
      .maybeSingle();
    if (row) return toAsset(row);
  }
  const existing = await findAssetByName(input.assetName);
  if (existing) return existing;
  return addPortfolioAsset({
    name: input.assetName,
    assetType: input.assetType,
    currency: input.currency || 'INR',
  });
}

export async function addPortfolioTransaction(data: PortfolioTransactionInput): Promise<PortfolioTransaction> {
  const validated = PortfolioTransactionInputSchema.parse({
    ...data,
    assetName: data.assetName.trim(),
    date: data.date || todayYmd(),
    notes: cleanOptional(data.notes),
  });
  const asset = await resolveAssetForEntry(validated);
  const now = nowIso();
  const item: PortfolioTransaction = {
    id: cuid(),
    userId: DEFAULT_USER_ID,
    docType: 'transaction',
    ...validated,
    assetId: asset.id,
    assetName: asset.name,
    createdAt: now,
    updatedAt: now,
  };
  const supabase = getSupabase();
  const { error } = await supabase.from('portfolio_transactions').insert(transactionToRow(item));
  if (error) throw new Error(`Could not add portfolio transaction. Original error: ${error.message}`);

  revalidatePortfolio(asset.id);
  return item;
}

export async function addPortfolioValuation(data: PortfolioValuationInput): Promise<PortfolioValuation> {
  const validated = PortfolioValuationInputSchema.parse({
    ...data,
    assetName: data.assetName.trim(),
    date: data.date || todayYmd(),
    notes: cleanOptional(data.notes),
  });
  const asset = await resolveAssetForEntry(validated);
  const now = nowIso();
  const item: PortfolioValuation = {
    id: cuid(),
    userId: DEFAULT_USER_ID,
    docType: 'valuation',
    ...validated,
    assetId: asset.id,
    assetName: asset.name,
    createdAt: now,
    updatedAt: now,
  };
  const supabase = getSupabase();
  const { error } = await supabase.from('portfolio_valuations').insert(valuationToRow(item));
  if (error) throw new Error(`Could not add portfolio valuation. Original error: ${error.message}`);

  revalidatePortfolio(asset.id);
  return item;
}

export async function addPortfolioEntry(data: PortfolioEntryInput): Promise<PortfolioTransaction | PortfolioValuation> {
  const validated = PortfolioEntryInputSchema.parse(data);
  if (validated.entryKind === 'valuation') {
    const { entryKind, ...valuation } = validated;
    return addPortfolioValuation(valuation);
  }
  const { entryKind, ...transaction } = validated;
  return addPortfolioTransaction(transaction);
}

export async function updatePortfolioTransaction(
  id: string,
  patch: Partial<PortfolioTransactionInput>,
): Promise<PortfolioTransaction> {
  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase
    .from('portfolio_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', DEFAULT_USER_ID)
    .maybeSingle();
  if (readError) throw new Error(`Could not retrieve portfolio transaction. Original error: ${readError.message}`);
  if (!row) throw new Error(`Portfolio transaction ${id} not found.`);
  const resource = toTransaction(row);

  const merged: PortfolioTransaction = {
    ...resource,
    ...patch,
    assetName: patch.assetName?.trim() || resource.assetName,
    notes: patch.notes !== undefined ? (cleanOptional(patch.notes) ?? undefined) : resource.notes,
    quantity: patch.quantity ?? resource.quantity,
    pricePerUnit: patch.pricePerUnit ?? resource.pricePerUnit,
    charges: patch.charges ?? resource.charges,
    taxes: patch.taxes ?? resource.taxes,
    updatedAt: nowIso(),
  };
  PortfolioTransactionInputSchema.parse({
    assetId: merged.assetId,
    assetName: merged.assetName,
    assetType: merged.assetType,
    type: merged.type,
    date: merged.date,
    amount: merged.amount,
    quantity: merged.quantity,
    pricePerUnit: merged.pricePerUnit,
    charges: merged.charges,
    taxes: merged.taxes,
    currency: merged.currency,
    notes: merged.notes,
    source: merged.source,
  });

  const { data: updatedRow, error: updateError } = await supabase
    .from('portfolio_transactions')
    .update(transactionToRow(merged))
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw new Error(`Could not update portfolio transaction. Original error: ${updateError.message}`);

  revalidatePortfolio(merged.assetId);
  return toTransaction(updatedRow);
}

export async function updatePortfolioValuation(
  id: string,
  patch: Partial<PortfolioValuationInput>,
): Promise<PortfolioValuation> {
  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase
    .from('portfolio_valuations')
    .select('*')
    .eq('id', id)
    .eq('user_id', DEFAULT_USER_ID)
    .maybeSingle();
  if (readError) throw new Error(`Could not retrieve portfolio valuation. Original error: ${readError.message}`);
  if (!row) throw new Error(`Portfolio valuation ${id} not found.`);
  const resource = toValuation(row);

  const merged: PortfolioValuation = {
    ...resource,
    ...patch,
    assetName: patch.assetName?.trim() || resource.assetName,
    notes: patch.notes !== undefined ? (cleanOptional(patch.notes) ?? undefined) : resource.notes,
    quantity: patch.quantity ?? resource.quantity,
    pricePerUnit: patch.pricePerUnit ?? resource.pricePerUnit,
    updatedAt: nowIso(),
  };
  PortfolioValuationInputSchema.parse({
    assetId: merged.assetId,
    assetName: merged.assetName,
    assetType: merged.assetType,
    date: merged.date,
    totalValue: merged.totalValue,
    quantity: merged.quantity,
    pricePerUnit: merged.pricePerUnit,
    currency: merged.currency,
    notes: merged.notes,
    source: merged.source,
  });

  const { data: updatedRow, error: updateError } = await supabase
    .from('portfolio_valuations')
    .update(valuationToRow(merged))
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw new Error(`Could not update portfolio valuation. Original error: ${updateError.message}`);

  revalidatePortfolio(merged.assetId);
  return toValuation(updatedRow);
}

export async function deletePortfolioTransaction(id: string): Promise<void> {
  const supabase = getSupabase();
  const { data: row } = await supabase.from('portfolio_transactions').select('asset_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('portfolio_transactions').delete().eq('id', id);
  if (error) throw new Error(`Could not delete portfolio transaction. Original error: ${error.message}`);
  revalidatePortfolio(row?.asset_id);
}

export async function deletePortfolioValuation(id: string): Promise<void> {
  const supabase = getSupabase();
  const { data: row } = await supabase.from('portfolio_valuations').select('asset_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('portfolio_valuations').delete().eq('id', id);
  if (error) throw new Error(`Could not delete portfolio valuation. Original error: ${error.message}`);
  revalidatePortfolio(row?.asset_id);
}

export async function deletePortfolioAsset(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error: txError } = await supabase.from('portfolio_transactions').delete().eq('asset_id', id);
  if (txError) throw new Error(`Could not delete portfolio transactions for asset. Original error: ${txError.message}`);
  const { error: valError } = await supabase.from('portfolio_valuations').delete().eq('asset_id', id);
  if (valError) throw new Error(`Could not delete portfolio valuations for asset. Original error: ${valError.message}`);
  const { error: assetError } = await supabase.from('portfolio_assets').delete().eq('id', id);
  if (assetError) throw new Error(`Could not delete portfolio asset. Original error: ${assetError.message}`);
  revalidatePortfolio(id);
}

export async function savePortfolioAIImport(data: {
  inputType: 'text' | 'screenshot';
  rawText?: string;
  parsedJson: unknown;
  createdRecordIds: string[];
}): Promise<PortfolioAIImport> {
  const now = nowIso();
  const item: PortfolioAIImport = {
    id: cuid(),
    userId: DEFAULT_USER_ID,
    docType: 'ai_import',
    inputType: data.inputType,
    rawText: cleanOptional(data.rawText),
    parsedJson: data.parsedJson,
    createdRecordIds: data.createdRecordIds,
    createdAt: now,
    updatedAt: now,
  };
  const supabase = getSupabase();
  const { error } = await supabase.from('portfolio_ai_imports').insert({
    id: item.id,
    user_id: item.userId,
    input_type: item.inputType,
    raw_text: item.rawText ?? null,
    parsed_json: item.parsedJson,
    created_record_ids: item.createdRecordIds,
    created_at: item.createdAt,
  });
  if (error) throw new Error(`Could not save portfolio AI import. Original error: ${error.message}`);
  return item;
}

function removeNullish<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '')
  ) as T;
}

export async function parsePortfolioEntryPreview(input: {
  text?: string;
  imageDataUri?: string;
  preferredAssetId?: string;
  model?: any;
}): Promise<{
  ok: true;
  entries: PortfolioPreviewEntry[];
  summary?: string | null;
  source: 'ai_text' | 'screenshot';
} | { ok: false; reason: string }> {
  if (!input.text?.trim() && !input.imageDataUri) {
    return { ok: false, reason: 'Type a portfolio entry or upload a screenshot first.' };
  }

  const assets = await getPortfolioAssets();
  const preferredAsset = input.preferredAssetId
    ? assets.find(asset => asset.id === input.preferredAssetId)
    : undefined;

  let parsed;
  try {
    parsed = await parsePortfolioEntryWithAI({
      text: input.text,
      imageDataUri: input.imageDataUri,
      existingAssets: assets.map(asset => ({
        id: asset.id,
        name: asset.name,
        assetType: asset.assetType,
        currency: asset.currency,
      })),
      preferredAssetId: preferredAsset?.id,
      preferredAssetName: preferredAsset?.name,
      model: input.model,
    });
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'AI parser failed' };
  }

  const source: 'ai_text' | 'screenshot' = input.imageDataUri ? 'screenshot' : 'ai_text';

  if (!parsed.entries.length) {
    return { ok: false, reason: parsed.summary || 'No entries extracted. Add manually or refine your text.' };
  }

  const matchAssetByName = (name: string) => {
    const wanted = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return assets.find(a => a.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === wanted);
  };

  const previewEntries: PortfolioPreviewEntry[] = parsed.entries.map((entry, index) => {
    const matched = preferredAsset || (entry.assetName ? matchAssetByName(entry.assetName) : undefined);
    return {
      tempId: `${Date.now()}-${index}`,
      entryKind: entry.entryKind,
      assetId: matched?.id,
      assetName: entry.assetName || matched?.name || '',
      assetType: matched?.assetType || entry.assetType || 'other',
      type: entry.type ?? undefined,
      date: entry.date,
      amount: entry.amount ?? undefined,
      totalValue: entry.totalValue ?? undefined,
      quantity: entry.quantity ?? undefined,
      pricePerUnit: entry.pricePerUnit ?? undefined,
      charges: entry.charges ?? undefined,
      taxes: entry.taxes ?? undefined,
      currency: matched?.currency || entry.currency || 'INR',
      notes: entry.notes ?? undefined,
      source,
    };
  });

  // Persist the raw AI import for audit, but without created records yet.
  try {
    await savePortfolioAIImport({
      inputType: input.imageDataUri ? 'screenshot' : 'text',
      rawText: input.text,
      parsedJson: parsed,
      createdRecordIds: [],
    });
  } catch (err) {
    console.warn('[portfolio] savePortfolioAIImport (preview) failed:', err);
  }

  return { ok: true, entries: previewEntries, summary: parsed.summary, source };
}

export async function applyPortfolioPreviewEntries(
  entries: PortfolioPreviewEntry[],
): Promise<{
  ok: true;
  created: Array<PortfolioTransaction | PortfolioValuation>;
} | { ok: false; reason: string }> {
  if (!entries?.length) return { ok: false, reason: 'No entries to save.' };

  const created: Array<PortfolioTransaction | PortfolioValuation> = [];
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      if (!entry.assetName?.trim()) throw new Error('Asset name is required.');
      if (!entry.date?.trim()) throw new Error(`${entry.assetName}: date is required.`);

      if (entry.entryKind === 'valuation') {
        if (!entry.totalValue || entry.totalValue <= 0) {
          throw new Error(`${entry.assetName}: current value is required and must be > 0.`);
        }
        const input = removeNullish({
          assetId: entry.assetId,
          assetName: entry.assetName,
          assetType: entry.assetType,
          date: entry.date,
          totalValue: entry.totalValue,
          quantity: entry.quantity,
          pricePerUnit: entry.pricePerUnit,
          currency: entry.currency,
          notes: entry.notes,
          source: entry.source,
        }) as PortfolioValuationInput;
        created.push(await addPortfolioValuation(input));
      } else {
        if (!entry.amount || entry.amount <= 0) {
          throw new Error(`${entry.assetName}: amount is required and must be > 0.`);
        }
        if (!entry.type) throw new Error(`${entry.assetName}: transaction type is required.`);
        const input = removeNullish({
          assetId: entry.assetId,
          assetName: entry.assetName,
          assetType: entry.assetType,
          type: entry.type,
          date: entry.date,
          amount: entry.amount,
          quantity: entry.quantity,
          pricePerUnit: entry.pricePerUnit,
          charges: entry.charges,
          taxes: entry.taxes,
          currency: entry.currency,
          notes: entry.notes,
          source: entry.source,
        }) as PortfolioTransactionInput;
        created.push(await addPortfolioTransaction(input));
      }
    } catch (err: any) {
      errors.push(err?.message || 'unknown error');
    }
  }

  if (created.length === 0) {
    return { ok: false, reason: errors.join('; ') || 'No entries saved.' };
  }
  return { ok: true, created };
}

export async function parseAndApplyPortfolioEntry(input: {
  text?: string;
  imageDataUri?: string;
  preferredAssetId?: string;
  model?: any;
}): Promise<{
  ok: true;
  created: Array<PortfolioTransaction | PortfolioValuation>;
  summary?: string | null;
} | {
  ok: false;
  reason: string;
}> {
  if (!input.text?.trim() && !input.imageDataUri) {
    return { ok: false, reason: "Type a portfolio entry or upload a screenshot first." };
  }

  const assets = await getPortfolioAssets();
  const preferredAsset = input.preferredAssetId
    ? assets.find(asset => asset.id === input.preferredAssetId)
    : undefined;

  const parsed = await parsePortfolioEntryWithAI({
    text: input.text,
    imageDataUri: input.imageDataUri,
    existingAssets: assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      assetType: asset.assetType,
      currency: asset.currency,
    })),
    preferredAssetId: preferredAsset?.id,
    preferredAssetName: preferredAsset?.name,
    model: input.model,
  });

  if (!parsed.entries.length) {
    return { ok: false, reason: "I couldn't find a complete portfolio entry with fund/stock name, date, and amount." };
  }

  const source = input.imageDataUri ? 'screenshot' : 'ai_text';
  const created: Array<PortfolioTransaction | PortfolioValuation> = [];
  const skipped: string[] = [];

  for (const entry of parsed.entries) {
    if (!entry.assetName?.trim()) {
      skipped.push('missing asset name');
      continue;
    }
    if (entry.entryKind === 'valuation') {
      if (!entry.totalValue || entry.totalValue <= 0) {
        skipped.push(`${entry.assetName}: missing current value`);
        continue;
      }
      const valuationInput = removeNullish({
        assetId: preferredAsset?.id,
        assetName: entry.assetName,
        assetType: entry.assetType,
        date: entry.date,
        totalValue: entry.totalValue,
        quantity: entry.quantity ?? undefined,
        pricePerUnit: entry.pricePerUnit ?? undefined,
        currency: entry.currency,
        notes: entry.notes ?? undefined,
        source,
      }) as PortfolioValuationInput;
      created.push(await addPortfolioValuation(valuationInput));
    } else {
      if (!entry.amount || entry.amount <= 0) {
        skipped.push(`${entry.assetName}: missing amount`);
        continue;
      }
      if (!entry.type) {
        skipped.push(`${entry.assetName}: missing transaction type`);
        continue;
      }
      const transactionInput = removeNullish({
        assetId: preferredAsset?.id,
        assetName: entry.assetName,
        assetType: entry.assetType,
        type: entry.type,
        date: entry.date,
        amount: entry.amount,
        quantity: entry.quantity ?? undefined,
        pricePerUnit: entry.pricePerUnit ?? undefined,
        charges: entry.charges ?? undefined,
        taxes: entry.taxes ?? undefined,
        currency: entry.currency,
        notes: entry.notes ?? undefined,
        source,
      }) as PortfolioTransactionInput;
      created.push(await addPortfolioTransaction(transactionInput));
    }
  }

  if (created.length === 0) {
    return {
      ok: false,
      reason: skipped.length
        ? `Skipped: ${skipped.join('; ')}`
        : "I couldn't extract a complete entry. Make sure the input has a fund/stock name plus an amount or current value.",
    };
  }

  await savePortfolioAIImport({
    inputType: input.imageDataUri ? 'screenshot' : 'text',
    rawText: input.text,
    parsedJson: parsed,
    createdRecordIds: created.map(item => item.id),
  });

  revalidatePortfolio(preferredAsset?.id || created[0]?.assetId);
  return { ok: true, created, summary: parsed.summary };
}

export async function askPortfolioChat(input: {
  query: string;
  chatHistory?: PortfolioChatMessage[];
  model?: AIModel;
  scopedAssetId?: string;
}) {
  const dashboard = await getPortfolioDashboardData();
  return askPortfolioBot({
    query: input.query,
    dashboard,
    chatHistory: input.chatHistory,
    model: input.model,
    scopedAssetId: input.scopedAssetId,
  });
}

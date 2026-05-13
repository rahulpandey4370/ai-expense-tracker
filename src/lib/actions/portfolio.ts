'use server';

import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
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

let portfolioContainerInstance: CosmosContainer | undefined;

async function getCosmosClientAndDb() {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;

  if (!endpoint || !key || !databaseId) {
    throw new Error("Cosmos DB core environment variables are not fully configured.");
  }

  const cosmosClient = new CosmosClient({ endpoint, key });
  return { database: cosmosClient.database(databaseId) };
}

async function getPortfolioContainer(): Promise<CosmosContainer> {
  if (portfolioContainerInstance) return portfolioContainerInstance;
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_PORTFOLIO_CONTAINER_ID || 'portfolio';
  try {
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ['/userId'] },
    });
    portfolioContainerInstance = container;
  } catch (err) {
    console.error('[portfolio] createIfNotExists failed, falling back to direct reference:', err);
    portfolioContainerInstance = database.container(containerId);
  }
  return portfolioContainerInstance;
}

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

export async function getPortfolioAssets(): Promise<PortfolioAsset[]> {
  const container = await getPortfolioContainer();
  const { resources } = await container.items.query({
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'asset' ORDER BY c.name ASC",
    parameters: [{ name: '@userId', value: DEFAULT_USER_ID }],
  }).fetchAll();
  return resources as PortfolioAsset[];
}

export async function getPortfolioTransactions(assetId?: string): Promise<PortfolioTransaction[]> {
  const container = await getPortfolioContainer();
  const query = assetId
    ? "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'transaction' AND c.assetId = @assetId ORDER BY c.date DESC"
    : "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'transaction' ORDER BY c.date DESC";
  const parameters: { name: string; value: string }[] = [{ name: '@userId', value: DEFAULT_USER_ID }];
  if (assetId) parameters.push({ name: '@assetId', value: assetId });
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  return resources as PortfolioTransaction[];
}

export async function getPortfolioValuations(assetId?: string): Promise<PortfolioValuation[]> {
  const container = await getPortfolioContainer();
  const query = assetId
    ? "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'valuation' AND c.assetId = @assetId ORDER BY c.date DESC"
    : "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'valuation' ORDER BY c.date DESC";
  const parameters: { name: string; value: string }[] = [{ name: '@userId', value: DEFAULT_USER_ID }];
  if (assetId) parameters.push({ name: '@assetId', value: assetId });
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  return resources as PortfolioValuation[];
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

  const container = await getPortfolioContainer();
  await container.items.create(asset);
  revalidatePortfolio(asset.id);
  return asset;
}

export async function updatePortfolioAsset(id: string, patch: Partial<PortfolioAssetInput>): Promise<PortfolioAsset> {
  const container = await getPortfolioContainer();
  const { resource } = await container.item(id, DEFAULT_USER_ID).read<PortfolioAsset>();
  if (!resource || resource.docType !== 'asset') throw new Error(`Portfolio asset ${id} not found.`);

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

  const { resource: updated } = await container.item(id, DEFAULT_USER_ID).replace(merged);
  revalidatePortfolio(id);
  return updated as PortfolioAsset;
}

async function resolveAssetForEntry(input: {
  assetId?: string;
  assetName: string;
  assetType: PortfolioAssetInput['assetType'];
  currency?: PortfolioAssetInput['currency'];
}): Promise<PortfolioAsset> {
  const container = await getPortfolioContainer();
  if (input.assetId) {
    const { resource } = await container.item(input.assetId, DEFAULT_USER_ID).read<PortfolioAsset>();
    if (resource && resource.docType === 'asset') return resource;
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
  const container = await getPortfolioContainer();
  await container.items.create(item);
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
  const container = await getPortfolioContainer();
  await container.items.create(item);
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
  const container = await getPortfolioContainer();
  const { resource } = await container.item(id, DEFAULT_USER_ID).read<PortfolioTransaction>();
  if (!resource || resource.docType !== 'transaction') throw new Error(`Portfolio transaction ${id} not found.`);

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

  const { resource: updated } = await container.item(id, DEFAULT_USER_ID).replace(merged);
  revalidatePortfolio(merged.assetId);
  return updated as PortfolioTransaction;
}

export async function updatePortfolioValuation(
  id: string,
  patch: Partial<PortfolioValuationInput>,
): Promise<PortfolioValuation> {
  const container = await getPortfolioContainer();
  const { resource } = await container.item(id, DEFAULT_USER_ID).read<PortfolioValuation>();
  if (!resource || resource.docType !== 'valuation') throw new Error(`Portfolio valuation ${id} not found.`);

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

  const { resource: updated } = await container.item(id, DEFAULT_USER_ID).replace(merged);
  revalidatePortfolio(merged.assetId);
  return updated as PortfolioValuation;
}

export async function deletePortfolioTransaction(id: string): Promise<void> {
  const container = await getPortfolioContainer();
  const { resource } = await container.item(id, DEFAULT_USER_ID).read<PortfolioTransaction>();
  await container.item(id, DEFAULT_USER_ID).delete();
  revalidatePortfolio(resource?.assetId);
}

export async function deletePortfolioValuation(id: string): Promise<void> {
  const container = await getPortfolioContainer();
  const { resource } = await container.item(id, DEFAULT_USER_ID).read<PortfolioValuation>();
  await container.item(id, DEFAULT_USER_ID).delete();
  revalidatePortfolio(resource?.assetId);
}

export async function deletePortfolioAsset(id: string): Promise<void> {
  const container = await getPortfolioContainer();
  const [transactions, valuations] = await Promise.all([
    getPortfolioTransactions(id),
    getPortfolioValuations(id),
  ]);

  await Promise.all([
    ...transactions.map(tx => container.item(tx.id, DEFAULT_USER_ID).delete()),
    ...valuations.map(v => container.item(v.id, DEFAULT_USER_ID).delete()),
    container.item(id, DEFAULT_USER_ID).delete(),
  ]);
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
  const container = await getPortfolioContainer();
  await container.items.create(item);
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

export async function ensurePortfolioCosmosContainerExists() {
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_PORTFOLIO_CONTAINER_ID;
  if (!containerId) throw new Error("COSMOS_DB_PORTFOLIO_CONTAINER_ID is not configured.");
  await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ['/userId'] },
  });
}

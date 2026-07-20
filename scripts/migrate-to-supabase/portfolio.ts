import { config } from 'dotenv';
config();

import cuid from 'cuid';
import { getCosmosContainerByName, queryAllCosmosItems, batchUpsert, countSupabaseRows } from './lib';

// The app's portfolio feature currently reads/writes the container named by
// COSMOS_DB_PORTFOLIO_CONTAINER_ID ("portfolio"), but that container is empty.
// The actual portfolio documents live in a container literally named
// "ortfolio" (missing the leading "p") from a historical typo. Migrate from
// there so no real data is left behind.
const PORTFOLIO_CONTAINER_NAME = 'ortfolio';
const LEGACY_INVESTMENTS_CONTAINER_NAME = 'investments';
const DEFAULT_USER_ID = 'default';

async function migrateCurrentPortfolioDocs() {
  const container = getCosmosContainerByName(PORTFOLIO_CONTAINER_NAME);
  const items = await queryAllCosmosItems<any>(container);
  console.log(`portfolio (docType-tagged): found ${items.length} docs in Cosmos container '${PORTFOLIO_CONTAINER_NAME}'`);

  const assets = items.filter(i => i.docType === 'asset');
  const transactions = items.filter(i => i.docType === 'transaction');
  const valuations = items.filter(i => i.docType === 'valuation');
  const aiImports = items.filter(i => i.docType === 'ai_import');

  await batchUpsert('portfolio_assets', assets.map(a => ({
    id: a.id,
    user_id: a.userId,
    name: a.name,
    asset_type: a.assetType,
    symbol: a.symbol ?? null,
    isin: a.isin ?? null,
    scheme_code: a.schemeCode ?? null,
    currency: a.currency,
    notes: a.notes ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt ?? null,
  })));

  await batchUpsert('portfolio_transactions', transactions.map(t => ({
    id: t.id,
    user_id: t.userId,
    asset_id: t.assetId,
    asset_name: t.assetName,
    asset_type: t.assetType,
    type: t.type,
    date: t.date,
    amount: t.amount,
    quantity: t.quantity ?? null,
    price_per_unit: t.pricePerUnit ?? null,
    charges: t.charges ?? null,
    taxes: t.taxes ?? null,
    currency: t.currency,
    notes: t.notes ?? null,
    source: t.source,
    created_at: t.createdAt,
    updated_at: t.updatedAt ?? null,
  })));

  await batchUpsert('portfolio_valuations', valuations.map(v => ({
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
  })));

  await batchUpsert('portfolio_ai_imports', aiImports.map(i => ({
    id: i.id,
    user_id: i.userId,
    input_type: i.inputType,
    raw_text: i.rawText ?? null,
    parsed_json: i.parsedJson ?? null,
    created_record_ids: i.createdRecordIds ?? [],
    created_at: i.createdAt,
  })));

  return { assetsSeen: assets.map((a: any) => a.name as string) };
}

function inferAssetType(name: string): string {
  return /fund/i.test(name) ? 'mutual_fund' : 'indian_equity';
}

/**
 * The legacy "investments" container (from a since-removed single-holding-record
 * feature) stores one flat row per holding: units, purchasePrice, totalInvested,
 * currentPrice, currentValue, purchaseDate. Reconstruct that as the current
 * portfolio model: one asset per unique name, one 'buy' transaction (from the
 * purchase fields) and one valuation (from the current-value fields) per row.
 */
async function migrateLegacyInvestments(alreadyMigratedAssetNames: string[]) {
  const container = getCosmosContainerByName(LEGACY_INVESTMENTS_CONTAINER_NAME);
  const items = await queryAllCosmosItems<any>(container);
  console.log(`legacy investments: found ${items.length} docs in Cosmos container '${LEGACY_INVESTMENTS_CONTAINER_NAME}'`);

  const seenNames = new Set(alreadyMigratedAssetNames.map(n => n.trim().toLowerCase()));
  const assetRows: Record<string, any>[] = [];
  const assetIdByName = new Map<string, string>();
  const transactionRows: Record<string, any>[] = [];
  const valuationRows: Record<string, any>[] = [];

  for (const item of items) {
    const name = String(item.name).trim();
    const key = name.toLowerCase();
    let assetId = assetIdByName.get(key);
    if (!assetId && !seenNames.has(key)) {
      assetId = cuid();
      assetIdByName.set(key, assetId);
      assetRows.push({
        id: assetId,
        user_id: DEFAULT_USER_ID,
        name,
        asset_type: inferAssetType(name),
        symbol: null,
        isin: null,
        scheme_code: null,
        currency: 'INR',
        notes: 'Migrated from legacy investments container.',
        created_at: item.createdAt,
        updated_at: item.updatedAt ?? null,
      });
    }
    if (!assetId) {
      // Name collides with an asset already migrated from the docType-tagged
      // container; skip creating a duplicate and just log it for manual review.
      console.warn(`legacy investments: skipping "${name}" — an asset with this name already exists from the current portfolio container.`);
      continue;
    }

    transactionRows.push({
      id: cuid(),
      user_id: DEFAULT_USER_ID,
      asset_id: assetId,
      asset_name: name,
      asset_type: inferAssetType(name),
      type: 'buy',
      date: (item.purchaseDate || item.createdAt).slice(0, 10),
      amount: item.totalInvested,
      quantity: item.units ?? null,
      price_per_unit: item.purchasePrice ?? null,
      charges: null,
      taxes: null,
      currency: 'INR',
      notes: 'Migrated from legacy investments container.',
      source: 'manual',
      created_at: item.createdAt,
      updated_at: item.updatedAt ?? null,
    });

    valuationRows.push({
      id: cuid(),
      user_id: DEFAULT_USER_ID,
      asset_id: assetId,
      asset_name: name,
      asset_type: inferAssetType(name),
      date: (item.updatedAt || item.createdAt).slice(0, 10),
      total_value: item.currentValue,
      quantity: item.units ?? null,
      price_per_unit: item.currentPrice ?? null,
      currency: 'INR',
      notes: 'Migrated from legacy investments container.',
      source: 'manual',
      created_at: item.updatedAt || item.createdAt,
      updated_at: null,
    });
  }

  console.log(`legacy investments: creating ${assetRows.length} new assets, ${transactionRows.length} buy transactions, ${valuationRows.length} valuations`);
  await batchUpsert('portfolio_assets', assetRows);
  await batchUpsert('portfolio_transactions', transactionRows);
  await batchUpsert('portfolio_valuations', valuationRows);
}

async function main() {
  const { assetsSeen } = await migrateCurrentPortfolioDocs();
  await migrateLegacyInvestments(assetsSeen);

  console.log(`portfolio_assets: ${await countSupabaseRows('portfolio_assets')} rows now in Supabase`);
  console.log(`portfolio_transactions: ${await countSupabaseRows('portfolio_transactions')} rows now in Supabase`);
  console.log(`portfolio_valuations: ${await countSupabaseRows('portfolio_valuations')} rows now in Supabase`);
  console.log(`portfolio_ai_imports: ${await countSupabaseRows('portfolio_ai_imports')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

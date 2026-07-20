import { config } from 'dotenv';
config();

import { getBlobContainer, readBlobJson, getCosmosContainer, queryAllCosmosItems, batchUpsert, countSupabaseRows } from './lib';

async function migrateCategories() {
  const categories = await readBlobJson<any[]>('internal/data/categories.json', []);
  const rows = categories.map(c => ({ id: c.id, name: c.name, type: c.type }));
  console.log(`categories: found ${rows.length} in blob`);
  await batchUpsert('categories', rows);
  console.log(`categories: ${await countSupabaseRows('categories')} rows now in Supabase`);
}

async function migratePaymentMethods() {
  const methods = await readBlobJson<any[]>('internal/data/payment-methods.json', []);
  const rows = methods.map(m => ({ id: m.id, name: m.name, type: m.type }));
  console.log(`payment_methods: found ${rows.length} in blob`);
  await batchUpsert('payment_methods', rows);
  console.log(`payment_methods: ${await countSupabaseRows('payment_methods')} rows now in Supabase`);
}

async function migrateTransactions() {
  const container = getCosmosContainer('COSMOS_DB_TRANSACTIONS_CONTAINER_ID');
  const items = await queryAllCosmosItems<any>(container);
  console.log(`transactions: found ${items.length} in Cosmos`);
  const rows = items.map(t => ({
    id: t.id,
    type: t.type,
    date: t.date?.slice(0, 10),
    amount: t.amount,
    description: t.description,
    category_id: t.categoryId ?? null,
    payment_method_id: t.paymentMethodId ?? null,
    source: t.source ?? null,
    expense_type: t.expenseType ?? null,
    is_split: t.isSplit ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }));
  await batchUpsert('transactions', rows);
  console.log(`transactions: ${await countSupabaseRows('transactions')} rows now in Supabase`);
}

async function main() {
  await getBlobContainer(); // fail fast if env vars missing
  await migrateCategories();
  await migratePaymentMethods();
  await migrateTransactions();
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

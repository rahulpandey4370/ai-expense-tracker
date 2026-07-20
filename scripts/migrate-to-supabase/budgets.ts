import { config } from 'dotenv';
config();

import { readBlobJson, batchUpsert, countSupabaseRows } from './lib';

async function main() {
  const budgets = await readBlobJson<any[]>('internal/data/budgets.json', []);
  console.log(`budgets: found ${budgets.length} in blob`);
  const rows = budgets.map(b => ({
    id: b.id,
    name: b.name,
    amount: b.amount,
    type: b.type,
    target_id: b.targetId,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  }));
  await batchUpsert('budgets', rows);
  console.log(`budgets: ${await countSupabaseRows('budgets')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

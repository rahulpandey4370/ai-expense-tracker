import { config } from 'dotenv';
config();

import { readBlobJson, batchUpsert, countSupabaseRows } from './lib';

async function main() {
  const items = await readBlobJson<any[]>('internal/data/savings-allocations.json', []);
  console.log(`savings_allocations: found ${items.length} in blob`);
  const rows = items.map(s => ({
    id: s.id,
    name: s.name,
    location: s.location,
    category: s.category,
    amount: s.amount,
    as_of_date: s.asOfDate,
    notes: s.notes ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }));
  await batchUpsert('savings_allocations', rows);
  console.log(`savings_allocations: ${await countSupabaseRows('savings_allocations')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

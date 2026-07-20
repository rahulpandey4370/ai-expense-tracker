import { config } from 'dotenv';
config();

import { readBlobJson, batchUpsert, countSupabaseRows } from './lib';

async function main() {
  const rules = await readBlobJson<any[]>('internal/data/recurring-rules.json', []);
  console.log(`recurring_rules: found ${rules.length} in blob`);
  const rows = rules.map(r => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    description: r.description,
    category_id: r.categoryId ?? null,
    payment_method_id: r.paymentMethodId ?? null,
    source: r.source ?? null,
    expense_type: r.expenseType ?? null,
    day_of_month: r.dayOfMonth,
    start_date: r.startDate,
    end_date: r.endDate ?? null,
    is_active: r.isActive,
    last_generated_date: r.lastGeneratedDate ?? null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }));
  await batchUpsert('recurring_rules', rows);
  console.log(`recurring_rules: ${await countSupabaseRows('recurring_rules')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

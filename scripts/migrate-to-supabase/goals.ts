import { config } from 'dotenv';
config();

import { listBlobJsonFiles, batchUpsert, countSupabaseRows } from './lib';

async function main() {
  const goalRows: Record<string, any>[] = [];
  const allocationRows: Record<string, any>[] = [];

  for await (const { name, data: goal } of listBlobJsonFiles('goals/')) {
    console.log(`goals: reading ${name}`);
    goalRows.push({
      id: goal.id,
      description: goal.description,
      target_amount: goal.targetAmount,
      target_duration_months: goal.targetDurationMonths,
      amount_saved_so_far: goal.amountSavedSoFar ?? 0,
      status: goal.status ?? 'active',
      created_at: goal.createdAt,
      updated_at: goal.updatedAt,
    });
    for (const alloc of goal.allocations || []) {
      allocationRows.push({
        id: alloc.id,
        goal_id: goal.id,
        name: alloc.name,
        amount: alloc.amount,
        created_at: alloc.createdAt || goal.createdAt,
        updated_at: alloc.updatedAt || alloc.createdAt || goal.updatedAt,
      });
    }
  }

  console.log(`goals: found ${goalRows.length} goals, ${allocationRows.length} allocations in blob`);
  await batchUpsert('goals', goalRows);
  await batchUpsert('goal_allocations', allocationRows);
  console.log(`goals: ${await countSupabaseRows('goals')} rows now in Supabase`);
  console.log(`goal_allocations: ${await countSupabaseRows('goal_allocations')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

import { config } from 'dotenv';
config();

import { getCosmosContainer, queryAllCosmosItems, batchUpsert, countSupabaseRows, getSupabaseClient } from './lib';

async function migrateSplitUsers() {
  const container = getCosmosContainer('COSMOS_DB_SPLIT_USERS_CONTAINER_ID');
  const items = await queryAllCosmosItems<any>(container);
  console.log(`split_users: found ${items.length} in Cosmos`);
  const rows = items.map(u => ({
    id: u.id,
    name: u.name,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }));
  await batchUpsert('split_users', rows);
  console.log(`split_users: ${await countSupabaseRows('split_users')} rows now in Supabase`);
}

async function migrateSplitExpenses() {
  const container = getCosmosContainer('COSMOS_DB_SPLIT_EXPENSES_CONTAINER_ID');
  const items = await queryAllCosmosItems<any>(container);
  console.log(`split_expenses: found ${items.length} in Cosmos`);

  const expenseRows = items.map(e => ({
    id: e.id,
    title: e.title,
    date: e.date,
    total_amount: e.totalAmount,
    paid_by_id: e.paidById,
    split_method: e.splitMethod,
    is_fully_settled: e.isFullySettled,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }));
  await batchUpsert('split_expenses', expenseRows);

  // Participants have no natural id in the source data; clear existing rows for
  // these expense ids first so re-running this script doesn't duplicate them.
  const supabase = getSupabaseClient();
  const expenseIds = items.map(e => e.id);
  if (expenseIds.length > 0) {
    const { error } = await supabase.from('split_expense_participants').delete().in('split_expense_id', expenseIds);
    if (error) throw new Error(`Failed to clear existing participants before re-insert: ${error.message}`);
  }

  const participantRows = items.flatMap(e =>
    (e.participants || []).map((p: any) => ({
      split_expense_id: e.id,
      user_id: p.userId,
      share_amount: p.shareAmount,
      is_settled: p.isSettled,
    }))
  );
  if (participantRows.length > 0) {
    const { error } = await supabase.from('split_expense_participants').insert(participantRows);
    if (error) throw new Error(`Insert into split_expense_participants failed: ${error.message}`);
  }

  console.log(`split_expenses: ${await countSupabaseRows('split_expenses')} rows now in Supabase`);
  console.log(`split_expense_participants: ${await countSupabaseRows('split_expense_participants')} rows now in Supabase`);
}

async function main() {
  await migrateSplitUsers();
  await migrateSplitExpenses();
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

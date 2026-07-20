import { config } from 'dotenv';
config();

import { writeFileSync, mkdirSync } from 'fs';
import { getCosmosContainer, queryAllCosmosItems, getSupabaseClient } from './lib';

// One-off correction for the UTC date-shift introduced during migration.
// The original migration stored `t.date.slice(0,10)` (UTC day); for IST-midnight
// instants (…T18:30:00Z) that rolled the day back one. Cosmos still holds the
// original full timestamps, so we recompute the correct app-timezone (IST)
// calendar day per transaction and fix Supabase.
//
// DRY RUN by default (reports what would change). Pass --apply to write.
// Always writes a backup of current Supabase {id,date} before applying.

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const APPLY = process.argv.includes('--apply');

function appCalendarDay(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value instanceof Date ? value : new Date(value));
}

async function readAllSupabaseDates(): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const map = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,date')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) map.set(r.id, r.date);
    if (data.length < pageSize) break;
  }
  return map;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'} | timezone: ${APP_TIMEZONE}`);

  const container = getCosmosContainer('COSMOS_DB_TRANSACTIONS_CONTAINER_ID');
  const cosmos = await queryAllCosmosItems<any>(container);
  console.log(`Cosmos transactions (ground truth): ${cosmos.length}`);

  const current = await readAllSupabaseDates();
  console.log(`Supabase transactions read: ${current.size}`);

  // Correct day per id, and which need fixing.
  const correctById = new Map<string, string>();
  const needFix: { id: string; from: string | undefined; to: string }[] = [];
  for (const t of cosmos) {
    if (!t.date) continue;
    const correct = appCalendarDay(t.date);
    correctById.set(t.id, correct);
    const cur = current.get(t.id);
    if (cur !== correct) needFix.push({ id: t.id, from: cur, to: correct });
  }

  // Supabase rows not present in Cosmos (created after migration) — can't be
  // recomputed from ground truth; report for manual review.
  const orphans = [...current.keys()].filter(id => !correctById.has(id));

  console.log(`\nRows needing correction: ${needFix.length}`);
  console.log('sample:', needFix.slice(0, 10));
  console.log(`\nSupabase rows not in Cosmos (post-migration, NOT auto-corrected): ${orphans.length}`);
  if (orphans.length) console.log('orphan ids:', orphans.slice(0, 30));

  // Backup current dates always.
  mkdirSync('migration-backups', { recursive: true });
  const stamp = process.argv.find(a => a.startsWith('--stamp='))?.split('=')[1] || 'manual';
  const backupPath = `migration-backups/transaction-dates-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify([...current.entries()].map(([id, date]) => ({ id, date })), null, 2));
  console.log(`\nBackup of current dates written to ${backupPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN complete. Re-run with --apply to write these corrections.');
    return;
  }

  // Apply: group by target day, update in batches.
  const byDay = new Map<string, string[]>();
  for (const f of needFix) {
    const list = byDay.get(f.to) || [];
    list.push(f.id);
    byDay.set(f.to, list);
  }
  const supabase = getSupabaseClient();
  let updated = 0;
  for (const [day, ids] of byDay) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase.from('transactions').update({ date: day }).in('id', chunk);
      if (error) throw new Error(`Update to ${day} failed: ${error.message}`);
      updated += chunk.length;
    }
  }
  console.log(`\nApplied: ${updated} rows corrected.`);

  // Verify.
  const after = await readAllSupabaseDates();
  let stillWrong = 0;
  for (const [id, correct] of correctById) {
    if (after.get(id) !== correct) stillWrong++;
  }
  console.log(`Verification: rows still mismatching ground truth = ${stillWrong} (expected 0).`);
}

main().catch(e => { console.error('FAIL', e.message, e.stack); process.exit(1); });

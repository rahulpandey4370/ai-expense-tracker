import { config } from 'dotenv';
config();

import { listBlobJsonFiles, batchUpsert, countSupabaseRows } from './lib';

function monthlyIdFromFilename(name: string): string {
  // internal/data/monthly-reports/2024-03.json -> monthly:2024-03
  const match = name.match(/(\d{4}-\d{2})\.json$/);
  return `monthly:${match ? match[1] : name}`;
}

function yearlyIdFromFilename(name: string): string {
  // internal/data/yearly-reports/2024.json -> yearly:2024
  const match = name.match(/(\d{4})\.json$/);
  return `yearly:${match ? match[1] : name}`;
}

async function main() {
  const rows: Record<string, any>[] = [];

  for await (const { name, data } of listBlobJsonFiles('internal/data/monthly-reports/')) {
    console.log(`reports: reading ${name}`);
    rows.push({
      id: monthlyIdFromFilename(name),
      period_type: 'monthly',
      payload: data,
      created_at: data.generatedAt || new Date(0).toISOString(),
    });
  }

  for await (const { name, data } of listBlobJsonFiles('internal/data/yearly-reports/')) {
    console.log(`reports: reading ${name}`);
    rows.push({
      id: yearlyIdFromFilename(name),
      period_type: 'yearly',
      payload: data,
      created_at: data.generatedAt || new Date(0).toISOString(),
    });
  }

  console.log(`report_cache: found ${rows.length} cached reports in blob`);
  await batchUpsert('report_cache', rows);
  console.log(`report_cache: ${await countSupabaseRows('report_cache')} rows now in Supabase`);
}

main().catch(err => {
  console.error('Migration failed:', err.message, err.stack);
  process.exit(1);
});

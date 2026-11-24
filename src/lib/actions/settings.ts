'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';

/** Settings → "Count the full amount of splits I paid". `ready` is false until supabase/split-full-amount.sql has been run. */
export async function getSplitFullAmount(): Promise<{ on: boolean; ready: boolean }> {
  const { data, error } = await getSupabase().from('app_settings').select('value').eq('key', 'split_full_amount').maybeSingle();
  if (error) return { on: false, ready: false };
  return { on: data?.value === true, ready: true };
}

/** Flips the switch; the database recalculates every transaction's net_amount in the same call. */
export async function setSplitFullAmount(on: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_split_full_amount', { p_on: on });
  if (error) throw new Error(`Could not change the setting: ${error.message}`);
  revalidatePath('/', 'layout');
}

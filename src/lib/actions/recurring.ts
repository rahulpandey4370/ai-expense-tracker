'use server';

import { getSupabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { addTransaction } from './transactions';
import {
  RecurringRuleInputSchema,
  type RecurringRule,
  type RecurringRuleInput,
} from '@/lib/types';

function toRecurringRule(row: any): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    description: row.description,
    categoryId: row.category_id ?? undefined,
    paymentMethodId: row.payment_method_id ?? undefined,
    source: row.source ?? undefined,
    expenseType: row.expense_type ?? undefined,
    dayOfMonth: row.day_of_month,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    isActive: row.is_active,
    lastGeneratedDate: row.last_generated_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRuleRow(rule: RecurringRule): Record<string, any> {
  return {
    id: rule.id,
    type: rule.type,
    amount: rule.amount,
    description: rule.description,
    category_id: rule.categoryId ?? null,
    payment_method_id: rule.paymentMethodId ?? null,
    source: rule.source ?? null,
    expense_type: rule.expenseType ?? null,
    day_of_month: rule.dayOfMonth,
    start_date: rule.startDate,
    end_date: rule.endDate ?? null,
    is_active: rule.isActive,
    last_generated_date: rule.lastGeneratedDate ?? null,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

export async function getRecurringRules(): Promise<RecurringRule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('recurring_rules').select('*');
  if (error) {
    console.warn('getRecurringRules failed', error.message);
    return [];
  }
  return (data as any[]).map(toRecurringRule);
}

export async function addRecurringRule(data: RecurringRuleInput): Promise<RecurringRule> {
  const validated = RecurringRuleInputSchema.parse(data);
  const now = new Date().toISOString();
  const newRule: RecurringRule = { id: cuid(), ...validated, createdAt: now, updatedAt: now };

  const supabase = getSupabase();
  const { error } = await supabase.from('recurring_rules').insert(toRuleRow(newRule));
  if (error) throw new Error(`Could not add recurring rule. Original error: ${error.message}`);

  revalidatePath('/recurring');
  return newRule;
}

export async function updateRecurringRule(id: string, patch: Partial<RecurringRuleInput>): Promise<RecurringRule> {
  const supabase = getSupabase();
  const { data: existingRows, error: readError } = await supabase.from('recurring_rules').select('*').eq('id', id).limit(1);
  if (readError) throw new Error(`Could not retrieve recurring rule. Original error: ${readError.message}`);
  if (!existingRows || existingRows.length === 0) throw new Error(`Recurring rule ${id} not found`);

  const existing = toRecurringRule(existingRows[0]);
  const merged: RecurringRule = { ...existing, ...patch, updatedAt: new Date().toISOString() };

  const { data: updatedRows, error: updateError } = await supabase
    .from('recurring_rules')
    .update(toRuleRow(merged))
    .eq('id', id)
    .select();
  if (updateError) throw new Error(`Could not update recurring rule. Original error: ${updateError.message}`);

  revalidatePath('/recurring');
  return toRecurringRule(updatedRows![0]);
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error, count } = await supabase.from('recurring_rules').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(`Could not delete recurring rule. Original error: ${error.message}`);
  if (!count) throw new Error(`Recurring rule ${id} not found`);
  revalidatePath('/recurring');
}

// --- Materialization ---
function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function clampDayToMonth(year: number, monthIndex0: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, monthIndex0));
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function* iterateDueDates(rule: RecurringRule, today: Date): Generator<Date> {
  const start = new Date(rule.startDate + "T00:00:00");
  const end = rule.endDate ? new Date(rule.endDate + "T23:59:59") : null;
  const lastGen = rule.lastGeneratedDate ? new Date(rule.lastGeneratedDate + "T00:00:00") : null;

  let cursor: Date;
  if (lastGen) {
    cursor = new Date(lastGen.getFullYear(), lastGen.getMonth() + 1, 1);
  } else {
    cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  }

  while (cursor <= today) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const day = clampDayToMonth(y, m, rule.dayOfMonth);
    const due = new Date(y, m, day);

    if (due >= start && (!end || due <= end) && due <= today) {
      yield due;
    }
    cursor = new Date(y, m + 1, 1);
  }
}

/**
 * Lazy materialization. Walk every active rule, insert a transaction for each
 * past-due month that hasn't yet been materialized, then update the rule's
 * lastGeneratedDate.
 *
 * Returns the number of transactions actually inserted.
 */
export async function materializeRecurringTransactions(): Promise<{ inserted: number; ruleErrors: number }> {
  const rules = await getRecurringRules();
  if (rules.length === 0) return { inserted: 0, ruleErrors: 0 };

  const today = new Date();
  let inserted = 0;
  let ruleErrors = 0;
  const supabase = getSupabase();

  for (const rule of rules) {
    if (!rule.isActive) continue;
    try {
      let lastInsertedYmd: string | undefined;
      for (const due of iterateDueDates(rule, today)) {
        await addTransaction({
          type: rule.type,
          date: due,
          amount: rule.amount,
          description: `🔁 ${rule.description}`,
          categoryId: rule.categoryId,
          paymentMethodId: rule.paymentMethodId,
          source: rule.source,
          expenseType: rule.expenseType,
        });
        inserted += 1;
        lastInsertedYmd = ymd(due);
      }
      if (lastInsertedYmd) {
        const { error } = await supabase
          .from('recurring_rules')
          .update({ last_generated_date: lastInsertedYmd, updated_at: new Date().toISOString() })
          .eq('id', rule.id);
        if (error) throw error;
      }
    } catch (err: any) {
      console.error(`materializeRecurringTransactions: rule ${rule.id} failed`, err?.message);
      ruleErrors += 1;
    }
  }

  return { inserted, ruleErrors };
}

/**
 * Manually trigger a single rule for the current calendar month with today's
 * date. Useful when the actual expense happens before the rule's scheduled
 * dayOfMonth (e.g. rent due on the 7th got paid on the 5th). Marks the rule's
 * lastGeneratedDate so the lazy materializer skips this month going forward.
 */
export async function triggerRecurringRuleNow(ruleId: string): Promise<{ inserted: boolean; reason?: string }> {
  const supabase = getSupabase();
  const { data: rows, error: readError } = await supabase.from('recurring_rules').select('*').eq('id', ruleId).limit(1);
  if (readError) throw new Error(`Could not retrieve recurring rule. Original error: ${readError.message}`);
  if (!rows || rows.length === 0) throw new Error(`Recurring rule ${ruleId} not found`);
  const rule = toRecurringRule(rows[0]);

  if (!rule.isActive) {
    return { inserted: false, reason: "Rule is paused. Resume it first." };
  }

  const today = new Date();
  const ymdToday = ymd(today);

  const start = new Date(rule.startDate + "T00:00:00");
  if (today < start) {
    return { inserted: false, reason: `Rule starts on ${rule.startDate}.` };
  }
  if (rule.endDate) {
    const end = new Date(rule.endDate + "T23:59:59");
    if (today > end) return { inserted: false, reason: `Rule ended on ${rule.endDate}.` };
  }

  if (rule.lastGeneratedDate) {
    const lastGen = new Date(rule.lastGeneratedDate + "T00:00:00");
    if (lastGen.getFullYear() === today.getFullYear() && lastGen.getMonth() === today.getMonth()) {
      return { inserted: false, reason: `Already generated this month on ${rule.lastGeneratedDate}.` };
    }
  }

  await addTransaction({
    type: rule.type,
    date: today,
    amount: rule.amount,
    description: `🔁 ${rule.description}`,
    categoryId: rule.categoryId,
    paymentMethodId: rule.paymentMethodId,
    source: rule.source,
    expenseType: rule.expenseType,
  });

  const { error } = await supabase
    .from('recurring_rules')
    .update({ last_generated_date: ymdToday, updated_at: new Date().toISOString() })
    .eq('id', ruleId);
  if (error) throw new Error(`Could not update recurring rule after trigger. Original error: ${error.message}`);

  revalidatePath('/recurring');
  return { inserted: true };
}


'use server';

import { getSupabase } from '@/lib/supabase';
import type { SplitUser, SplitUserInput, RawSplitExpense, SplitExpenseInput, AppSplitExpense, UserBalance } from '@/lib/types';
import { SplitUserInputSchema, SplitExpenseInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { addTransaction } from './transactions';

const SPLIT_EXPENSES_PAGE_PATH = '/split-expenses';
const MAIN_USER_ID = "me";

function toSplitUser(row: any): SplitUser {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toRawSplitExpense(row: any, participants: any[]): RawSplitExpense {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    totalAmount: row.total_amount,
    paidById: row.paid_by_id,
    participants: participants.map(p => ({ userId: p.user_id, shareAmount: p.share_amount, isSettled: p.is_settled })),
    splitMethod: row.split_method,
    isFullySettled: row.is_fully_settled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Split User Functions ---
export async function addSplitUser(data: SplitUserInput): Promise<SplitUser> {
  const validation = SplitUserInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid split user data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newUser: SplitUser = { id, ...validation.data, createdAt: now, updatedAt: now };

  const supabase = getSupabase();
  const { error } = await supabase.from('split_users').insert({ id, name: newUser.name, created_at: now, updated_at: now });
  if (error) throw new Error(`Could not add split user to Supabase. Original error: ${error.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return newUser;
}

export async function getSplitUsers(): Promise<SplitUser[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('split_users').select('*').order('name', { ascending: true });
  if (error) {
    console.error('Supabase Error (getSplitUsers):', error.message);
    throw new Error(`Could not fetch split users from Supabase. Original error: ${error.message}`);
  }
  return (data as any[]).map(toSplitUser);
}

export async function deleteSplitUser(id: string): Promise<{ success: boolean }> {
  if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    throw new Error(`Invalid split user ID provided for delete. Received ID: '${id}'`);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('split_users').delete().eq('id', id);
  if (error) throw new Error(`Could not delete split user from Supabase. Original error: ${error.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return { success: true };
}


// --- Split Expense Functions ---

export async function addSplitExpense(data: SplitExpenseInput): Promise<RawSplitExpense> {
  const validation = SplitExpenseInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    throw new Error(`Invalid split expense data: ${readableErrors || "Validation failed."}`);
  }
  const { totalAmount, participants, splitMethod, paidById } = validation.data;
  let calculatedParticipants: RawSplitExpense['participants'] = [];
  let myShare = 0;

  if (splitMethod === 'equally') {
    const shareAmount = totalAmount / participants.length;
    calculatedParticipants = participants.map(p => {
        const isPayer = p.userId === paidById;
        if (p.userId === MAIN_USER_ID) myShare = shareAmount;
        return {
            userId: p.userId,
            shareAmount: parseFloat(shareAmount.toFixed(2)),
            isSettled: isPayer,
        };
    });
  } else { // 'custom'
     calculatedParticipants = participants.map(p => {
        const isPayer = p.userId === paidById;
        const customShare = p.customShare || 0;
        if (p.userId === MAIN_USER_ID) myShare = customShare;
        return {
            userId: p.userId,
            shareAmount: customShare,
            isSettled: isPayer,
        };
    });
  }

  const id = cuid();
  const now = new Date().toISOString();
  const isFullySettled = calculatedParticipants.every(p => p.isSettled);

  const newSplitExpense: RawSplitExpense = {
    id,
    title: validation.data.title,
    date: validation.data.date.toISOString(),
    totalAmount,
    paidById,
    participants: calculatedParticipants,
    splitMethod,
    isFullySettled,
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getSupabase();
  const { error: insertError } = await supabase.from('split_expenses').insert({
    id,
    title: newSplitExpense.title,
    date: newSplitExpense.date,
    total_amount: newSplitExpense.totalAmount,
    paid_by_id: newSplitExpense.paidById,
    split_method: newSplitExpense.splitMethod,
    is_fully_settled: newSplitExpense.isFullySettled,
    created_at: now,
    updated_at: now,
  });
  if (insertError) throw new Error(`Could not add split expense. Original error: ${insertError.message}`);

  const { error: participantsError } = await supabase.from('split_expense_participants').insert(
    calculatedParticipants.map(p => ({
      split_expense_id: id,
      user_id: p.userId,
      share_amount: p.shareAmount,
      is_settled: p.isSettled,
    }))
  );
  if (participantsError) throw new Error(`Could not add split expense participants. Original error: ${participantsError.message}`);

  // If "I" paid, add my share as a regular transaction
  if (paidById === MAIN_USER_ID && myShare > 0 && validation.data.personalExpenseDetails) {
      await addTransaction({
          type: 'expense',
          date: validation.data.date,
          amount: myShare,
          description: `My share of: ${validation.data.title}`,
          categoryId: validation.data.personalExpenseDetails.categoryId,
          paymentMethodId: validation.data.personalExpenseDetails.paymentMethodId,
          expenseType: 'want', // Defaulting to want, could be a future enhancement
      });
  }

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return newSplitExpense;
}

export async function getSplitExpenses(options?: { limit?: number }): Promise<AppSplitExpense[]> {
  const supabase = getSupabase();
  const users = await getSplitUsers();
  // Add "Me" to the user map for populating participant details
  const meUser: SplitUser = { id: MAIN_USER_ID, name: 'Me', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const userMap = new Map([...users, meUser].map(u => [u.id, u]));

  let query = supabase.from('split_expenses').select('*').order('date', { ascending: false });
  if (options?.limit) query = query.limit(options.limit);

  const { data: expenseRows, error } = await query;
  if (error) {
    console.error('Supabase Error (getSplitExpenses):', error.message);
    throw new Error(`Could not fetch split expenses. Original error: ${error.message}`);
  }
  if (!expenseRows || expenseRows.length === 0) return [];

  const expenseIds = expenseRows.map(r => r.id);
  const { data: participantRows, error: participantsError } = await supabase
    .from('split_expense_participants')
    .select('*')
    .in('split_expense_id', expenseIds);
  if (participantsError) throw new Error(`Could not fetch split expense participants. Original error: ${participantsError.message}`);

  const participantsByExpense = new Map<string, any[]>();
  for (const row of participantRows as any[]) {
    const list = participantsByExpense.get(row.split_expense_id) || [];
    list.push(row);
    participantsByExpense.set(row.split_expense_id, list);
  }

  const appExpenses: AppSplitExpense[] = expenseRows.map(row => {
    const raw = toRawSplitExpense(row, participantsByExpense.get(row.id) || []);
    const paidBy = userMap.get(raw.paidById);
    if (!paidBy) return null;

    const populatedParticipants = raw.participants.map(p => {
      const user = userMap.get(p.userId);
      return user ? { user, shareAmount: p.shareAmount, isSettled: p.isSettled } : null;
    }).filter(Boolean) as AppSplitExpense['participants'];

    if (populatedParticipants.length !== raw.participants.length) return null;

    return {
      ...raw,
      date: new Date(raw.date),
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      paidBy,
      participants: populatedParticipants,
    };
  }).filter(Boolean) as AppSplitExpense[];

  return appExpenses;
}

export async function settleParticipantShare(expenseId: string, participantUserId: string): Promise<RawSplitExpense> {
  const supabase = getSupabase();
  const { data: expenseRow, error: readError } = await supabase.from('split_expenses').select('*').eq('id', expenseId).single();
  if (readError || !expenseRow) throw new Error(`Split expense with ID ${expenseId} not found.`);

  const { data: participantRows, error: participantsError } = await supabase
    .from('split_expense_participants')
    .select('*')
    .eq('split_expense_id', expenseId);
  if (participantsError) throw new Error(`Could not load participants. Original error: ${participantsError.message}`);

  const participantRow = (participantRows as any[]).find(p => p.user_id === participantUserId);
  if (!participantRow) throw new Error(`Participant with ID ${participantUserId} not found in this expense.`);

  const { error: updateParticipantError } = await supabase
    .from('split_expense_participants')
    .update({ is_settled: true })
    .eq('split_expense_id', expenseId)
    .eq('user_id', participantUserId);
  if (updateParticipantError) throw new Error(`Could not settle participant share. Original error: ${updateParticipantError.message}`);

  const updatedParticipants = (participantRows as any[]).map(p => p.user_id === participantUserId ? { ...p, is_settled: true } : p);
  const isFullySettled = updatedParticipants.every(p => p.is_settled);
  const updatedAt = new Date().toISOString();

  const { data: updatedExpenseRow, error: updateExpenseError } = await supabase
    .from('split_expenses')
    .update({ is_fully_settled: isFullySettled, updated_at: updatedAt })
    .eq('id', expenseId)
    .select()
    .single();
  if (updateExpenseError) throw new Error(`Could not update split expense settlement status. Original error: ${updateExpenseError.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return toRawSplitExpense(updatedExpenseRow, updatedParticipants);
}

export async function getSplitBalances(): Promise<UserBalance[]> {
    const expenses = await getSplitExpenses();
    const users = await getSplitUsers();

    const meUser: SplitUser = { id: MAIN_USER_ID, name: 'Me', createdAt: '', updatedAt: '' };
    const allUsers = [meUser, ...users];
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));

    const balances: Record<string, number> = {};
    allUsers.forEach(u => balances[u.id] = 0);

    for (const expense of expenses) {
        if (expense.isFullySettled) continue;

        for (const p of expense.participants) {
            if (!p.isSettled) {
                // Participant owes money to the payer
                balances[p.user.id] = (balances[p.user.id] || 0) - p.shareAmount;
                balances[expense.paidBy.id] = (balances[expense.paidBy.id] || 0) + p.shareAmount;
            }
        }
    }

    const creditors: { id: string, amount: number }[] = [];
    const debtors: { id: string, amount: number }[] = [];

    Object.entries(balances).forEach(([userId, amount]) => {
        if (amount > 0) {
            creditors.push({ id: userId, amount });
        } else if (amount < 0) {
            debtors.push({ id: userId, amount: -amount });
        }
    });

    const settlements: { from: string, to: string, amount: number }[] = [];

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const settlementAmount = Math.min(debtor.amount, creditor.amount);

        if (settlementAmount > 0.01) {
            settlements.push({ from: debtor.id, to: creditor.id, amount: settlementAmount });
            debtor.amount -= settlementAmount;
            creditor.amount -= settlementAmount;
        }

        if (debtor.amount < 0.01) i++;
        if (creditor.amount < 0.01) j++;
    }

    const finalBalances: Record<string, UserBalance> = {};
    allUsers.forEach(u => {
        finalBalances[u.id] = {
            userId: u.id,
            userName: u.name,
            netAmount: balances[u.id] || 0,
            owes: [],
            owedBy: []
        };
    });

    settlements.forEach(s => {
        finalBalances[s.from].owes.push({
            toUserId: s.to,
            toUserName: userMap.get(s.to) || 'Unknown',
            amount: parseFloat(s.amount.toFixed(2))
        });
        finalBalances[s.to].owedBy.push({
            fromUserId: s.from,
            fromUserName: userMap.get(s.from) || 'Unknown',
            amount: parseFloat(s.amount.toFixed(2))
        });
    });

    return Object.values(finalBalances).sort((a,b) => a.userName.localeCompare(b.userName));
}


export async function deleteSplitExpense(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabase();
  const { error } = await supabase.from('split_expenses').delete().eq('id', id);
  if (error) throw new Error(`Could not delete split expense. Original error: ${error.message}`);

  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return { success: true };
}

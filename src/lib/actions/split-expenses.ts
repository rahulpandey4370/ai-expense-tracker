
'use server';

import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import type { SplitUser, SplitUserInput, RawSplitExpense, SplitExpenseInput, AppSplitExpense, UserBalance, SplitMethod } from '@/lib/types';
import { SplitUserInputSchema, SplitExpenseInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';
import { addTransaction } from './transactions';

const SPLIT_EXPENSES_PAGE_PATH = '/split-expenses';
const MAIN_USER_ID = "me"; 

let splitUsersContainerInstance: CosmosContainer;
let splitExpensesContainerInstance: CosmosContainer;

// --- Azure Cosmos DB Client Helper ---
async function getCosmosClientAndDb() {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;

  if (!endpoint || !key || !databaseId) {
    console.error("CosmosDB Critical Error: Core Cosmos DB environment variables are not configured (ENDPOINT, KEY, DATABASE_ID).");
    throw new Error("Cosmos DB core environment variables are not fully configured.");
  }
  const cosmosClient = new CosmosClient({ endpoint, key });
  const database = cosmosClient.database(databaseId);
  return { database };
}

async function getSplitUsersContainer(): Promise<CosmosContainer> {
  if (splitUsersContainerInstance) {
    return splitUsersContainerInstance;
  }
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_SPLIT_USERS_CONTAINER_ID;
  if (!containerId) {
    console.error("CosmosDB Critical Error: COSMOS_DB_SPLIT_USERS_CONTAINER_ID is not configured.");
    throw new Error("Cosmos DB Split Users container ID is not configured.");
  }
  splitUsersContainerInstance = database.container(containerId);
  return splitUsersContainerInstance;
}

async function getSplitExpensesContainer(): Promise<CosmosContainer> {
  if (splitExpensesContainerInstance) {
    return splitExpensesContainerInstance;
  }
  const { database } = await getCosmosClientAndDb();
  const containerId = process.env.COSMOS_DB_SPLIT_EXPENSES_CONTAINER_ID;
  if (!containerId) {
    console.error("CosmosDB Critical Error: COSMOS_DB_SPLIT_EXPENSES_CONTAINER_ID is not configured.");
    throw new Error("Cosmos DB Split Expenses container ID is not configured.");
  }
  splitExpensesContainerInstance = database.container(containerId);
  return splitExpensesContainerInstance;
}


// --- Split User Functions ---
export async function addSplitUser(data: SplitUserInput): Promise<SplitUser> {
  const validation = SplitUserInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (addSplitUser): Validation error:', readableErrors);
    throw new Error(`Invalid split user data: ${readableErrors || "Validation failed."}`);
  }

  const id = cuid();
  const now = new Date().toISOString();
  const newUser: SplitUser = { id, ...validation.data, createdAt: now, updatedAt: now };

  const container = await getSplitUsersContainer();
  try {
    const { resource: createdItem } = await container.items.create(newUser);
    if (!createdItem) {
      throw new Error('Failed to create split user, no resource returned.');
    }
    revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
    return createdItem as SplitUser;
  } catch (error: any) {
    console.error(`CosmosDB Error (addSplitUser): Failed to add user ${id}. Status: ${error.code}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not add split user to Cosmos DB. Original error: ${error.message}`);
  }
}

export async function getSplitUsers(): Promise<SplitUser[]> {
  const container = await getSplitUsersContainer();
  const querySpec = { query: "SELECT * FROM c ORDER BY c.name ASC" };
  try {
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    return items as SplitUser[];
  } catch (error: any) {
    console.error('CosmosDB Error (getSplitUsers): Failed to query users.', error.code, error.message, error.stack);
    if (error.code === 404 || error.statusCode === 404) {
      console.warn("CosmosDB Warning (getSplitUsers): Split Users container not found. Returning empty array.");
      return [];
    }
    throw new Error(`Could not fetch split users from Cosmos DB. Original error: ${error.message}`);
  }
}

export async function deleteSplitUser(id: string): Promise<{ success: boolean }> {
    if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined' || id === 'null') {
    const idDetails = `Received ID: '${id}', Type: ${typeof id}`;
    console.error(`CosmosDB Error (deleteSplitUser): Invalid ID. ${idDetails}`);
    throw new Error(`Invalid split user ID provided for delete. ${idDetails}`);
  }
  
  const container = await getSplitUsersContainer();
  try {
    await container.item(id, id).delete(); 
    revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
    return { success: true };
  } catch (error: any) {
    if (error.code === 404 || error.statusCode === 404) {
      console.warn(`CosmosDB Warning (deleteSplitUser): User ${id} not found, considered deleted.`);
      return { success: true };
    }
    console.error(`CosmosDB Error (deleteSplitUser): Failed to delete user ${id}. Code: ${error.code}, Message: ${error.message}`, error.stack);
    throw new Error(`Could not delete split user from Cosmos DB. Original error: ${error.message}`);
  }
}


// --- Split Expense Functions ---

export async function addSplitExpense(data: SplitExpenseInput): Promise<RawSplitExpense> {
  const validation = SplitExpenseInputSchema.safeParse(data);
  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    const readableErrors = Object.entries(errorMessages).map(([field, messages]) => `${field}: ${messages?.join(', ')}`).join('; ');
    console.error('CosmosDB Error (addSplitExpense): Validation error:', readableErrors);
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

  const container = await getSplitExpensesContainer();
  try {
    const { resource: createdItem } = await container.items.create(newSplitExpense);
    if (!createdItem) {
      throw new Error('Failed to create split expense, no resource returned.');
    }

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
    return createdItem as RawSplitExpense;
  } catch (error: any) {
    console.error(`CosmosDB Error (addSplitExpense): Failed. Status: ${error.code}, Msg: ${error.message}`, error.stack);
    throw new Error(`Could not add split expense. Original error: ${error.message}`);
  }
}

export async function getSplitExpenses(options?: { limit?: number }): Promise<AppSplitExpense[]> {
  const expensesContainer = await getSplitExpensesContainer();
  const users = await getSplitUsers();
  // Add "Me" to the user map for populating participant details
  const meUser: SplitUser = { id: MAIN_USER_ID, name: 'Me', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const userMap = new Map([...users, meUser].map(u => [u.id, u]));

  const querySpec = { query: "SELECT * FROM c ORDER BY c.date DESC" };
   if (options?.limit) {
    querySpec.query = `SELECT TOP ${options.limit} * FROM c ORDER BY c.date DESC`;
  }

  try {
    const { resources: items } = await expensesContainer.items.query(querySpec).fetchAll();
    
    const appExpenses: AppSplitExpense[] = items.map((raw: RawSplitExpense) => {
      const paidBy = userMap.get(raw.paidById);
      if (!paidBy) return null; // Skip if payer not found

      const populatedParticipants = raw.participants.map(p => {
        const user = userMap.get(p.userId);
        return user ? { user, shareAmount: p.shareAmount, isSettled: p.isSettled } : null;
      }).filter(Boolean) as AppSplitExpense['participants'];
      
      if (populatedParticipants.length !== raw.participants.length) return null; // Skip if a participant not found

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
  } catch (error: any) {
    console.error('CosmosDB Error (getSplitExpenses):', error.message, error.stack);
     if (error.code === 404 || error.statusCode === 404) {
      console.warn("CosmosDB Warning (getSplitExpenses): Container not found.");
      return [];
    }
    throw new Error(`Could not fetch split expenses. Original error: ${error.message}`);
  }
}

export async function settleParticipantShare(expenseId: string, participantUserId: string): Promise<RawSplitExpense> {
  const container = await getSplitExpensesContainer();
  const { resource: expense } = await container.item(expenseId, expenseId).read<RawSplitExpense>();

  if (!expense) {
    throw new Error(`Split expense with ID ${expenseId} not found.`);
  }

  let participantUpdated = false;
  const updatedParticipants = expense.participants.map(p => {
    if (p.userId === participantUserId) {
      participantUpdated = true;
      return { ...p, isSettled: true };
    }
    return p;
  });

  if (!participantUpdated) {
    throw new Error(`Participant with ID ${participantUserId} not found in this expense.`);
  }

  const isFullySettled = updatedParticipants.every(p => p.isSettled);

  const updatedExpense: RawSplitExpense = {
    ...expense,
    participants: updatedParticipants,
    isFullySettled,
    updatedAt: new Date().toISOString(),
  };

  const { resource: replacedItem } = await container.item(expenseId, expenseId).replace(updatedExpense);
  revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
  return replacedItem as RawSplitExpense;
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
  const container = await getSplitExpensesContainer();
  try {
    await container.item(id, id).delete();
    revalidatePath(SPLIT_EXPENSES_PAGE_PATH);
    return { success: true };
  } catch (error: any) {
     if (error.code === 404 || error.statusCode === 404) {
      console.warn(`CosmosDB Warning (deleteSplitExpense): Expense ${id} not found, considered deleted.`);
      return { success: true };
    }
    console.error(`CosmosDB Error (deleteSplitExpense): Failed to delete expense ${id}.`, error.message, error.stack);
    throw new Error(`Could not delete split expense. Original error: ${error.message}`);
  }
}

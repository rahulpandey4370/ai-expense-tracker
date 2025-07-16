
'use server';

import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import type { SplitUser, SplitUserInput, RawSplitExpense, SplitExpenseInput, AppSplitExpense, UserBalance } from '@/lib/types';
import { SplitUserInputSchema, SplitExpenseInputSchema } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import cuid from 'cuid';

const SPLIT_EXPENSES_PAGE_PATH = '/split-expenses';

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
  const { totalAmount, participants, splitMethod } = validation.data;
  let calculatedParticipants: RawSplitExpense['participants'] = [];

  if (splitMethod === 'equally') {
    const shareAmount = totalAmount / participants.length;
    calculatedParticipants = participants.map(p => ({
      userId: p.userId,
      shareAmount: parseFloat(shareAmount.toFixed(2)),
      isSettled: p.userId === validation.data.paidById, // Payer is settled by default
    }));
  } else { // 'custom' - assumes custom shares are validated to sum up correctly by Zod
     calculatedParticipants = participants.map(p => ({
        userId: p.userId,
        shareAmount: p.customShare || 0,
        isSettled: p.userId === validation.data.paidById,
    }));
  }

  const id = cuid();
  const now = new Date().toISOString();
  const isFullySettled = calculatedParticipants.every(p => p.isSettled);

  const newSplitExpense: RawSplitExpense = {
    id,
    title: validation.data.title,
    date: validation.data.date.toISOString(),
    totalAmount,
    paidById: validation.data.paidById,
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
  const userMap = new Map(users.map(u => [u.id, u]));

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
    const userMap = new Map(users.map(u => [u.id, u.name]));
    const balances: Record<string, number> = {};

    users.forEach(u => balances[u.id] = 0);

    expenses.forEach(expense => {
        if (expense.isFullySettled) return;

        expense.participants.forEach(p => {
            if (!p.isSettled) {
                // Payer is owed money
                balances[expense.paidById] = (balances[expense.paidById] || 0) + p.shareAmount;
                // Participant owes money
                balances[p.user.id] = (balances[p.user.id] || 0) - p.shareAmount;
            }
        });
    });

    const owed: Record<string, { to: string, amount: number }[]> = {};
    const owes: Record<string, { from: string, amount: number }[]> = {};
    
    const userIds = Object.keys(balances);

    // This is a simplified settlement calculation. A real implementation might use a more complex algorithm
    // (like a directed graph to minimize transactions), but this shows direct debts.
    for(const expense of expenses) {
        if (expense.isFullySettled) continue;
        const payerId = expense.paidById;
        expense.participants.forEach(participant => {
            if (!participant.isSettled) {
                const debtorId = participant.user.id;
                
                // Debtor owes Payer
                owes[debtorId] = [...(owes[debtorId] || []), { from: payerId, amount: participant.shareAmount }];
                owed[payerId] = [...(owed[payerId] || []), { to: debtorId, amount: participant.shareAmount }];
            }
        });
    }

    const finalBalances: UserBalance[] = userIds.map(userId => {
      const netAmount = balances[userId] || 0;
      const userOwes: UserBalance['owes'] = [];
      const userOwedBy: UserBalance['owedBy'] = [];
      const consolidatedOwes: Record<string, number> = {};
      
      if(owes[userId]) {
        owes[userId].forEach(debt => {
            consolidatedOwes[debt.from] = (consolidatedOwes[debt.from] || 0) + debt.amount;
        });
      }

      Object.entries(consolidatedOwes).forEach(([payerId, amount]) => {
          userOwes.push({ toUserId: payerId, toUserName: userMap.get(payerId) || 'Unknown', amount });
          
          const consolidatedOwedByPayer = (owed[payerId] || []).filter(credit => credit.to === userId);
          const totalOwedByPayerToUser = consolidatedOwedByPayer.reduce((sum, credit) => sum + credit.amount, 0);

          if (amount > totalOwedByPayerToUser) {
              consolidatedOwes[payerId] = amount - totalOwedByPayerToUser;
          } else {
              delete consolidatedOwes[payerId];
          }
      });


      return {
          userId,
          userName: userMap.get(userId) || 'Unknown User',
          netAmount: parseFloat(netAmount.toFixed(2)),
          owes: Object.entries(consolidatedOwes).map(([toUserId, amount]) => ({
              toUserId,
              toUserName: userMap.get(toUserId) || 'Unknown',
              amount: parseFloat(amount.toFixed(2))
          })).filter(d => d.amount > 0.01),
          owedBy: [], // Simplified for now
      };
    });

    return finalBalances;
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

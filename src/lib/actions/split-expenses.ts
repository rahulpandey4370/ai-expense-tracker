
'use server';

import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import type { SplitUser, SplitUserInput, RawSplitExpense, SplitExpenseInput, AppSplitExpense } from '@/lib/types';
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
      return []; // Or attempt to create container if that's desired on first load
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
  // TODO: Before deleting a user, check if they are part of any UNSETTLED split expenses.
  // If so, prevent deletion or handle appropriately (e.g., mark user as "Archived" instead of hard delete).
  // For now, proceeding with hard delete for simplicity of this stage.

  const container = await getSplitUsersContainer();
  try {
    await container.item(id, id).delete(); // Assumes partition key is /id
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


// --- Split Expense Functions (Skeletons for now) ---

export async function addSplitExpense(data: SplitExpenseInput): Promise<RawSplitExpense> {
  // TODO: Implement validation and logic
  // 1. Validate with SplitExpenseInputSchema
  // 2. Calculate shareAmount for each participant based on splitMethod
  // 3. Create RawSplitExpense object with cuid, timestamps, isFullySettled = false
  // 4. Save to splitExpensesContainer
  // 5. Revalidate path
  console.log("addSplitExpense called with data:", data);
  throw new Error("addSplitExpense not yet implemented");
}

export async function getSplitExpenses(options?: { limit?: number }): Promise<AppSplitExpense[]> {
  // TODO: Implement logic
  // 1. Fetch RawSplitExpenses from Cosmos
  // 2. Fetch all SplitUsers (or pass them in if performance is an issue)
  // 3. Map RawSplitExpenses to AppSplitExpenses, populating 'paidBy' and 'participants.user'
  // 4. Sort by date descending
  console.log("getSplitExpenses called with options:", options);
  return []; // Placeholder
}

export async function settleParticipantShare(expenseId: string, participantUserId: string): Promise<RawSplitExpense> {
  // TODO: Implement logic
  // 1. Fetch RawSplitExpense by expenseId
  // 2. Find participant by participantUserId
  // 3. Set participant.isSettled = true
  // 4. Check if all participants are settled; if so, set expense.isFullySettled = true
  // 5. Update RawSplitExpense in Cosmos
  // 6. Revalidate path
  console.log("settleParticipantShare called with:", expenseId, participantUserId);
  throw new Error("settleParticipantShare not yet implemented");
}

export async function updateSplitExpense(id: string, data: Partial<SplitExpenseInput>): Promise<RawSplitExpense> {
  // TODO: Implement logic for editing basic details (title, date, totalAmount if unsettled, paidBy if unsettled)
  // Recalculate shares if totalAmount or participants change
  console.log("updateSplitExpense called with:", id, data);
  throw new Error("updateSplitExpense not yet implemented");
}

export async function deleteSplitExpense(id: string): Promise<{ success: boolean }> {
  // TODO: Implement logic
  // Delete from splitExpensesContainer
  // Revalidate path
  console.log("deleteSplitExpense called with id:", id);
  throw new Error("deleteSplitExpense not yet implemented");
}

// Helper function to ensure containers exist (call during app startup or before first use if necessary)
export async function ensureSplitExpenseContainersExist() {
    try {
        const { database } = await getCosmosClientAndDb();
        const usersContainerId = process.env.COSMOS_DB_SPLIT_USERS_CONTAINER_ID;
        const expensesContainerId = process.env.COSMOS_DB_SPLIT_EXPENSES_CONTAINER_ID;

        if (!usersContainerId || !expensesContainerId) {
            throw new Error("Split expense container IDs are not defined in environment variables.");
        }

        await database.containers.createIfNotExists({ id: usersContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${usersContainerId}' ensured.`);
        
        await database.containers.createIfNotExists({ id: expensesContainerId, partitionKey: { paths: ["/id"] } });
        console.log(`CosmosDB Info: Container '${expensesContainerId}' ensured.`);

    } catch (error: any) {
        console.error("CosmosDB Error: Failed to ensure split expense containers exist.", error.message, error.stack);
        // Depending on the error, you might want to throw it or handle it gracefully
        // For now, logging the error. The app might fail later if containers are crucial and don't exist.
    }
}
// Call this, for example, in a global layout or a dedicated initialization step if needed.
// ensureSplitExpenseContainersExist(); // Or call it on demand.

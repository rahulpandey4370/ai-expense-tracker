import { BlobServiceClient, RestError, type ContainerClient as BlobContainerClient } from '@azure/storage-blob';
import { CosmosClient, type Container as CosmosContainer } from '@azure/cosmos';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

let _blobContainer: BlobContainerClient | undefined;
export async function getBlobContainer(): Promise<BlobContainerClient> {
  if (_blobContainer) return _blobContainer;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!connectionString || !containerName) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING / AZURE_STORAGE_CONTAINER_NAME not configured.');
  }
  _blobContainer = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  return _blobContainer;
}

export async function readBlobJson<T>(path: string, fallback: T): Promise<T> {
  const client = await getBlobContainer();
  try {
    const blob = client.getBlobClient(path);
    const dl = await blob.download(0);
    if (!dl.readableStreamBody) return fallback;
    const text = await streamToString(dl.readableStreamBody);
    return JSON.parse(text) as T;
  } catch (error: any) {
    if (error instanceof RestError && error.statusCode === 404) return fallback;
    throw error;
  }
}

export async function* listBlobJsonFiles(prefix: string): AsyncGenerator<{ name: string; data: any }> {
  const client = await getBlobContainer();
  const iterator = client.listBlobsFlat({ prefix });
  for await (const blob of iterator) {
    if (!blob.name.endsWith('.json') || blob.name === prefix) continue;
    const blobClient = client.getBlobClient(blob.name);
    const dl = await blobClient.download(0);
    if (!dl.readableStreamBody) continue;
    const text = await streamToString(dl.readableStreamBody);
    yield { name: blob.name, data: JSON.parse(text) };
  }
}

let _cosmosDb: ReturnType<CosmosClient['database']> | undefined;
function getCosmosDatabase() {
  if (_cosmosDb) return _cosmosDb;
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;
  if (!endpoint || !key || !databaseId) {
    throw new Error('COSMOS_DB_ENDPOINT / COSMOS_DB_KEY / COSMOS_DB_DATABASE_ID not configured.');
  }
  _cosmosDb = new CosmosClient({ endpoint, key }).database(databaseId);
  return _cosmosDb;
}

export function getCosmosContainer(envVarName: string): CosmosContainer {
  const containerId = process.env[envVarName];
  if (!containerId) throw new Error(`${envVarName} not configured.`);
  return getCosmosDatabase().container(containerId);
}

export function getCosmosContainerByName(containerId: string): CosmosContainer {
  return getCosmosDatabase().container(containerId);
}

export async function queryAllCosmosItems<T>(container: CosmosContainer, query = 'SELECT * FROM c'): Promise<T[]> {
  const { resources } = await container.items.query(query).fetchAll();
  return resources as T[];
}

let _supabase: SupabaseClient | undefined;
export function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_PROJECT_URL / SUPABASE_SERVICE_ROLE_KEY not configured.');
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

/** Upserts rows in batches of `batchSize`, logging progress and returning total upserted. */
export async function batchUpsert(table: string, rows: Record<string, any>[], batchSize = 500): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = getSupabaseClient();
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) {
      throw new Error(`Upsert into ${table} failed at batch starting index ${i}: ${error.message}`);
    }
    upserted += batch.length;
    console.log(`  [${table}] upserted ${upserted}/${rows.length}`);
  }
  return upserted;
}

export async function countSupabaseRows(table: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Count query on ${table} failed: ${error.message}`);
  return count ?? 0;
}

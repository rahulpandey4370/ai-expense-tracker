// Parallel reads for the browser. Only the functions listed in READS can be called.
import { READS, encodeWithDates } from '@/lib/reads';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = body?.name as keyof typeof READS;
  const args: unknown[] = Array.isArray(body?.args) ? body.args : [];
  if (typeof name !== 'string' || !Object.hasOwn(READS, name) || args.length > 4) {
    return Response.json({ error: 'Unknown read' }, { status: 400 });
  }
  try {
    const result = await (READS[name] as (...a: unknown[]) => Promise<unknown>)(...args);
    return new Response(encodeWithDates(result ?? null), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    console.error(`[read] ${name} failed:`, e);
    return Response.json({ error: e?.message ?? 'failed' }, { status: 500 });
  }
}

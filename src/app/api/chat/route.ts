// The chat's send and Confirm/Cancel, streamed: one JSON object per line,
// {"t":"text","d":"…"} as the reply is written, then {"t":"done","result":…}
// (or {"t":"error","message":…}). The chat screen reads it in financial-chatbot.tsx.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { runChatTurn } from '@/ai/adk/chat';
import { runMonthlyReview } from '@/ai/adk/monthly-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 3_000_000;

const Body = z.object({
  sessionId: z.string().max(64).optional(),
  text: z.string().max(4000).optional(),
  attachments: z.array(z.object({
    name: z.string().max(200),
    mime: z.string().regex(/^(image\/(jpeg|png|webp)|application\/pdf)$/, 'Attach a photo (JPG, PNG, WebP) or a PDF.'),
    dataBase64: z.string().max(Math.ceil(MAX_ATTACHMENT_BYTES / 0.75), 'That file is too large. Keep it under 3 MB.'),
  })).max(3).optional(),
  confirmation: z.object({ id: z.string().max(200), confirmed: z.boolean() }).optional(),
  /** /review in chat: this month so far, or last month. Saved as its own chat, no push. */
  review: z.enum(['this', 'last']).optional(),
  options: z.object({
    modelKey: z.string().max(100).optional(),
    verbose: z.boolean().optional(),
    investmentMode: z.boolean().optional(),
    viewing: z.object({ month: z.number().int(), year: z.number().int() }).optional(),
  }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  const { sessionId, confirmation, options, review } = parsed.data;
  if (review) {
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const m = ist.getUTCMonth() - (review === 'last' ? 1 : 0);
    try {
      const r = await runMonthlyReview({ year: ist.getUTCFullYear() + (m < 0 ? -1 : 0), month: (m + 12) % 12, modelKey: options.modelKey });
      return Response.json({ sessionId: r.sessionId });
    } catch (e: any) {
      console.error('[chat] /review failed:', e);
      return Response.json({ error: "The review couldn't be made just now. Please try again." }, { status: 500 });
    }
  }
  const text = parsed.data.text?.trim() ?? '';
  const attachments = parsed.data.attachments ?? [];
  if (confirmation && !sessionId) return Response.json({ error: 'That chat no longer exists.' }, { status: 400 });
  if (!confirmation && !text && !attachments.length) return Response.json({ error: 'Type a message or attach a file.' }, { status: 400 });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
      try {
        const onText = (d: string) => { if (d) send({ t: 'text', d }); };
        const result = confirmation
          ? await runChatTurn({ sessionId, confirmation, options, onText })
          : await runChatTurn({ sessionId, text: text || `Read ${attachments.map(a => a.name).join(', ')}`, attachments, options, onText });
        if (confirmation?.confirmed) revalidatePath('/', 'layout');
        send({ t: 'done', result });
      } catch (e: any) {
        console.error('[chat] turn failed:', e);
        send({ t: 'error', message: e?.message ?? 'failed' });
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

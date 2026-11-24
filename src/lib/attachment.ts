// Browser-side: turn a picked file into something small enough for one request (Vercel caps bodies at 4.5 MB).
import type { ChatAttachment } from '@/lib/chat-types';

export const MAX_PDF_BYTES = 2_800_000;

/** Photos are shrunk to ≤1600px JPEG in the browser so they fit the request limit. */
export async function toAttachment(file: File): Promise<ChatAttachment> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is over 2.8 MB.`);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name: file.name, mime: 'application/pdf', dataBase64: btoa(bin) };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: attach a photo or a PDF.`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { name: file.name, mime: 'image/jpeg', dataBase64: dataUrl.split(',')[1] };
}


/** Same, as a data: URI (receipts on split expenses). */
export async function toDataUri(file: File): Promise<string> {
  const a = await toAttachment(file);
  return `data:${a.mime};base64,${a.dataBase64}`;
}

// Server-only: imported by route handlers and server actions, never by client components.
import webpush from 'web-push';
import { getSupabase } from '@/lib/supabase';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;   // page opened when the notification is tapped
  tag?: string;   // same tag replaces an older notification instead of stacking
};

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('Push is not configured: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
  configured = true;
}

/** Sends to every subscribed device. Returns how many devices accepted it. */
export async function sendPush(payload: PushPayload): Promise<number> {
  configure();
  const supabase = getSupabase();
  const { data: subs, error } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);

  const results = await Promise.allSettled(
    (subs ?? []).map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      ),
    ),
  );

  // 404/410 = the device unsubscribed or the app was removed; forget it.
  const gone = results.flatMap((r, i) =>
    r.status === 'rejected' && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
      ? [subs![i].endpoint]
      : [],
  );
  if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone);

  results.forEach((r, i) => {
    if (r.status === 'rejected' && !gone.includes(subs![i].endpoint)) console.error('Push send failed:', r.reason);
  });
  return results.filter(r => r.status === 'fulfilled').length;
}

/** Sends only the first time `key` is seen (e.g. one alert per budget threshold per month). */
export async function sendPushOnce(key: string, payload: PushPayload): Promise<boolean> {
  const { error } = await getSupabase().from('notification_log').insert({ key });
  if (error) {
    if (error.code === '23505') return false; // already sent
    throw new Error(`Could not record notification: ${error.message}`);
  }
  const forget = () => getSupabase().from('notification_log').delete().eq('key', key); // retry next time
  try {
    if (await sendPush(payload)) return true;
  } catch (e) {
    await forget();
    throw e;
  }
  await forget(); // no device received it (none subscribed yet): don't mark as sent
  return false;
}

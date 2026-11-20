"use client";

import { useCallback, useEffect, useState } from 'react';
import { isPushSubscriptionSaved, removePushSubscription, savePushSubscription, sendTestPush } from '@/lib/actions/pending';

/**
 * Push notifications on this device: whether they're on, and turning them on or off.
 * On iPhone this only works from the Home Screen app (iOS 16.4+), not a Safari tab.
 */
export type PushStatus = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported()) return setStatus('unsupported');
    if (Notification.permission === 'denied') return setStatus('blocked');
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    // "On" means this phone has a subscription and the server still sends to it.
    setStatus(sub && Notification.permission === 'granted' && (await isPushSubscriptionSaved(sub.endpoint)) ? 'on' : 'off');
  }, []);

  useEffect(() => { refresh().catch(() => setStatus('off')); }, [refresh]);

  /** Turns on with a fresh subscription (an old one can go stale on iPhone) and sends a test. */
  const enable = useCallback(async () => {
    if (!supported()) throw new Error('On iPhone: open FinWise in Safari, tap Share → Add to Home Screen, then turn notifications on from the Home Screen app.');
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) throw new Error('Push is not set up on the server (NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing).');
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setStatus('blocked');
        throw new Error('Allow notifications for FinWise in iPhone Settings → Notifications.');
      }
      const registration = await navigator.serviceWorker.ready;
      const old = await registration.pushManager.getSubscription();
      await old?.unsubscribe().catch(() => {});
      const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      await savePushSubscription(sub.toJSON(), navigator.userAgent, old?.endpoint);
      setStatus('on');
      if (!(await sendTestPush())) throw new Error("Notifications are on, but the test didn't reach this phone. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = supported() ? await (await navigator.serviceWorker.ready).pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setStatus('off');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable, test: sendTestPush };
}

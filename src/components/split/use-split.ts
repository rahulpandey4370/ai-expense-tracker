"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GroupDetail, HomeData } from '@/lib/split/types';

export const splitKeys = {
  all: ['split'] as const,
  home: ['split', 'home'] as const,
  group: (id: string, asMember?: string | null) => ['split', 'group', id, asMember ?? null] as const,
};

export async function splitApi<T = unknown>(op: string, args: Record<string, unknown> = {}, token?: string): Promise<T> {
  const res = await fetch('/api/split', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-split-token': token } : {}) },
    body: JSON.stringify({ op, ...args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data as T;
}

// ponytail: polling keeps both sides in sync without a client Supabase key; switch to realtime if 15s feels slow.
export function useSplitHome(enabled = true) {
  return useQuery({ queryKey: splitKeys.home, queryFn: () => splitApi<HomeData>('home'), enabled, refetchInterval: 30_000 });
}

/** A group by id, or — for a share-link guest — the link's group (groupId omitted). */
export function useSplitGroup(groupId: string | null, token?: string, asMember?: string | null) {
  return useQuery({
    queryKey: splitKeys.group(groupId ?? `link:${token}`, asMember),
    queryFn: () => splitApi<GroupDetail>('group', { groupId: groupId ?? undefined, asMember }, token),
    enabled: !!groupId || !!token,
    placeholderData: prev => prev, // keep the old group on screen while switching
    retry: (n, e) => n < 2 && !/not found|valid group link/i.test((e as Error).message),
    refetchInterval: 15_000,
  });
}

/** Any write. Refreshes all split data (and the owner's finance views, which may hold a linked transaction). */
export function useSplitAction(token?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ op, ...args }: { op: string } & Record<string, unknown>) => splitApi<any>(op, args, token),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Everything between me and one person across groups (signed-in users only). */
export function useSplitPerson(key: string | null) {
  return useQuery({
    queryKey: ['split', 'person', key ?? ''] as const,
    queryFn: () => splitApi<import('@/lib/split/report').PersonData>('person', { key }),
    enabled: !!key,
    refetchInterval: 30_000,
  });
}

"use client";

import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { financeKeys } from '@/hooks/use-finance-queries';

type Change = { key: QueryKey; update: (old: any) => any };

/**
 * Optimistic updates (TanStack Query's pattern): change the cached data now so the
 * screen updates instantly, run the server call, put the old data back if it fails,
 * then refresh in the background without spinners.
 */
export function useOptimisticAction() {
  const qc = useQueryClient();
  return async function run<T>(changes: Change[], action: () => Promise<T>, refresh: QueryKey[] = [financeKeys.all]): Promise<T> {
    await Promise.all(changes.map(c => qc.cancelQueries({ queryKey: c.key })));
    const snapshots = changes.flatMap(c => qc.getQueriesData({ queryKey: c.key }));
    changes.forEach(c => qc.setQueriesData({ queryKey: c.key }, (old: unknown) => (old === undefined ? old : c.update(old))));
    try {
      return await action();
    } catch (e) {
      snapshots.forEach(([key, data]) => qc.setQueryData(key, data as never));
      throw e;
    } finally {
      refresh.forEach(key => qc.invalidateQueries({ queryKey: key }));
    }
  };
}

/** Moves the SMS Inbox badge right away (e.g. -1 when an SMS is logged or dismissed). */
export function useAdjustPendingCount() {
  const qc = useQueryClient();
  return (delta: number) => qc.setQueryData<number>(financeKeys.pendingCount(), n => Math.max(0, (n ?? 0) + delta));
}

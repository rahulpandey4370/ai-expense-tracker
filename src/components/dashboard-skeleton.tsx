import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors the real dashboard layout so switching months doesn't blank the page
 * to a centred spinner and shift everything when data lands.
 */
export function DashboardSkeleton() {
  return (
    <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-28 w-full rounded-xl" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`hero-${i}`} className="h-28 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`sec-${i}`} className="h-24 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-64 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>

      <Skeleton className="h-80 w-full rounded-xl" />
    </main>
  );
}

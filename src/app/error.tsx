"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Any page that throws lands here instead of a blank screen; the rest of the app keeps working.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">This page hit a problem</h1>
      <p className="text-sm text-muted-foreground">
        Your data is safe. Try again, and if it keeps happening, head back to the dashboard.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild><Link href="/">Dashboard</Link></Button>
      </div>
    </div>
  );
}

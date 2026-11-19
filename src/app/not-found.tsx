import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That link doesn&apos;t go anywhere. Press ⌘K or Ctrl+K to search every page.</p>
      <Button asChild className="mt-2"><Link href="/">Back to the dashboard</Link></Button>
    </div>
  );
}

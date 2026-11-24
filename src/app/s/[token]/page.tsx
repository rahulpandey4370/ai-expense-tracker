import type { Metadata } from 'next';
import { SplitGuest } from '@/components/split/split-app';

export const metadata: Metadata = { title: 'Split with friends · FinWise', robots: { index: false, follow: false } };

/** Private share link: one group, no account needed. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SplitGuest token={token} />;
}

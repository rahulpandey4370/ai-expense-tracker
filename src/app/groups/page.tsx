import type { Metadata } from 'next';
import { SplitApp } from '@/components/split/split-app';

export const metadata: Metadata = { title: 'FinWise Split' };

/** Standalone split app for friends (and anyone signed in). */
export default function GroupsPage() {
  return <SplitApp mode="friend" />;
}

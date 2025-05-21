
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from '@/components/layout/app-sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import AppHeader from '@/components/layout/app-header';

export default function ProtectedLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isAuthenticated, isLoadingAuth, pathname, router]);

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-primary">
        <Loader2 className="h-12 w-12 animate-spin mr-3" />
        Loading FinWise AI...
      </div>
    );
  }

  if (!isAuthenticated && pathname !== '/login') {
    // This case should ideally be caught by the useEffect redirect,
    // but it's a fallback or for initial server render if needed.
    return null; // Or a specific "redirecting..." message if preferred
  }

  if (pathname === '/login') {
    return <>{children}</>; // Render only login page content, no sidebar/header
  }

  // If authenticated and not on the login page, render the main app layout
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}


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

  const isDemoRoute = pathname.startsWith('/demo');

  useEffect(() => {
    // If it's a demo route, we don't check for auth
    if (isDemoRoute) return;

    if (!isLoadingAuth && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isAuthenticated, isLoadingAuth, pathname, router, isDemoRoute]);

  if (isLoadingAuth && !isDemoRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-primary">
        <Loader2 className="h-12 w-12 animate-spin mr-3" />
        Loading FinWise AI...
      </div>
    );
  }

  // If it's a demo route, render the main app layout without checking auth
  if (isDemoRoute) {
    return (
      <SidebarProvider defaultOpen>
        <AppSidebar isDemoMode={true} />
        <SidebarInset>
          <AppHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (!isAuthenticated && pathname !== '/login') {
    return null; // Or a specific "redirecting..." message
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

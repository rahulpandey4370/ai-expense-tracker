"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";


export default function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      <div className="hidden md:block">
        {/* Placeholder to maintain layout, or could be breadcrumbs */}
      </div>
      <div className="flex flex-1 items-center justify-end gap-4">
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}


"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'; // Import Sheet components
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { LayoutDashboard, FlaskConical, ArrowRightLeft, BarChart3, Settings, HelpCircle, TableProperties, Users, Home } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-playground", label: "AI Playground", icon: FlaskConical },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/yearly-overview", label: "Yearly Overview", icon: TableProperties },
  { href: "/split-expenses", label: "Split Expenses", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface AppSidebarProps {
  isDemoMode?: boolean;
}

export default function AppSidebar({ isDemoMode = false }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, state: sidebarState, setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const currentNavItems = isDemoMode
    ? [{ href: "/demo", label: "Demo Dashboard", icon: LayoutDashboard }, { href: "/", label: "Back to Main App", icon: Home }]
    : navItems;

  const sidebarContent = (
    <>
       {/* Visually hidden titles for screen reader accessibility in mobile view (Sheet) */}
      <SheetHeader className="sr-only">
        <SheetTitle>App Navigation</SheetTitle>
        <SheetDescription>
          Main navigation menu for the FinWise AI application.
        </SheetDescription>
      </SheetHeader>

      <SidebarHeader className="p-4">
        <Link href={isDemoMode ? "/demo" : "/"} aria-label="FinWise AI Home" onClick={handleLinkClick}>
          <AppLogo appName="FinWise AI" />
        </Link>
      </SidebarHeader>
      <Separator className="mb-2" />
      <SidebarContent>
        <SidebarMenu className="px-2">
          {currentNavItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={handleLinkClick}
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-md block"
                    >
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        className="justify-start"
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </TooltipTrigger>
                  {sidebarState === 'collapsed' && !isMobile && (
                    <TooltipContent side="right" align="center">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {!isDemoMode && (
        <>
          <Separator className="mt-auto mb-2"/>
          <SidebarFooter className="p-4">
            <Button variant="outline" className="w-full group-data-[collapsible=icon]:hidden">
              <HelpCircle className="mr-2 h-4 w-4" />
              Help & Feedback
            </Button>
            <Button variant="ghost" size="icon" className="hidden group-data-[collapsible=icon]:flex mx-auto">
              <HelpCircle className="h-5 w-5" />
              <span className="sr-only">Help & Feedback</span>
            </Button>
          </SidebarFooter>
        </>
      )}
    </>
  );

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      side="left"
      // Pass content as a child to the SheetContent within the Sidebar component
      sheetContentProps={{ children: sidebarContent }}
    >
      {/* This content is for the desktop view */}
      {sidebarContent}
    </Sidebar>
  );
}

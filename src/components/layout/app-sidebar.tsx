
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
import { LayoutDashboard, FlaskConical, ArrowRightLeft, BarChart3, Settings, HelpCircle, TableProperties, Users, Home, Bot, Repeat, PiggyBank, LineChart } from "lucide-react";

/**
 * Grouped instead of an 11-item flat list. The old order interleaved daily
 * data entry with AI tools and analysis, so there was no way to scan for
 * "the thing I do every day" vs "the thing I check monthly".
 */
const navGroups: { label: string | null; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Track",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
      { href: "/recurring", label: "Recurring", icon: Repeat },
      { href: "/split-expenses", label: "Split Expenses", icon: Users },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/savings", label: "Savings", icon: PiggyBank },
      { href: "/portfolio", label: "Portfolio", icon: LineChart },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/yearly-overview", label: "Yearly Overview", icon: TableProperties },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/chatbot", label: "AI Chatbot", icon: Bot },
      { href: "/ai-playground", label: "AI Playground", icon: FlaskConical },
    ],
  },
  {
    label: null,
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

const navItems = navGroups.flatMap(g => g.items);

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
      <SidebarHeader className="p-4">
        <Link href={isDemoMode ? "/demo" : "/"} aria-label="FinWise AI Home" onClick={handleLinkClick}>
          <AppLogo appName="FinWise AI" />
        </Link>
      </SidebarHeader>
      <Separator className="mb-2" />
      <SidebarContent>
        {(isDemoMode ? [{ label: null, items: currentNavItems }] : navGroups).map((group, gi) => (
          <div key={group.label ?? `group-${gi}`}>
            {group.label && (
              <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                {group.label}
              </div>
            )}
            <SidebarMenu className="px-2">
              {group.items.map((item) => (
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
          </div>
        ))}
      </SidebarContent>
      {!isDemoMode && (
        <>
          <Separator className="mt-auto mb-2"/>
          <SidebarFooter className="p-4">
            <Link href="/about" onClick={handleLinkClick}>
              <Button variant="outline" className="w-full group-data-[collapsible=icon]:hidden">
                <HelpCircle className="mr-2 h-4 w-4" />
                About & Help
              </Button>
              <Button variant="ghost" size="icon" className="mx-auto hidden group-data-[collapsible=icon]:flex">
                <HelpCircle className="h-5 w-5" />
                <span className="sr-only">About & Help</span>
              </Button>
            </Link>
          </SidebarFooter>
        </>
      )}
    </>
  );

  const mobileSidebarContent = (
    <>
      {/* Visually hidden titles for screen reader accessibility in mobile view (Sheet) */}
      <SheetHeader className="sr-only">
        <SheetTitle>App Navigation</SheetTitle>
        <SheetDescription>
          Main navigation menu for the FinWise AI application.
        </SheetDescription>
      </SheetHeader>
      {/* The rest of the sidebar content */}
      {sidebarContent}
    </>
  );

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      side="left"
      // Pass content as a child to the SheetContent within the Sidebar component
      sheetContentProps={{ children: mobileSidebarContent }}
    >
      {/* This content is for the desktop view */}
      {sidebarContent}
    </Sidebar>
  );
}

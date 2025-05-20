
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
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { LayoutDashboard, ArrowRightLeft, BarChart3, Settings, HelpCircle } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, state: sidebarState } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left">
      <SidebarHeader className="p-4">
        <Link href="/" aria-label="Rahul's Tracker Home">
          <AppLogo appName="Rahul's Tracker" />
        </Link>
      </SidebarHeader>
      <Separator className="mb-2" />
      <SidebarContent>
        <SidebarMenu className="px-2">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <Link href={item.href} passHref legacyBehavior>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asAnchor // Instruct SidebarMenuButton to render as <a>
                      isActive={pathname === item.href}
                      className="justify-start"
                      // href will be passed by Link legacyBehavior
                      // other props (onClick, etc.) from Link will also be passed
                      // and props from TooltipTrigger asChild will be merged
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {sidebarState === 'collapsed' && !isMobile && (
                    <TooltipContent side="right" align="center">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
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
    </Sidebar>
  );
}

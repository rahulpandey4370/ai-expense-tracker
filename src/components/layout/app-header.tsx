
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

export default function AppHeader() {
  const { 
    selectedMonth, 
    selectedYear, 
    years, 
    monthNamesList, 
    handleMonthChange, 
    handleYearChange, 
    handleSetToCurrentMonth 
  } = useDateSelection();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <div className="flex items-center gap-2">
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
        <div className="hidden md:block">
          {/* Placeholder for breadcrumbs or title */}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Select value={selectedMonth.toString()} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {monthNamesList.map((month, index) => (
                <SelectItem key={month} value={index.toString()} className="text-xs">
                  {month.substring(0,3)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[75px] h-8 text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()} className="text-xs">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSetToCurrentMonth} variant="outline" size="icon" className="h-8 w-8">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="sr-only">Current Month</span>
          </Button>
        </div>
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}

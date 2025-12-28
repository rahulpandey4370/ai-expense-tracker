
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDateSelection } from "@/contexts/DateSelectionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, CalendarIcon } from "lucide-react";
import { usePathname } from 'next/navigation';
import { ModelSelector } from '../model-selector';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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

  const pathname = usePathname();
  const isDemoRoute = pathname.startsWith('/demo');

  const formattedDate = `${monthNamesList[selectedMonth].substring(0,3)} ${selectedYear}`;

  const dateSelectionControls = (
    <>
      <Select value={selectedMonth.toString()} onValueChange={handleMonthChange}>
        <SelectTrigger className="w-[110px] h-8 text-xs sm:w-[120px] sm:text-sm">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {monthNamesList.map((month, index) => (
            <SelectItem key={month} value={index.toString()} className="text-xs sm:text-sm">
              {month.substring(0,3)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
        <SelectTrigger className="w-[75px] h-8 text-xs sm:w-[85px] sm:text-sm">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {years.map(year => (
            <SelectItem key={year} value={year.toString()} className="text-xs sm:text-sm">
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleSetToCurrentMonth} variant="outline" size="icon" className="h-8 w-8">
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="sr-only">Current Month</span>
      </Button>
    </>
  );

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-x-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        
        {/* Date Selector for Mobile (in Popover) */}
        <div className="md:hidden">
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-8 w-auto min-w-[90px] justify-start text-left font-normal")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formattedDate}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2 space-y-2" align="start">
                    <div className="text-sm font-semibold text-center text-primary p-2">Select Period</div>
                    <div className="flex items-center gap-2">
                        {dateSelectionControls}
                    </div>
                </PopoverContent>
            </Popover>
        </div>

        {/* Date Selector for Desktop */}
        <div className="hidden md:flex items-center gap-1.5">
          {dateSelectionControls}
        </div>

      </div>
      
      <div className="flex flex-1 items-center justify-end gap-2">
        <ThemeToggle />
        {!isDemoRoute && <ModelSelector />}
        {!isDemoRoute && <UserNav />}
      </div>
    </header>
  );
}

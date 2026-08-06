"use client";

import { useDateSelection } from '@/contexts/DateSelectionContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One control for one idea: "which month am I looking at?"
 *
 * This replaces a month <Select> + a year <Select> + an unlabelled calendar
 * icon button — three controls for a single concept, where the by-far most
 * common action (go to the previous month) took two clicks through a dropdown.
 * Here it's one tap on ‹, the label opens a grid for big jumps, and "This
 * month" only appears when you've actually navigated away.
 */
export function PeriodPicker({ className }: { className?: string }) {
  const {
    selectedMonth,
    selectedYear,
    years,
    monthNamesList,
    handleMonthChange,
    handleYearChange,
    handleSetToCurrentMonth,
    stepMonth,
    isCurrentMonth,
    canStepForward,
  } = useDateSelection();

  const label = `${monthNamesList[selectedMonth].slice(0, 3)} ${selectedYear}`;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center rounded-md border bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-r-none"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 min-w-[86px] rounded-none border-x px-2 text-sm font-medium tabular-nums"
              aria-label={`Selected period: ${monthNamesList[selectedMonth]} ${selectedYear}. Change period.`}
            >
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Year</span>
              <select
                value={selectedYear}
                onChange={e => handleYearChange(e.target.value)}
                className="h-7 rounded border bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Select year"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* A 3×4 grid beats a 12-item dropdown: every month is one tap and
                you can see where you are relative to the rest of the year. */}
            <div className="grid grid-cols-3 gap-1">
              {monthNamesList.map((m, i) => (
                <Button
                  key={m}
                  variant={i === selectedMonth ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleMonthChange(String(i))}
                >
                  {m.slice(0, 3)}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-l-none disabled:opacity-30"
          onClick={() => stepMonth(1)}
          disabled={!canStepForward}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Only offered when it does something. */}
      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleSetToCurrentMonth}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">This month</span>
        </Button>
      )}
    </div>
  );
}

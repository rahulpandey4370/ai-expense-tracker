
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useMemo, useCallback } from 'react';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface DateSelectionContextType {
  selectedDate: Date;
  selectedMonth: number;
  selectedYear: number;
  years: number[];
  monthNamesList: string[];
  handleMonthChange: (monthValue: string) => void;
  handleYearChange: (yearValue: string) => void;
  handleSetToCurrentMonth: () => void;
  /** Step the period by whole months; negative goes back. Rolls over years. */
  stepMonth: (delta: number) => void;
  /** True when the selected period is the calendar month we're actually in. */
  isCurrentMonth: boolean;
  /** Guard for the ›  stepper — there's no data in the future. */
  canStepForward: boolean;
}

const DateSelectionContext = createContext<DateSelectionContextType | undefined>(undefined);

export function DateSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const currentHostYear = useMemo(() => new Date().getFullYear(), []);
  const years = useMemo(() => Array.from({ length: 11 }, (_, i) => currentHostYear - 5 + i), [currentHostYear]);

  const selectedMonth = selectedDate.getMonth();
  const selectedYear = selectedDate.getFullYear();

  const handleMonthChange = useCallback((monthValue: string) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(parseInt(monthValue, 10));
    newDate.setDate(1); // Ensure it's the first of the month to avoid day overflow issues
    setSelectedDate(newDate);
  }, [selectedDate]);

  const handleYearChange = useCallback((yearValue: string) => {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(parseInt(yearValue, 10));
    newDate.setDate(1); // Ensure it's the first of the month
    setSelectedDate(newDate);
  }, [selectedDate]);

  const handleSetToCurrentMonth = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  /**
   * Month-at-a-time navigation. Browsing "last month" used to mean opening a
   * dropdown, and crossing a year boundary meant opening two — this makes it
   * one tap and handles the Dec→Jan rollover for free.
   */
  const stepMonth = useCallback((delta: number) => {
    setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const { isCurrentMonth, canStepForward } = useMemo(() => {
    const now = new Date();
    const isCurrent = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
    // Allow forward stepping only up to the present month.
    const beforeNow =
      selectedYear < now.getFullYear() ||
      (selectedYear === now.getFullYear() && selectedMonth < now.getMonth());
    return { isCurrentMonth: isCurrent, canStepForward: beforeNow };
  }, [selectedMonth, selectedYear]);

  const value = {
    selectedDate,
    selectedMonth,
    selectedYear,
    years,
    monthNamesList: monthNames,
    handleMonthChange,
    handleYearChange,
    handleSetToCurrentMonth,
    stepMonth,
    isCurrentMonth,
    canStepForward,
  };

  return (
    <DateSelectionContext.Provider value={value}>
      {children}
    </DateSelectionContext.Provider>
  );
}

export function useDateSelection() {
  const context = useContext(DateSelectionContext);
  if (context === undefined) {
    throw new Error('useDateSelection must be used within a DateSelectionProvider');
  }
  return context;
}


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

  const value = {
    selectedDate,
    selectedMonth,
    selectedYear,
    years,
    monthNamesList: monthNames,
    handleMonthChange,
    handleYearChange,
    handleSetToCurrentMonth,
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

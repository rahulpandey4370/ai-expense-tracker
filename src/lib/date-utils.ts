export type CalendarDateParts = {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const isValidDate = (value: Date) => !Number.isNaN(value.getTime());

export function getCalendarDateParts(value: Date | string | null | undefined): CalendarDateParts | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!isValidDate(date)) return null;

  const utcParts: CalendarDateParts = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
  const localParts: CalendarDateParts = {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };

  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  const localDiffers =
    utcParts.year !== localParts.year ||
    utcParts.month !== localParts.month ||
    utcParts.day !== localParts.day;

  // If the timestamp is exactly midnight UTC and local date differs,
  // treat it as a date-only value encoded in UTC to avoid month shifting.
  if (isUtcMidnight && localDiffers) {
    return utcParts;
  }

  return localParts;
}

export function getCalendarYear(value: Date | string | null | undefined): number | null {
  const parts = getCalendarDateParts(value);
  return parts ? parts.year : null;
}

export function getCalendarMonth(value: Date | string | null | undefined): number | null {
  const parts = getCalendarDateParts(value);
  return parts ? parts.month : null;
}

export function getCalendarDateString(value: Date | string | null | undefined): string | null {
  const parts = getCalendarDateParts(value);
  if (!parts) return null;
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;
}

export function toCalendarDate(value: Date | string | null | undefined): Date | null {
  const parts = getCalendarDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month, parts.day);
}

export function isSameCalendarMonth(
  value: Date | string | null | undefined,
  month: number,
  year: number
): boolean {
  const parts = getCalendarDateParts(value);
  return !!parts && parts.month === month && parts.year === year;
}

export function isSameCalendarYear(
  value: Date | string | null | undefined,
  year: number
): boolean {
  const parts = getCalendarDateParts(value);
  return !!parts && parts.year === year;
}

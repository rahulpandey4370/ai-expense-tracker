export type CalendarDateParts = {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const isValidDate = (value: Date) => !Number.isNaN(value.getTime());

// The calendar timezone the app's dates are interpreted in. This is a
// single-user (INR/IST) app; override via APP_TIMEZONE if ever needed.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

/**
 * Convert an instant (Date or ISO string) to the YYYY-MM-DD calendar day it
 * falls on **in the app timezone**. This is what must be stored for a
 * transaction's `date`, so a picked "July 1" (which serializes to
 * 2026-06-30T18:30:00Z for an IST user) is stored as 2026-07-01, not the
 * UTC-sliced 2026-06-30. Runs correctly regardless of the server's own
 * timezone (Vercel = UTC), because it formats explicitly in APP_TIMEZONE.
 */
export function getAppCalendarDayString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!isValidDate(date)) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

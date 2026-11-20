/*
 * Goal forecasts: when a goal will be reached at the current pace, and what it
 * takes per month to hit its target date.
 *
 * ponytail: "pace" is everything saved so far spread over the months since the
 * goal was created, because allocations keep only their latest amount, not a
 * history. If allocation history is ever stored, use the last 3 months instead.
 */

const MONTH_MS = 30.4375 * 24 * 3600 * 1000;

export interface GoalForecast {
  /** Saved per month so far. */
  pacePerMonth: number;
  /** When the goal is reached at that pace; null if nothing has been saved yet. */
  reachBy: Date | null;
  /** The goal's own date: created + target months. */
  targetDate: Date;
  /** Per month needed from now to hit targetDate; null once the date has passed. */
  neededPerMonth: number | null;
  /** How much more than the current pace that is (0 when on track). */
  extraPerMonth: number;
  onTrack: boolean;
}

export function goalForecast(goal: { targetAmount: number; amountSavedSoFar: number; targetDurationMonths: number; createdAt: Date | string }, now = new Date()): GoalForecast | null {
  const created = new Date(goal.createdAt);
  const targetDate = new Date(created);
  targetDate.setMonth(targetDate.getMonth() + goal.targetDurationMonths);
  const remaining = goal.targetAmount - goal.amountSavedSoFar;
  if (remaining <= 0) return null; // reached

  const monthsSoFar = Math.max(1, (now.getTime() - created.getTime()) / MONTH_MS);
  const pacePerMonth = goal.amountSavedSoFar / monthsSoFar;
  const reachBy = pacePerMonth > 0 ? new Date(now.getTime() + (remaining / pacePerMonth) * MONTH_MS) : null;

  const monthsLeft = (targetDate.getTime() - now.getTime()) / MONTH_MS;
  const neededPerMonth = monthsLeft > 0 ? remaining / Math.max(1, Math.ceil(monthsLeft)) : null;
  const onTrack = reachBy !== null && reachBy <= targetDate;
  return {
    pacePerMonth, reachBy, targetDate, neededPerMonth,
    extraPerMonth: onTrack || neededPerMonth === null ? 0 : Math.max(0, neededPerMonth - pacePerMonth),
    onTrack,
  };
}

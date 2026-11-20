// The kinds of notification the user can switch off in Settings → Alerts.
export const NOTIFICATION_KINDS = [
  { kind: 'sms', label: 'Bank SMS "Log it?" prompts', hint: 'When the iPhone Shortcut sends a debit SMS' },
  { kind: 'budget', label: 'Budget alerts', hint: 'At 50%, 80% and 100% of a budget' },
  { kind: 'daily', label: '9 PM daily summary', hint: "Today's spending and the month so far" },
  { kind: 'bills', label: 'Bills due tomorrow', hint: 'Recurring entries due the next day' },
  { kind: 'weekly', label: 'Sunday weekly digest', hint: 'The week vs last week, budgets, one thing to notice' },
  { kind: 'monthly', label: 'Monthly recap and review', hint: 'On the 1st, for the month that ended' },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['kind'];

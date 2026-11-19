// One colour per money bucket, everywhere: the allocation bar, the badges and the pies.
// Tailwind's 500 shades, matching the bar's 400→600 gradients and the Need/Want badges.
export const TYPE_COLORS = {
  need: '#3b82f6', // blue-500
  want: '#a855f7', // purple-500
  investment: '#eab308', // yellow-500
  savings: '#22c55e', // green-500
} as const;

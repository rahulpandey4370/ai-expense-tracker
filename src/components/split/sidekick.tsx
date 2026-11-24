import type { LookId } from './looks';

// Original FinWise sidekicks — money-themed, drawn here (not anyone else's characters):
// Onyx = coin purse, Lagoon = ₹ coin, Coral = receipt, Grape = piggy bank.

function Face({ cx, cy, wink, ink = '#111', scale = 1 }: { cx: number; cy: number; wink?: boolean; ink?: string; scale?: number }) {
  const dx = 7 * scale, r = 2.6 * scale;
  return (
    <g fill={ink} stroke={ink} strokeLinecap="round">
      <circle cx={cx - dx} cy={cy} r={r} stroke="none" />
      {wink
        ? <path d={`M ${cx + dx - 3 * scale} ${cy + 0.5} q ${3 * scale} ${-3 * scale} ${6 * scale} 0`} fill="none" strokeWidth={2 * scale} />
        : <circle cx={cx + dx} cy={cy} r={r} stroke="none" />}
      <circle cx={cx - dx + 0.9 * scale} cy={cy - 0.9 * scale} r={0.8 * scale} fill="#fff" stroke="none" />
      <path d={`M ${cx - 5 * scale} ${cy + 6 * scale} q ${5 * scale} ${5 * scale} ${10 * scale} 0`} fill="none" strokeWidth={2.2 * scale} />
    </g>
  );
}

const Shadow = () => <ellipse cx="32" cy="60" rx="15" ry="2.6" fill="#000" opacity="0.12" />;

function Purse({ wink }: { wink?: boolean }) {
  return (
    <>
      <Shadow />
      <path d="M24 15 a8 8 0 0 1 16 0" fill="none" stroke="#3a3a3a" strokeWidth="3.2" />
      <circle cx="24" cy="16" r="3" fill="#c9a227" /><circle cx="40" cy="16" r="3" fill="#c9a227" />
      <path d="M10 30 q0 -12 22 -12 q22 0 22 12 v14 q0 14 -22 14 q-22 0 -22 -14z" fill="#1c1c1c" />
      <path d="M14 30 q18 -6 36 0" fill="none" stroke="#333" strokeWidth="2" />
      <Face cx={32} cy={38} wink={wink} ink="#ffffff" />
    </>
  );
}

function Coin({ wink }: { wink?: boolean }) {
  return (
    <>
      <Shadow />
      <circle cx="32" cy="33" r="24" fill="#0b6f72" />
      <circle cx="32" cy="33" r="19.5" fill="#12999d" />
      <path d="M17 24 a17 17 0 0 1 10 -8" fill="none" stroke="#bff3ef" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      <text x="32" y="25" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e6fffd" fontFamily="system-ui, sans-serif">₹</text>
      <Face cx={32} cy={36} wink={wink} ink="#06393b" />
    </>
  );
}

function Receipt({ wink }: { wink?: boolean }) {
  return (
    <>
      <Shadow />
      <path d="M14 8 h36 v44 l-4.5 4 -4.5 -4 -4.5 4 -4.5 -4 -4.5 4 -4.5 -4 -4.5 4 -4.5 -4z" fill="#e2485f" />
      <rect x="20" y="14" width="24" height="2.6" rx="1.3" fill="#ffd0d7" />
      <rect x="20" y="19.5" width="16" height="2.6" rx="1.3" fill="#ffd0d7" />
      <Face cx={32} cy={34} wink={wink} ink="#5a0d1b" />
    </>
  );
}

function Piggy({ wink }: { wink?: boolean }) {
  return (
    <>
      <Shadow />
      <path d="M17 16 l5 9 -8 2z" fill="#5b33b8" /><path d="M47 16 l-5 9 8 2z" fill="#5b33b8" />
      <ellipse cx="32" cy="35" rx="22" ry="19" fill="#7b4fd6" />
      <rect x="26" y="15.5" width="12" height="2.6" rx="1.3" fill="#3c2186" />
      <rect x="18" y="50" width="6" height="7" rx="2.5" fill="#5b33b8" /><rect x="40" y="50" width="6" height="7" rx="2.5" fill="#5b33b8" />
      <ellipse cx="32" cy="42" rx="7" ry="5" fill="#a98bff" />
      <circle cx="29.5" cy="42" r="1.4" fill="#3c2186" /><circle cx="34.5" cy="42" r="1.4" fill="#3c2186" />
      <Face cx={32} cy={31} wink={wink} ink="#ffffff" scale={0.85} />
    </>
  );
}

const BY_LOOK = { onyx: Purse, lagoon: Coin, coral: Receipt, grape: Piggy } as const;

/** The look's sidekick. Decorative (aria-hidden) unless a label is given. */
export function Sidekick({ look, size = 32, wink, label, className }: { look: LookId; size?: number; wink?: boolean; label?: string; className?: string }) {
  const Char = BY_LOOK[look];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Char wink={wink} />
    </svg>
  );
}

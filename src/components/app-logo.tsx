import type { SVGProps } from 'react';

interface AppLogoProps extends SVGProps<SVGSVGElement> {
  className?: string;
  appName?: string;
}

export function AppLogo({ className, appName = "Expense Tracker", ...props }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        stroke="currentColor"
        strokeWidth="3"
        className="h-10 w-10 text-primary transform rotate-45" // Kept funky logo style
        {...props}
      >
        <path d="M50 10 Q20 20 10 50 Q20 80 50 90 Q80 80 90 50 Q80 20 50 10 Z" fill="none"/>
        <path d="M30 30 L70 70 M70 30 L30 70" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="15" fill="hsl(var(--accent))" stroke="none"/>
        <path d="M50 25 V75 M25 50 H75" stroke="hsl(var(--primary-foreground))" strokeWidth="2" />
        <circle cx="20" cy="20" r="5" fill="hsl(var(--secondary))"/>
        <circle cx="80" cy="20" r="4" fill="hsl(var(--chart-3))"/>
        <circle cx="20" cy="80" r="6" fill="hsl(var(--chart-4))"/>
        <circle cx="80" cy="80" r="3" fill="hsl(var(--chart-5))"/>
        <rect x="45" y="5" width="10" height="10" fill="hsl(var(--accent))" transform="rotate(15 50 5)"/>
        <rect x="5" y="45" width="10" height="10" fill="hsl(var(--primary))" transform="rotate(-15 5 50)"/>
      </svg>
      <span className="text-xl font-extrabold text-primary group-data-[collapsible=icon]:hidden whitespace-nowrap tracking-tighter leading-tight">
        Rahul's Tracker
      </span>
    </div>
  );
}


import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  appName?: string;
}

export function AppLogo({ className, appName = "FinWise AI", ...props }: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-2 group", className || '')} {...props}>
      <svg 
        width="30" 
        height="30" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className="transform group-hover:scale-110 transition-transform duration-300 ease-in-out text-primary" // Use primary color
      >
        <path d="M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 8L10 12L6 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M18 8L14 12L18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Chaotic elements - could be more abstract if needed */}
        <path d="M8 5S9 3 12 3S16 5 16 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
        <path d="M8 19S9 21 12 21S16 19 16 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      </svg>
      <span className="text-xl font-extrabold text-primary group-data-[collapsible=icon]:hidden whitespace-nowrap tracking-tighter leading-tight">
        {appName}
      </span>
    </div>
  );
}

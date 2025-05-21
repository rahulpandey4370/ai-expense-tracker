
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
        className="transform group-hover:scale-110 transition-transform duration-300 ease-in-out text-primary"
      >
        {/* Simple abstract/chaotic symbol */}
        <path d="M12 2L12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22 12L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.0711 4.92896L4.92893 19.0711" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.0711 19.0711L4.92893 4.92896" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="hsl(var(--background))"/>
      </svg>
      {/* App name is now always visible, not hidden when sidebar is collapsed */}
      <span className="text-xl font-extrabold text-primary whitespace-nowrap tracking-tighter leading-tight">
        {appName}
      </span>
    </div>
  );
}

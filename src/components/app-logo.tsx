
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
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className="transform group-hover:scale-110 transition-transform duration-300 ease-in-out"
      >
        {/* Chaotic & Colorful Design */}
        {/* Shard 1 - Teal */}
        <path d="M50 10 L40 40 L60 40 Z" fill="#00D0C0" transform="rotate(15 50 50)" />
        <path d="M30 30 L20 60 L50 50 Z" fill="#0AD4D4" transform="rotate(-30 50 50) scale(0.9)" />
        
        {/* Shard 2 - Magenta */}
        <path d="M80 25 L70 55 L90 50 Z" fill="#FF00A0" transform="rotate(120 50 50)" />
        <path d="M65 70 L55 90 L85 80 Z" fill="#F000BA" transform="rotate(150 50 50) scale(0.85)" />

        {/* Shard 3 - Yellow */}
        <path d="M20 75 L10 95 L40 85 Z" fill="#FFD700" transform="rotate(240 50 50)" />
        <path d="M45 20 L35 40 L65 30 Z" fill="#FFEA00" transform="rotate(270 50 50) scale(0.95)" />

        {/* Central Element - Darker Accent */}
        <circle cx="50" cy="50" r="12" fill="hsl(var(--accent))" opacity="0.7" />
        <circle cx="50" cy="50" r="7" fill="hsl(var(--accent-foreground))" opacity="0.5" />
      </svg>
      <span className={cn(
        "text-xl font-extrabold text-primary whitespace-nowrap tracking-tighter leading-tight",
        "group-data-[collapsible=icon]:hidden" // Hides text when sidebar has data-collapsible="icon"
      )}>
        {appName}
      </span>
    </div>
  );
}

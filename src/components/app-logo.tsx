
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
        {/* Layer 1: Background Glow/Shape (Subtle) */}
        <circle cx="50" cy="50" r="45" fill="url(#neonGradientBlue)" opacity="0.3" />

        {/* Layer 2: Primary Neon Shapes - Suggesting upward trend / connection */}
        <path d="M30 70 Q40 50 50 30" stroke="url(#neonGradientPink)" strokeWidth="8" strokeLinecap="round" />
        <path d="M50 30 Q60 50 70 70" stroke="url(#neonGradientCyan)" strokeWidth="8" strokeLinecap="round" />
        <path d="M40 70 H60" stroke="url(#neonGradientLime)" strokeWidth="6" strokeLinecap="round" />
        
        {/* Layer 3: Accent Dots/Elements */}
        <circle cx="50" cy="30" r="5" fill="#FFFFFF" />
        <circle cx="30" cy="70" r="4" fill="#FFFFFF" opacity="0.8"/>
        <circle cx="70" cy="70" r="4" fill="#FFFFFF" opacity="0.8"/>

        <defs>
          <radialGradient id="neonGradientBlue" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
            <stop offset="0%" stopColor="#00FFFF" stopOpacity="0.7"/> {/* Neon Cyan */}
            <stop offset="100%" stopColor="#0000FF" stopOpacity="0"/> {/* Transparent Blueish edge */}
          </radialGradient>
          <linearGradient id="neonGradientPink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF00FF"/> {/* Neon Magenta/Pink */}
            <stop offset="100%" stopColor="#FF69B4"/> {/* Hot Pink */}
          </linearGradient>
          <linearGradient id="neonGradientCyan" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00FFFF"/> {/* Neon Cyan */}
            <stop offset="100%" stopColor="#40E0D0"/> {/* Turquoise */}
          </linearGradient>
           <linearGradient id="neonGradientLime" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="#39FF14"/> {/* Neon Lime Green */}
            <stop offset="100%" stopColor="#ADFF2F"/> {/* GreenYellow */}
          </linearGradient>
        </defs>
      </svg>
      <span className={cn(
        "text-xl font-extrabold text-primary whitespace-nowrap tracking-tighter leading-tight",
        "group-data-[collapsible=icon]:hidden" // Hide text when sidebar has data-collapsible="icon"
      )}>
        {appName}
      </span>
    </div>
  );
}


import Image from 'next/image';

interface AppLogoProps {
  className?: string;
  appName?: string;
}

export function AppLogo({ className, appName = "FinWise AI", ...props }: AppLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Image 
        src="/favicon.png" 
        alt="FinWise AI Logo" 
        width={32} 
        height={32} 
        className="transform rotate-12 transition-transform duration-300 ease-in-out group-hover:scale-110"
      />
      <span className="text-xl font-extrabold text-primary group-data-[collapsible=icon]:hidden whitespace-nowrap tracking-tighter leading-tight">
        {appName}
      </span>
    </div>
  );
}
    

import type { SVGProps } from 'react';

export function FinWiseLogo({ className, ...props }: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-primary"
        {...props}
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span className="text-2xl font-bold text-primary group-data-[collapsible=icon]:hidden">FinWise</span>
    </div>
  );
}

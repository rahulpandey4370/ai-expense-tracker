import { cn } from "@/lib/utils"

// `skeleton` (globals.css) keeps the block invisible for its first 300ms, so fast
// loads never flash grey; the space is still reserved, so nothing jumps.
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }

import { cn } from '@/lib/utils'

interface DotPatternProps {
  className?: string
  opacity?: number
}

/** Quiet grid texture for engine pages */
export function DotPattern({ className, opacity = 0.35 }: DotPatternProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        opacity,
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)',
        backgroundSize: '28px 28px',
      }}
    />
  )
}

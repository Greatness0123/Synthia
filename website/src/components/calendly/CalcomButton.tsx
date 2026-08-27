import { Calendar } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

interface CalcomButtonProps {
  children?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
}

export function CalcomButton({
  children = 'Book a call with the founder',
  variant = 'ghost',
  className,
}: CalcomButtonProps) {
  const baseClass =
    'group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-transform duration-300 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]'

  const variantClass = {
    primary: 'bg-ink text-white shadow-lg shadow-ink/10',
    secondary:
      'border border-ink/15 bg-white/80 text-ink backdrop-blur-sm hover:bg-white',
    ghost: 'hover:text-teal',
  }

  return (
    <a
      href={siteConfig.calcomUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(baseClass, variantClass[variant], className)}
      aria-label="Book a call with the founder"
    >
      <Calendar size={variant === 'ghost' ? 14 : 16} className={cn(variant === 'ghost' && 'mr-0.5')} />
      <span>{children}</span>
    </a>
  )
}

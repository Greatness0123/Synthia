import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ShimmerButtonProps {
  children: ReactNode
  className?: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** 21st.dev–inspired shimmer CTA */
export function ShimmerButton({
  children,
  className,
  href,
  onClick,
  variant = 'primary',
}: ShimmerButtonProps) {
  const base =
    'group relative inline-flex items-center justify-center overflow-hidden rounded-full px-6 py-3 text-sm font-medium transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]'

  const variants = {
    primary: 'bg-ink text-white shadow-lg shadow-ink/10',
    secondary:
      'border border-ink/15 bg-white/80 text-ink backdrop-blur-sm hover:bg-white',
    ghost: 'text-ink hover:bg-ink/5',
  }

  const inner = (
    <>
      {variant === 'primary' && (
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </>
  )

  if (href) {
    const isExternal = href.startsWith('http')
    return (
      <motion.a
        href={href}
        className={cn(base, variants[variant], className)}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        whileTap={{ scale: 0.98 }}
      >
        {inner}
      </motion.a>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(base, variants[variant], className)}
      whileTap={{ scale: 0.98 }}
    >
      {inner}
    </motion.button>
  )
}

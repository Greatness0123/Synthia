import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AmbientOrbsProps {
  className?: string
}

/** Soft floating orbs. Anthropic-style ambient motion, kept lightweight. */
export function AmbientOrbs({ className }: AmbientOrbsProps) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <motion.div
        className="absolute -left-20 top-1/4 h-[420px] w-[420px] rounded-full bg-amber-glow/30 blur-3xl"
        animate={{
          x: [0, 40, 0],
          y: [0, -30, 0],
          scale: [1, 1.08, 1],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-16 bottom-1/4 h-[380px] w-[380px] rounded-full bg-teal-soft/25 blur-3xl"
        animate={{
          x: [0, -35, 0],
          y: [0, 25, 0],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        className="absolute left-1/3 top-1/2 h-[280px] w-[280px] rounded-full bg-amber-soft/15 blur-3xl"
        animate={{
          x: [0, 20, -10, 0],
          y: [0, -20, 10, 0],
        }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
    </div>
  )
}

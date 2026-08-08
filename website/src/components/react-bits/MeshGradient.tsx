import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface MeshGradientProps {
  className?: string
}

/** Slow ambient mesh gradient. Anthropic-style drifting color field. */
export function MeshGradient({ className }: MeshGradientProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <motion.div
        className="absolute -left-[20%] top-[20%] h-[70vh] w-[70vh] rounded-full bg-amber-glow/35 blur-3xl"
        animate={{
          x: [0, 60, -20, 0],
          y: [0, -40, 30, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-[15%] top-[10%] h-[60vh] w-[60vh] rounded-full bg-teal-soft/30 blur-3xl"
        animate={{
          x: [0, -50, 30, 0],
          y: [0, 40, -20, 0],
          scale: [1, 1.08, 0.96, 1],
        }}
        transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
      <motion.div
        className="absolute left-[30%] bottom-[10%] h-[50vh] w-[50vh] rounded-full bg-amber-soft/25 blur-3xl"
        animate={{
          x: [0, 30, -40, 0],
          y: [0, -30, 20, 0],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 8 }}
      />
      <motion.div
        className="absolute right-[25%] bottom-[20%] h-[40vh] w-[40vh] rounded-full bg-teal/15 blur-3xl"
        animate={{
          x: [0, -30, 20, 0],
          y: [0, 20, -30, 0],
          scale: [1, 1.05, 1, 1],
        }}
        transition={{ duration: 40, repeat: Infinity, ease: 'easeInOut', delay: 12 }}
      />
    </div>
  )
}

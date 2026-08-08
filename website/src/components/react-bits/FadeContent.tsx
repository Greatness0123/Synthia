import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { motionDistance, motionTransition } from '@/lib/motion'

interface FadeContentProps {
  children: ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'none'
}

export function FadeContent({
  children,
  className,
  delay = 0,
  direction = 'up',
}: FadeContentProps) {
  const offset =
    direction === 'up'
      ? motionDistance.sm
      : direction === 'down'
        ? -motionDistance.sm
        : 0

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ ...motionTransition.fast, delay }}
    >
      {children}
    </motion.div>
  )
}

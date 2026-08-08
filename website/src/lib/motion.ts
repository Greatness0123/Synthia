/** Shared motion tokens for consistent, snappy transitions site-wide */
export const motionEase = [0.25, 0.1, 0.25, 1] as const

export const motionTransition = {
  fast: { duration: 0.28, ease: motionEase },
  page: { duration: 0.12, ease: motionEase },
  spring: { type: 'spring' as const, stiffness: 480, damping: 34 },
} as const

export const motionDistance = {
  sm: 8,
  md: 12,
} as const

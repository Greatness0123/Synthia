import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import { motionEase, motionTransition } from '@/lib/motion'

interface SplitTextProps {
  text: string
  className?: string
  delay?: number
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
  /** Play on mount instead of scroll (for hero) */
  immediate?: boolean
}

const container: Variants = {
  hidden: {},
  visible: (delay: number) => ({
    transition: { staggerChildren: 0.018, delayChildren: delay },
  }),
}

const word: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: motionTransition.fast.duration, ease: motionEase },
  },
}

export function SplitText({
  text,
  className,
  delay = 0,
  as: Tag = 'span',
  immediate = false,
}: SplitTextProps) {
  const words = text.split(' ')

  return (
    <Tag className={cn('inline', className)}>
      <motion.span
        className="inline"
        variants={container}
        initial="hidden"
        {...(immediate
          ? { animate: 'visible', custom: delay }
          : { whileInView: 'visible', viewport: { once: true, margin: '-20px' }, custom: delay })}
      >
        {words.map((segment, index) => (
          <motion.span
            key={`${segment}-${index}`}
            variants={word}
            className="mr-[0.28em] inline-block last:mr-0"
          >
            {segment}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  )
}

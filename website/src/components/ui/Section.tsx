import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionProps {
  id?: string
  children: ReactNode
  className?: string
  dark?: boolean
}

export function Section({ id, children, className, dark }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'section-padding',
        dark ? 'bg-surface-dark text-white' : 'bg-surface',
        className,
      )}
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  )
}

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  light?: boolean
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  light,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-14 max-w-3xl',
        align === 'center' && 'mx-auto text-center',
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            'mb-4 text-xs font-medium uppercase tracking-[0.22em]',
            light ? 'text-teal-soft' : 'text-teal',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          'font-serif text-balance text-3xl leading-[1.1] tracking-tight md:text-4xl lg:text-5xl',
          light ? 'text-white' : 'text-ink',
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg',
            light ? 'text-white/70' : 'text-ink-muted',
            align === 'left' && 'mx-0',
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}

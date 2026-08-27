import { Star } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

interface StarButtonProps {
  className?: string
  children?: React.ReactNode
}

export function StarButton({ className, children = 'Star on GitHub' }: StarButtonProps) {
  return (
    <a
      href={siteConfig.repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-ink/15',
        'bg-white/80 px-5 py-2.5 text-sm font-medium text-ink',
        'backdrop-blur-sm transition-all duration-300',
        'motion-safe:hover:scale-[1.02] motion-safe:hover:bg-white motion-safe:active:scale-[0.98]',
        className,
      )}
      aria-label={`Star ${siteConfig.name} on GitHub`}
    >
      <Star
        size={16}
        className="text-amber transition-transform duration-150 group-hover:scale-110 group-hover:fill-amber/30"
      />
      <span>{children}</span>
    </a>
  )
}

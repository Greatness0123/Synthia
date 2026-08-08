import { cn } from '@/lib/utils'

export type SocialKey = 'github' | 'x' | 'telegram' | 'discord' | 'youtube'

interface SocialLinksProps {
  dark?: boolean
  className?: string
  size?: 'sm' | 'md'
}

/** Placeholder URLs live here, in code. Swap when the real handles exist. */
const PLACEHOLDER_URLS: Record<SocialKey, string> = {
  github: 'https://github.com/Greatness0123/synthia1.5.1',
  x: 'https://x.com/synthia_app',
  telegram: 'https://t.me/+placeholder',
  discord: 'https://discord.gg/placeholder',
  youtube: 'https://youtube.com/@synthia',
}

const SOCIAL_LINKS: Array<{ key: SocialKey; label: string }> = [
  { key: 'github', label: 'GitHub' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'discord', label: 'Discord' },
  { key: 'youtube', label: 'YouTube' },
]

export function SocialLinks({ dark, className, size = 'md' }: SocialLinksProps) {
  const iconClass = cn(
    size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]',
    'transition-transform duration-150 group-hover:scale-110',
    dark ? 'text-white/60 group-hover:text-white' : 'text-ink-muted group-hover:text-ink',
  )

  const buttonClass = cn(
    'group flex items-center justify-center rounded-full border border-current/15 transition-colors duration-150 hover:border-teal/40 hover:text-teal',
    size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
  )

  return (
    <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3', className)}>
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.key}
          href={PLACEHOLDER_URLS[link.key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className={buttonClass}
        >
          <svg className={iconClass} aria-hidden>
            <use href={`/icons.svg#${link.key}`} />
          </svg>
        </a>
      ))}
    </div>
  )
}

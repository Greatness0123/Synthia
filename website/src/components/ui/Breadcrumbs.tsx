import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
  dark?: boolean
  className?: string
}

function getBreadcrumbsJsonLd(items: Crumb[]) {
  const listItems = [
    { position: 1, name: 'Home', item: 'https://www.runsynthia.online/' },
    ...items.map((item, i) => ({
      position: i + 2,
      name: item.label,
      ...(item.href ? { item: `https://www.runsynthia.online${item.href}` } : {}),
    })),
  ]

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: listItems,
  }
}

export function Breadcrumbs({ items, dark, className }: BreadcrumbsProps) {
  const jsonLd = getBreadcrumbsJsonLd(items)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className={cn('mb-8', className)}>
        <ol className="flex flex-wrap items-center gap-1.5 text-sm">
          <li>
            <Link
              to="/"
              className={cn(
                'transition-colors hover:underline',
                dark ? 'text-white/50 hover:text-white' : 'text-ink-faint hover:text-ink',
              )}
            >
              Home
            </Link>
          </li>
          {items.map((item, index) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <ChevronRight
                size={14}
                className={dark ? 'text-white/30' : 'text-ink/20'}
                aria-hidden
              />
              {item.href && index < items.length - 1 ? (
                <Link
                  to={item.href}
                  className={cn(
                    'transition-colors hover:underline',
                    dark ? 'text-white/50 hover:text-white' : 'text-ink-faint hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span className={dark ? 'text-white/80' : 'text-ink-muted'}>{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}

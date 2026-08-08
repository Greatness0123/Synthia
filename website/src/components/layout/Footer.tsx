import { Link } from 'react-router-dom'
import { siteConfig } from '@/config/site'
import { SocialLinks } from '@/components/layout/SocialLinks'
import { cn } from '@/lib/utils'

interface FooterProps {
  dark?: boolean
}

export function Footer({ dark }: FooterProps) {
  return (
    <footer
      className={cn(
        'border-t px-4 py-12 sm:px-6 md:px-10 md:py-16',
        dark
          ? 'border-white/10 bg-surface-dark text-white/70'
          : 'border-ink/5 bg-surface text-ink-muted',
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-md space-y-4">
          <p className={cn('font-serif text-2xl', dark ? 'text-white' : 'text-ink')}>
            {siteConfig.name}
          </p>
          <p className="leading-relaxed">{siteConfig.tagline}</p>
          <SocialLinks dark={dark} />
        </div>

        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <div className="space-y-3">
            <p className={cn('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              Explore
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/how-it-works" className="transition-colors hover:text-amber-soft">
                  How it works
                </Link>
              </li>
              <li>
                <Link to="/memory" className="transition-colors hover:text-amber-soft">
                  Memory
                </Link>
              </li>
              <li>
                <Link to="/data" className="transition-colors hover:text-amber-soft">
                  Data export
                </Link>
              </li>
              <li>
                <Link to="/blog" className="transition-colors hover:text-amber-soft">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className={cn('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              Setup
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/guides/kaggle" className="transition-colors hover:text-amber-soft">
                  Free inference on Kaggle
                </Link>
              </li>
              <li>
                <Link
                  to="/guides/cloudflare-tunnel"
                  className="transition-colors hover:text-amber-soft"
                >
                  Cloudflare tunnel
                </Link>
              </li>
              <li>
                <a
                  href={siteConfig.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-amber-soft"
                >
                  GitHub repo
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <p className={cn('text-sm font-medium', dark ? 'text-white' : 'text-ink')}>
              Try it
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <a href={siteConfig.appUrl} className="transition-colors hover:text-amber-soft">
                  Open SYNTHIA in your browser
                </a>
              </li>
              <li>
                <Link to="/roadmap" className="transition-colors hover:text-amber-soft">
                  Where it is going
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'mx-auto mt-10 max-w-6xl border-t pt-6 text-sm md:mt-12 md:pt-8',
          dark ? 'border-white/10' : 'border-ink/5',
        )}
      >
        <p className="flex flex-wrap items-center justify-between gap-4">
          <span>{siteConfig.license} License · Open Source</span>
          <span>
            Created & Founded by{' '}
            <a
              href={siteConfig.builderPortfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'font-medium transition-colors hover:underline underline-offset-4',
                dark ? 'text-teal-soft hover:text-white' : 'text-teal hover:text-ink',
              )}
            >
              {siteConfig.builderName}
            </a>
          </span>
        </p>
      </div>
    </footer>
  )
}

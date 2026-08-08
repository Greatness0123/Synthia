import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Menu, X } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { SocialLinks } from '@/components/layout/SocialLinks'
import { motionTransition } from '@/lib/motion'
import { cn } from '@/lib/utils'

const navLinks = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Data', href: '/data' },
  { label: 'Guides', href: '/guides/kaggle' },
  { label: 'Blog', href: '/blog' },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [navVisible, setNavVisible] = useState(true)
  const lastY = useRef(0)
  const location = useLocation()
  const isEnginePage = ['/how-it-works', '/memory', '/roadmap', '/guides'].some((path) =>
    location.pathname.startsWith(path),
  )

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 24)

      const section = document.getElementById('why-synthia')
      if (section) {
        const { top, bottom } = section.getBoundingClientRect()
        const inWhySynthia = top <= 60 && bottom > 60

        if (inWhySynthia) {
          setNavVisible(true)
          lastY.current = y
          return
        }

        if (y < 10) {
          setNavVisible(true)
        } else if (y > lastY.current + 5) {
          if (bottom <= 0) setNavVisible(false)
        } else if (y < lastY.current - 5) {
          setNavVisible(true)
        }
      } else {
        if (y < 10) {
          setNavVisible(true)
        } else if (y > lastY.current + 5) {
          setNavVisible(false)
        } else if (y < lastY.current - 5) {
          setNavVisible(true)
        }
      }

      lastY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, navVisible])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out',
        navVisible ? 'translate-y-0' : '-translate-y-full',
      )}
    >
      {/* Full-width rectangle bar at top */}
      {!scrolled && (
        <div
          className={cn(
            'transition-colors duration-200',
            isEnginePage
              ? 'border-b border-white/10 bg-surface-dark/90 backdrop-blur-md'
              : 'border-b border-ink/5 bg-surface/90 backdrop-blur-md',
          )}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 md:px-10">
            <Link
              to="/"
              className={cn(
                'shrink-0 font-serif text-xl tracking-tight transition-opacity hover:opacity-80',
                isEnginePage ? 'text-white' : 'text-ink',
              )}
            >
              {siteConfig.name}
            </Link>

            <nav className="hidden items-center gap-6 lg:flex xl:gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'text-sm transition-colors duration-150',
                    isEnginePage
                      ? 'text-white/60 hover:text-white'
                      : 'text-ink-muted hover:text-ink',
                    location.pathname.startsWith(link.href) && 'text-teal',
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <SocialLinks dark={isEnginePage} size="sm" />
              <ShimmerButton href={siteConfig.appUrl} variant="primary">
                It's Free
              </ShimmerButton>
            </nav>

            <div className="flex items-center gap-3 lg:hidden">
              <SocialLinks dark={isEnginePage} size="sm" className="hidden sm:flex" />
              <button
                type="button"
                className={cn(isEnginePage ? 'text-white' : 'text-ink')}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionTransition.fast}
                className={cn(
                  'overflow-hidden border-t lg:hidden',
                  isEnginePage
                    ? 'border-white/10 bg-surface-dark'
                    : 'border-ink/5 bg-surface',
                )}
              >
                <div className="flex flex-col gap-4 px-6 py-6">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      to={link.href}
                      className={cn(
                        'text-base',
                        isEnginePage ? 'text-white/80' : 'text-ink-muted',
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <SocialLinks dark={isEnginePage} />
                  <ShimmerButton href={siteConfig.appUrl} className="w-full">
                    It's Free
                  </ShimmerButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Glass morphism pill on scroll */}
      {scrolled && (
        <div className="flex justify-center px-4 pt-3">
          <div className="flex items-center gap-3 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 shadow-lg backdrop-blur-xl">
            <Link
              to="/"
              className="shrink-0 font-serif text-lg tracking-tight text-white transition-opacity hover:opacity-80"
            >
              {siteConfig.name}
            </Link>

            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
              <ChevronDown
                size={12}
                className={cn(
                  'transition-transform duration-200',
                  menuOpen && 'rotate-180',
                )}
              />
            </button>
          </div>
        </div>
      )}

      {/* Dropdown from pill */}
      <AnimatePresence>
        {scrolled && menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={motionTransition.fast}
            className="flex justify-center px-4 pt-2"
          >
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-2xl backdrop-blur-2xl">
              <div className="flex flex-col gap-1 p-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={cn(
                      'rounded-lg px-4 py-2.5 text-sm transition-colors',
                      location.pathname.startsWith(link.href)
                        ? 'bg-white/10 text-teal'
                        : 'text-white/70 hover:bg-white/8 hover:text-white',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <ShimmerButton href={siteConfig.appUrl} className="mt-1 w-full">
                  It's Free
                </ShimmerButton>
              </div>
              <div className="border-t border-white/10 px-4 py-3">
                <SocialLinks dark size="sm" className="justify-center" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

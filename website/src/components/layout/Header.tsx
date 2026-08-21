import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Menu, X } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { SocialLinks } from '@/components/layout/SocialLinks'
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
  const isEnginePage = false

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
          setNavVisible(false)
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
  }, [location.pathname, navVisible, scrolled])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex flex-col items-center px-3 sm:px-4 pointer-events-none transition-transform duration-300 ease-out',
        navVisible ? 'translate-y-0' : '-translate-y-full',
      )}
    >
      {/* ── Frosted Glassmorphism Floating Pill ── */}
      <motion.div
        className={cn(
          'pointer-events-auto h-[52px] sm:h-[56px] overflow-hidden rounded-full backdrop-blur-2xl backdrop-saturate-150 transition-[border-color,background-color,box-shadow] duration-300',
          isEnginePage
            ? 'border border-white/20 bg-black/45 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.37),inset_0_1px_1px_0_rgba(255,255,255,0.15)]'
            : 'border border-white/60 bg-white/60 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)]',
        )}
        animate={{
          maxWidth: scrolled ? 175 : 920,
          width: '100%',
          marginTop: scrolled ? 12 : 16,
        }}
        transition={{
          type: 'spring',
          stiffness: 340,
          damping: 30,
          mass: 0.75,
        }}
        style={{
          borderRadius: 9999,
        }}
      >
        <AnimatePresence mode="wait">
          {!scrolled ? (
            /* Wide Top Bar State */
            <motion.div
              key="wide-nav"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, delay: 0.08 }}
              className="flex h-full w-full items-center justify-between px-5 sm:px-7"
            >
              <Link
                to="/"
                className={cn(
                  'shrink-0 font-serif text-[22px] sm:text-2xl tracking-tight transition-opacity duration-200 hover:opacity-80',
                  isEnginePage ? 'text-white' : 'text-ink',
                )}
              >
                {siteConfig.name}
              </Link>

              {/* Desktop Navigation Links — smoothly fades in with zero horizontal catapulting */}
              <nav className="hidden items-center gap-6 lg:flex xl:gap-8 whitespace-nowrap">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={cn(
                      'text-[15px] font-medium transition-colors duration-150',
                      isEnginePage
                        ? 'text-white/80 hover:text-white'
                        : 'text-ink-muted hover:text-ink',
                      location.pathname.startsWith(link.href) && 'text-teal font-semibold',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <SocialLinks dark={isEnginePage} size="sm" />
                <ShimmerButton href={siteConfig.appUrl} variant="primary" className="!py-2 !px-5 text-xs font-semibold">
                  It's Free
                </ShimmerButton>
              </nav>

              {/* Mobile Hamburger (Wide bar) */}
              <div className="flex items-center gap-2.5 lg:hidden">
                <SocialLinks dark={isEnginePage} size="sm" className="hidden sm:flex" />
                <button
                  type="button"
                  className={cn(
                    'p-1.5 rounded-full transition-colors',
                    isEnginePage ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-black/5'
                  )}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                >
                  {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
              </div>
            </motion.div>
          ) : (
            /* Mini Scrolled Pill State */
            <motion.div
              key="mini-nav"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.05 }}
              className="flex h-full w-full items-center justify-center gap-2 px-3.5"
            >
              <Link
                to="/"
                className={cn(
                  'shrink-0 font-serif text-[17px] tracking-tight transition-opacity duration-200 hover:opacity-80',
                  isEnginePage ? 'text-white' : 'text-ink',
                )}
              >
                {siteConfig.name}
              </Link>

              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-medium transition-colors cursor-pointer',
                  isEnginePage
                    ? 'text-white/80 hover:bg-white/10 hover:text-white'
                    : 'text-ink/80 hover:bg-black/5 hover:text-ink',
                )}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? <X size={15} /> : <Menu size={15} />}
                <ChevronDown
                  size={11}
                  className={cn(
                    'transition-transform duration-200',
                    menuOpen && 'rotate-180',
                  )}
                />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Frosted Glass Dropdown Menu ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn(
              'pointer-events-auto mt-2.5 w-full max-w-sm overflow-hidden rounded-2xl p-3.5 backdrop-blur-2xl backdrop-saturate-150',
              isEnginePage
                ? 'border border-white/20 bg-black/60 text-white shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)]'
                : 'border border-white/60 bg-white/75 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.08),inset_0_1px_1px_0_rgba(255,255,255,0.9)]',
            )}
          >
            <div className="flex flex-col gap-1.5 p-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'rounded-xl px-4 py-3 text-base font-medium transition-colors',
                    location.pathname.startsWith(link.href)
                      ? 'bg-teal/10 text-teal font-semibold'
                      : isEnginePage
                        ? 'text-white/80 hover:bg-white/10 hover:text-white'
                        : 'text-ink-muted hover:bg-black/5 hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-2">
                <ShimmerButton href={siteConfig.appUrl} className="w-full !py-2.5 text-sm font-semibold">
                  It's Free
                </ShimmerButton>
              </div>
            </div>
            <div className={cn('mt-2.5 border-t pt-3 pb-1', isEnginePage ? 'border-white/10' : 'border-ink/10')}>
              <SocialLinks dark={isEnginePage} size="sm" className="justify-center" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

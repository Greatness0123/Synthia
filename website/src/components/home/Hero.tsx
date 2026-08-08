import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import { heroCopy, siteConfig } from '@/config/site'
import { SplitText } from '@/components/react-bits/SplitText'
import { AmbientOrbs } from '@/components/react-bits/AmbientOrbs'
import { MeshGradient } from '@/components/react-bits/MeshGradient'
import { GrainOverlay } from '@/components/react-bits/GrainOverlay'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { motionTransition } from '@/lib/motion'
import { Link } from 'react-router-dom'

export function Hero() {
  const [videoReady, setVideoReady] = useState(false)
  const headlineLines = heroCopy.headline.split('\n')

  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,_#E8D5B0_0%,_transparent_55%),radial-gradient(ellipse_at_50%_80%,_#5BA3A3_0%,_transparent_45%),linear-gradient(180deg,_#FAF9F7_0%,_#F3F1ED_100%)]"
      />
      <MeshGradient />
      <AmbientOrbs />
      <GrainOverlay />

      <div className="absolute inset-0">
        <video
          className={`h-full w-full object-cover transition-opacity duration-500 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted
          loop
          playsInline
          poster="/media/hero-poster.jpg"
          onLoadedData={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
        >
          <source src="/media/hero-loop.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-surface/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface/40 via-transparent to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-4 pb-20 pt-28 text-center sm:px-6 md:px-10 md:pt-32">
        <h1 className="font-serif text-4xl leading-[1.04] tracking-tight text-ink sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem]">
          {headlineLines.map((line, index) => (
            <span key={index} className="block">
              <SplitText text={line} as="span" immediate delay={0.15 + index * 0.12} />
            </span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...motionTransition.fast, delay: 0.55 }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:mt-8 sm:text-lg md:text-xl"
        >
          {heroCopy.subheadline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...motionTransition.fast, delay: 0.7 }}
          className="mt-10 flex flex-col items-center gap-3 sm:mt-12 sm:flex-row sm:gap-4"
        >
          <ShimmerButton href={siteConfig.appUrl} className="px-7 py-3.5 text-base font-medium">
            It's Free
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </ShimmerButton>

          <a
            href="#why-synthia"
            onClick={(e) => {
              const el = document.getElementById('why-synthia')
              if (el) {
                e.preventDefault()
                el.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-surface-elevated px-7 py-3.5 text-base font-medium text-ink transition-colors hover:bg-surface-card"
          >
            <Play size={16} />
            See how it works
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...motionTransition.fast, delay: 0.85 }}
          className="mt-8 text-sm text-ink-faint sm:mt-10"
        >
          Created by{' '}
          <a
            href={siteConfig.builderPortfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-teal hover:underline underline-offset-4"
          >
            Greatness Okorie
          </a>{' '}
          · MIT Licensed · Open Source.{' '}
          <Link to="/how-it-works" className="text-ink-muted underline-offset-4 hover:underline">
            Read architecture
          </Link>
        </motion.p>
      </div>
    </section>
  )
}

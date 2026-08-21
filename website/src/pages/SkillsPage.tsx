import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { skillLevels } from '@/data/skills'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

export function SkillsPage() {
  return (
    <PageLayout>
      <div className="section-padding mx-auto max-w-4xl pt-28">
        <FadeContent>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal">
            Physical Evolution
          </p>
          <h1 className="font-serif text-4xl leading-tight text-ink md:text-5xl">
            Watch your AI master physical skills step by step
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-muted">
            It starts out barely able to balance. Step by step, level by level, it learns: standing, walking, turning, negotiating obstacles, climbing stairs, and reaching goals. You watch a mind learn to use its body in real time.
          </p>
        </FadeContent>

        <div className="relative my-16">
          <div
            aria-hidden
            className="absolute left-4 top-0 hidden h-full w-px bg-gradient-to-b from-teal via-amber to-transparent md:block"
          />

          <div className="space-y-4">
            {skillLevels.map((lvl, index) => (
              <FadeContent key={lvl.id} delay={index * 0.05}>
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="relative rounded-2xl border border-ink/10 bg-surface-elevated p-6 shadow-sm md:pl-14"
                >
                  <span className="absolute left-6 top-6 hidden h-3 w-3 rounded-full bg-teal md:block" />
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-sm text-amber font-semibold">
                      Level {lvl.id < 10 ? `0${lvl.id}` : lvl.id}
                    </span>
                    <h2 className="font-serif text-xl text-ink">{lvl.name}</h2>
                  </div>
                  <p className="mt-2 text-ink">{lvl.description}</p>
                  <p className="mt-2 text-sm text-ink-muted">Success: {lvl.criteria}</p>
                </motion.div>
              </FadeContent>
            ))}
          </div>
        </div>

        <FadeContent>
          <ShimmerButton href={siteConfig.appUrl}>Try SYNTHIA. It's Free</ShimmerButton>
        </FadeContent>

        <div className="mt-12">
          <Link
            to="/how-it-works"
            className="text-sm text-teal underline-offset-4 hover:underline"
          >
            ← Back to architecture
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}

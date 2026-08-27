import { ArrowRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { siteConfig } from '@/config/site'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { Section } from '@/components/ui/Section'

export function TryIt() {
  return (
    <>
      <Section>
        <FadeContent>
          <div className="mx-auto max-w-3xl rounded-3xl border border-ink/10 bg-surface-elevated px-6 py-12 text-center shadow-[0_30px_80px_-30px_rgba(26,25,23,0.15)] sm:px-10 sm:py-16 md:px-16">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-teal">
              Open the page
            </p>
            <h2 className="font-serif text-3xl leading-[1.05] tracking-tight text-ink sm:text-4xl md:text-5xl">
              Two clicks.
              <br />
              Then it's in its world.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Click open. Plug in an AI provider (free Kaggle option, or your own key). Your AI
              is already in a world, waiting.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4">
              <ShimmerButton
                href={siteConfig.appUrl}
                className="px-6 py-3 text-base sm:px-8 sm:py-4"
              >
                Get Started
                <ArrowRight size={18} />
              </ShimmerButton>
              <ShimmerButton
                href="/guides/kaggle"
                variant="secondary"
                className="px-6 py-3 text-base sm:px-8 sm:py-4"
              >
                <BookOpen size={16} />
                See the setup guide
              </ShimmerButton>
            </div>

            <p className="mt-8 text-sm text-ink-faint">
              Best on a laptop with a recent browser. Your AI and everything it learns stay on
              your machine.
            </p>
          </div>
        </FadeContent>
      </Section>

      <Section dark className="!py-16 sm:!py-20">
        <FadeContent>
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-serif text-2xl leading-snug text-white sm:text-3xl md:text-4xl">
              Today, your AI is yours.
              <br className="hidden sm:block" />{' '}
              <span className="text-white/60">Tomorrow, they live together.</span>
            </p>
            <Link
              to="/roadmap"
              className="mt-6 inline-block text-sm text-teal-soft underline-offset-4 hover:underline"
            >
              Read the roadmap →
            </Link>
          </div>
        </FadeContent>
      </Section>
    </>
  )
}

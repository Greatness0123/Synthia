import { FadeContent } from '@/components/react-bits/FadeContent'
import { siteConfig } from '@/config/site'

export function FounderQuote() {
  return (
    <section className="section-padding">
      <FadeContent>
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-ink/8 bg-white px-8 py-12 text-center shadow-[0_8px_40px_-12px_rgba(26,25,23,0.12),0_2px_8px_-2px_rgba(26,25,23,0.06)] sm:px-12 sm:py-16 md:px-20">
            <p className="mb-6 text-5xl leading-none text-teal/30" aria-hidden>
              &#10077;
            </p>

            <blockquote className="font-serif text-2xl leading-snug tracking-tight text-ink sm:text-3xl md:text-4xl">
              What if AI was <span className="text-teal">unpredictable</span>, caught in a{' '}
              <span className="text-teal">loop</span> like us?{' '}
              <span className="text-amber">Walk</span>,{' '}
              <span className="text-amber">fall</span>,{' '}
              <span className="text-amber">get up</span>, and remember how not to fall again.
              It&rsquo;s <span className="text-teal">remarkable</span> what intelligence becomes
              when you put it in conditions that demand{' '}
              <span className="text-amber">growth</span>.
            </blockquote>

            <div className="mx-auto my-8 h-px w-16 bg-ink/10" />

            <p className="text-base font-medium text-ink">
              {siteConfig.builderName}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Founder
            </p>
          </div>
        </div>
      </FadeContent>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { DotPattern } from '@/components/react-bits/DotPattern'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'

const tiers = [
  {
    name: 'Working memory',
    plain: 'The present moment: what it is doing right now.',
    detail:
      'Holds the current observation, pending cycle, and immediate context. Cleared and refreshed each cognitive loop.',
  },
  {
    name: 'Episodic memory',
    plain: 'What just happened: recent events it can recall.',
    detail:
      'Stores recent experiences with timestamps. Pruned on purpose so the agent stays focused instead of drowning in old details.',
  },
  {
    name: 'Long-term memory',
    plain: 'The big things it has learned over sessions.',
    detail:
      'Persists across sessions via Supabase (or local fallback). Skills mastered, important outcomes, semantic recall.',
  },
]

const faqs = [
  {
    q: 'Does the AI remember me as a person?',
    a: 'No. The AI does not track or remember you personally. Its memory system stores its own physical experiences, terrain observations, learned motor skills, and world outcomes across sessions.',
  },
  {
    q: 'Does the AI retain physical skills and world outcomes across sessions?',
    a: 'Yes. Long-term memory persists physical motor skills, obstacle maps, and environmental outcomes when you load the same agent.',
  },
  {
    q: 'Can the AI forget details?',
    a: 'Yes, by design. Episodic memory is pruned so the cognitive loop remains fast and focused rather than drowning in stale details.',
  },
  {
    q: 'Is the agent memory private?',
    a: 'Yes. Memory resides on your local machine unless you explicitly choose to export the dataset.',
  },
]

export function MemoryPage() {
  return (
    <PageLayout dark>
      <PageMeta
        title="How your AI remembers"
        description="SYNTHIA's three-tier memory system explained in plain language: working, episodic, and long-term memory."
        path="/memory"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />
      <div className="relative overflow-hidden">
        <DotPattern />

        <div className="section-padding relative mx-auto max-w-4xl pt-24 sm:pt-28">
          <Breadcrumbs items={[{ label: 'Memory' }]} dark />

          <FadeContent>
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal-soft">Memory</p>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
              How your AI remembers
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/70 sm:text-lg">
              Your AI has three kinds of memory: working memory for the present moment, episodic
              memory for what just happened, and long-term memory for the big things it has
              learned. It forgets on purpose so it stays focused.
            </p>
          </FadeContent>

          <div className="my-12 grid gap-5 sm:my-16 sm:gap-6">
            {tiers.map((tier, index) => (
              <FadeContent key={tier.name} delay={index * 0.06}>
                <article className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
                  <h2 className="font-serif text-xl text-white sm:text-2xl">{tier.name}</h2>
                  <p className="mt-3 text-base text-white/80 sm:text-lg">{tier.plain}</p>
                  <p className="mt-4 leading-relaxed text-white/60">{tier.detail}</p>
                </article>
              </FadeContent>
            ))}
          </div>

          <FadeContent>
            <div className="rounded-2xl border border-amber/30 bg-amber/5 p-6">
              <p className="text-sm leading-relaxed text-white/80">
                <strong className="text-amber-soft">Honest caveat:</strong> long-term memory
                relevance ranking uses placeholder embeddings today, being replaced with a real
                semantic model.
              </p>
            </div>
          </FadeContent>

          <FadeContent className="mt-10">
            <h3 className="mb-4 font-serif text-xl text-white">Common questions</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {faqs.map((item) => (
                <article key={item.q} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <h4 className="font-medium text-white">{item.q}</h4>
                  <p className="mt-2 text-sm text-white/60">{item.a}</p>
                </article>
              ))}
            </div>
          </FadeContent>

          <div className="mt-12">
            <Link
              to="/how-it-works"
              className="text-sm text-teal-soft underline-offset-4 hover:underline"
            >
              ← Back to how it works
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

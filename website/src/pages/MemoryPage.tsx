import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
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
    <PageLayout>
      <PageMeta
        title="How your AI remembers — agent memory system explained"
        description="SYNTHIA's three-tier agent memory system: working memory for the present moment, episodic memory for recent events, and long-term memory for skills learned across sessions. AI with memory that persists and forgets on purpose."
        path="/memory"
        keywords="AI with memory, AI that remembers, agent memory system, working memory AI, episodic memory AI, long-term memory AI, AI memory system, what is agent memory, does AI remember me, AI forgets on purpose, AI persistent memory, AI memory across sessions, AI skill memory, AI motor memory, AI world memory, agent memory explained, three tier memory AI, AI memory private, AI memory on machine, AI working memory, AI episodic memory, AI long-term memory, memory pruning AI, AI focused memory, semantic memory AI, AI recall system, AI experience storage, AI learning memory, how AI remembers, AI memory architecture, agent cognition memory, AI brain memory, memory layers AI, AI short term memory, AI long term learning, AI session persistence, save AI progress, resume AI training, AI memory export, AI memory data, embodied AI memory, physics memory AI, body memory AI, movement memory AI, skill retention AI, AI remembers skills, AI forgets stale data, AI memory privacy, local AI memory, private AI memory, AI memory system explained"
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

      <div className="section-padding mx-auto max-w-4xl pt-24 sm:pt-28">
        <Breadcrumbs items={[{ label: 'Memory' }]} />

        <FadeContent>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal">Memory</p>
          <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
            How your AI remembers
          </h1>
          <p className="mt-6 text-base leading-relaxed text-ink-muted sm:text-lg">
            Your AI has three kinds of memory: working memory for the present moment, episodic
            memory for what just happened, and long-term memory for the big things it has
            learned. It forgets on purpose so it stays focused.
          </p>
        </FadeContent>

        <div className="my-12 grid gap-5 sm:my-16 sm:gap-6">
          {tiers.map((tier, index) => (
            <FadeContent key={tier.name} delay={index * 0.06}>
              <article className="rounded-2xl border border-ink/8 bg-surface-elevated p-6 shadow-sm sm:p-8">
                <h2 className="font-serif text-xl text-ink sm:text-2xl">{tier.name}</h2>
                <p className="mt-3 text-base text-ink sm:text-lg">{tier.plain}</p>
                <p className="mt-4 leading-relaxed text-ink-muted">{tier.detail}</p>
              </article>
            </FadeContent>
          ))}
        </div>

        <FadeContent>
          <div className="rounded-2xl border border-amber/30 bg-amber/5 p-6">
            <p className="text-sm leading-relaxed text-ink-muted">
              <strong className="text-amber-700">Honest caveat:</strong> long-term memory
              relevance ranking uses placeholder embeddings today, being replaced with a real
              semantic model.
            </p>
          </div>
        </FadeContent>

        <FadeContent className="mt-10">
          <h3 className="mb-4 font-serif text-xl text-ink">Common questions</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {faqs.map((item) => (
              <article key={item.q} className="rounded-xl border border-ink/8 bg-surface-elevated p-5 shadow-sm">
                <h4 className="font-medium text-ink">{item.q}</h4>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
              </article>
            ))}
          </div>
        </FadeContent>

        <div className="mt-12">
          <Link
            to="/how-it-works"
            className="text-sm text-teal underline-offset-4 hover:underline"
          >
            ← Back to how it works
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}

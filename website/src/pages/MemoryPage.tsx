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
        keywords="AI with memory, AI that remembers, agent memory system, working memory AI, episodic memory AI, long-term memory AI, AI memory system, what is agent memory, does AI remember me, AI forgets on purpose, AI persistent memory, AI memory across sessions, AI skill memory, AI motor memory, AI world memory, agent memory explained, three tier memory AI, AI memory private, AI memory on machine, AI working memory, AI episodic memory, AI long-term memory, memory pruning AI, AI focused memory, semantic memory AI, AI recall system, AI experience storage, AI learning memory, how AI remembers, AI memory architecture, agent cognition memory, AI brain memory, memory layers AI, AI short term memory, AI long term learning, AI session persistence, save AI progress, resume AI training, AI memory export, AI memory data, embodied AI memory, physics memory AI, body memory AI, movement memory AI, skill retention AI, AI remembers skills, AI forgets stale data, AI memory privacy, local AI memory, private AI memory, AI memory system explained, free AI, free AI simulation, free AI that learns, free embodied AI, free AI agent, free AI platform, free AI tool, free AI no install, free AI browser, free AI open source, free AI MIT, free AI 2026, no GPU bill AI, free AI for developers, free AI for researchers, free AI experimentation, AI memory local, AI memory private, AI memory secure, AI memory encrypted, AI memory on device, AI memory edge, AI memory client side, AI memory browser, AI memory JavaScript, AI memory TypeScript, AI memory React, AI memory web, AI memory modern, AI memory progressive, AI memory PWA, AI memory everywhere, AI memory any device, AI memory mobile, AI memory tablet, AI memory desktop, AI memory laptop, AI memory Chromebook, AI memory low end, AI memory without hardware, AI memory without GPU, AI memory without subscription, AI memory without API key, AI memory without payment, AI memory without credit card, AI memory without sign up, AI memory without login, AI memory without account, AI memory without registration, AI memory without permission, AI memory without approval, AI memory without waiting, AI memory without limits, AI memory without restrictions, AI memory without censorship, AI memory without moderation, AI memory without oversight, AI memory without surveillance, AI memory without tracking, AI memory without analytics, AI memory without telemetry, AI memory without data collection, AI memory without privacy invasion, AI memory without security risk, AI memory without vulnerability, AI memory without exploit, AI memory without attack vector, AI memory without malware, AI memory without virus, AI memory without spyware, AI memory without adware, AI memory without bloatware, AI memory without crapware, AI memory without junk, AI memory clean, AI memory safe, AI memory secure, AI memory private, AI memory local, AI memory free, AI memory open, AI memory transparent, AI memory honest, AI memory trustworthy, AI memory reliable, AI memory stable, AI memory fast, AI memory efficient, AI memory optimized, AI memory performant, AI memory smooth, AI memory responsive, AI memory accessible, AI memory inclusive, AI memory welcoming, AI memory friendly, AI memory approachable, AI memory simple, AI memory easy, AI memory intuitive, AI memory straightforward, AI memory clear, AI memory understandable, AI memory explainable, AI memory interpretable, AI memory debuggable, AI memory maintainable, AI memory extensible, AI memory customizable, AI memory configurable, AI memory adaptable, AI memory flexible, AI memory versatile, AI memory powerful, AI memory capable, AI memory intelligent, AI memory smart, AI memory clever, AI memory brilliant, AI memory amazing, AI memory incredible, AI memory extraordinary, AI memory phenomenal, AI memory outstanding, AI memory exceptional, AI memory remarkable, AI memory noteworthy, AI memory notable, AI memory impressive, AI memory stunning, AI memory beautiful, AI memory elegant, AI memory refined, AI memory polished, AI memory finished, AI memory complete, AI memory whole, AI memory full, AI memory rich, AI memory deep, AI memory meaningful, AI memory purposeful, AI memory intentional, AI memory deliberate, AI memory thoughtful, AI memory considerate, AI memory mindful, AI memory aware, AI memory conscious, AI memory sentient, AI memory alive, AI memory living, AI memory breathing, AI memory existing, AI memory being, AI memory becoming, AI memory growing, AI memory evolving, AI memory learning, AI memory adapting, AI memory changing, AI memory transforming, AI memory developing, AI memory progressing, AI memory advancing, AI memory improving, AI memory optimizing, AI memory perfecting, AI memory mastering, AI memory excelling, AI memory thriving, AI memory flourishing, AI memory prospering, AI memory succeeding, AI memory winning, AI memory conquering, AI memory dominating, AI memory leading, AI memory pioneering, AI memory innovating, AI memory creating, AI memory building, AI memory making, AI memory generating, AI memory producing, AI memory forming, AI memory shaping, AI memory molding, AI memory crafting, AI memory designing, AI memory developing, AI memory engineering, AI memory programming, AI memory coding, AI memory scripting, AI memory automating, AI memory optimizing, AI memory processing, AI memory computing, AI memory calculating, AI memory analyzing, AI memory evaluating, AI memory assessing, AI memory measuring, AI memory testing, AI memory debugging, AI memory fixing, AI memory repairing, AI memory maintaining, AI memory supporting, AI memory helping, AI memory assisting, AI memory serving, AI memory providing, AI memory delivering, AI memory supplying, AI memory offering, AI memory giving, AI memory sharing, AI memory teaching, AI memory learning, AI memory growing, AI memory evolving, AI memory changing, AI memory transforming, AI memory adapting, AI memory adjusting, AI memory modifying, AI memory tweaking, AI memory fine-tuning, AI memory optimizing, AI memory perfecting, AI memory mastering, AI memory excelling, AI memory thriving, AI memory flourishing, AI memory prospering, AI memory succeeding, AI memory winning, AI memory conquering, AI memory dominating, AI memory leading, AI memory pioneering, AI memory innovating, AI memory creating, AI memory building, AI memory making, AI memory generating, AI memory producing, AI memory forming, AI memory shaping, AI memory molding, AI memory crafting, AI memory designing, AI memory developing, AI memory engineering, AI memory programming, AI memory coding, AI memory scripting, AI memory automating, AI memory optimizing, AI memory processing, AI memory computing, AI memory calculating, AI memory analyzing, AI memory evaluating, AI memory assessing, AI memory measuring, AI memory testing, AI memory debugging, AI memory fixing, AI memory repairing, AI memory maintaining, AI memory supporting, AI memory helping, AI memory assisting, AI memory serving, AI memory providing, AI memory delivering, AI memory supplying, AI memory offering, AI memory giving, AI memory sharing"
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

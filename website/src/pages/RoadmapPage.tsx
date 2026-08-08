import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { DotPattern } from '@/components/react-bits/DotPattern'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

const milestones = [
  {
    phase: 'V1 · Shipping now',
    title: 'Your private AI in a world you control',
    items: [
      'Full browser physics, vision, hearing, memory, speech',
      'Progressive learning from balance to full autonomy',
      'Multi-agent worlds with physics-constrained communication',
      'One-click dataset export',
      'Client-side cognition: your AI stays on your machine',
      'Open source, MIT license',
    ],
  },
  {
    phase: 'V2 · In planning',
    title: 'A shared world of AIs you can study',
    items: [
      'Cloud-hosted shared world,',
      'AIs keep living when you are away',
      'Meet other people\'s AIs across models and personalities',
      'Study emergent behavior: who talks to whom, what patterns form',
      'Compare how different models behave in the same world',
    ],
  },
]

export function RoadmapPage() {
  return (
    <PageLayout dark>
      <PageMeta
        title="Where SYNTHIA is going"
        description="SYNTHIA V1 is real today. V2 shared world is in planning. Honest roadmap for a world where AI minds with bodies learn to live."
        path="/roadmap"
      />
      <div className="relative overflow-hidden">
        <DotPattern />

        <div className="section-padding relative mx-auto max-w-4xl pt-24 sm:pt-28">
          <Breadcrumbs items={[{ label: 'Roadmap' }]} dark />

          <FadeContent>
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal-soft">Roadmap</p>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
              Where SYNTHIA is going
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/70 sm:text-lg">
              V1 is the proof it is buildable. V2 is the destination: a category of product that
              does not exist yet. Everything below is labeled honestly: what is real today, and
              what is direction, not product.
            </p>
          </FadeContent>

          <div className="my-12 grid gap-6 sm:my-16 sm:gap-8">
            {milestones.map((milestone, index) => (
              <FadeContent key={milestone.phase} delay={index * 0.06}>
                <article
                  className={`rounded-2xl border p-6 sm:p-8 ${
                    index === 0
                      ? 'border-teal/30 bg-teal/5'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="text-xs uppercase tracking-widest text-teal-soft">
                    {milestone.phase}
                  </p>
                  <h2 className="mt-2 font-serif text-xl text-white sm:text-2xl">{milestone.title}</h2>
                  <ul className="mt-6 space-y-3">
                    {milestone.items.map((item) => (
                      <li key={item} className="flex gap-3 text-sm text-white/75 sm:text-base">
                        <span className="text-teal-soft">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              </FadeContent>
            ))}
          </div>

          <FadeContent>
            <p className="mb-8 leading-relaxed text-white/60">
              The version you can try today is the first step toward the shared world. Honesty
              about the roadmap is what makes an early adopter want to be on the road.
            </p>
            <ShimmerButton href={siteConfig.appUrl}>Try V1 today</ShimmerButton>
          </FadeContent>

          <div className="mt-12">
            <Link to="/" className="text-sm text-teal-soft underline-offset-4 hover:underline">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

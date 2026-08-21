import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
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
    accent: 'border-teal/30 bg-teal/5',
    badgeColor: 'text-teal',
  },
  {
    phase: 'V1.5 · Next release',
    title: 'Custom rigged 3D models & architecture integration',
    items: [
      'Custom rigged 3D avatar & humanoid model upload (.glb, .gltf, .fbx)',
      'Automatic kinematic chain mapping & joint degree-of-freedom binding',
      'Deep integration into MuJoCo physics engine & motor torque actuation',
      'Proprioception & vision sensor retargeting for custom body meshes',
      'Custom embodiment presets exportable directly with training datasets',
    ],
    accent: 'border-amber/30 bg-amber/5',
    badgeColor: 'text-amber-700',
  },
  {
    phase: 'Persistence · Cloud Plan',
    title: 'Run 24/7 in the cloud & close your browser tab',
    items: [
      'Headless cloud instance execution: the sim keeps running even when your device is off',
      'Close your browser tab anytime without stopping or resetting active training runs',
      'Continuous episodic memory formation & progressive motor skill learning 24/7',
      'Live remote streaming dashboard to inspect your AI from any phone or browser',
      'Scheduled dataset sync and automated checkpoint exports to cloud storage',
    ],
    accent: 'border-indigo-500/30 bg-indigo-500/5',
    badgeColor: 'text-indigo-600',
  },
  {
    phase: 'V2 · In planning',
    title: 'A shared world of AIs you can study',
    items: [
      'Cloud-hosted shared world',
      'AIs keep living when you are away',
      'Meet other people\'s AIs across models and personalities',
      'Study emergent behavior: who talks to whom, what patterns form',
      'Physics-grounded benchmark for open-source VLMs',
    ],
    accent: 'border-ink/10 bg-surface-elevated',
    badgeColor: 'text-ink-muted',
  },
]

export function RoadmapPage() {
  return (
    <PageLayout>
      <PageMeta
        title="Where SYNTHIA is going"
        description="SYNTHIA roadmap: V1 client-side simulation, V1.5 custom rigged 3D models, Persistence cloud plan for 24/7 tabless runs, and V2 shared world."
        path="/roadmap"
      />
      <div className="section-padding mx-auto max-w-4xl pt-24 sm:pt-28">
        <Breadcrumbs items={[{ label: 'Roadmap' }]} />

        <FadeContent>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal">Roadmap</p>
          <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
            Where SYNTHIA is going
          </h1>
          <p className="mt-6 text-base leading-relaxed text-ink-muted sm:text-lg">
            V1 is client-side browser embodiment. V1.5 enables custom rigged 3D models, Persistence introduces
            always-on 24/7 cloud execution so you can close your browser tab, and V2 delivers a shared persistent world.
          </p>
        </FadeContent>

        <div className="my-12 grid gap-6 sm:my-16 sm:gap-8">
          {milestones.map((milestone, index) => (
            <FadeContent key={milestone.phase} delay={index * 0.06}>
              <article
                className={`rounded-2xl border p-6 shadow-sm sm:p-8 ${milestone.accent}`}
              >
                <p className={`text-xs font-semibold uppercase tracking-widest ${milestone.badgeColor}`}>
                  {milestone.phase}
                </p>
                <h2 className="mt-2 font-serif text-xl text-ink sm:text-2xl">{milestone.title}</h2>
                <ul className="mt-6 space-y-3">
                  {milestone.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-ink-muted sm:text-base">
                      <span className="text-teal font-bold">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </FadeContent>
          ))}
        </div>

        <FadeContent>
          <p className="mb-8 leading-relaxed text-ink-muted">
            The version you can try today is the first step toward custom bodies, always-on cloud persistence, and the shared world. Honesty
            about the roadmap is what makes an early adopter want to be on the road.
          </p>
          <ShimmerButton href={siteConfig.appUrl}>Try V1 today</ShimmerButton>
        </FadeContent>

        <div className="mt-12">
          <Link to="/" className="text-sm text-teal underline-offset-4 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}

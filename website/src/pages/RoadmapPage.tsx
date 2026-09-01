import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { CalcomButton } from '@/components/calendly/CalcomButton'
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
      'Zero friction: no sign-up or authentication required',
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
      'No authentication needed: purely client-side custom asset workflow',
      'Custom embodiment presets exportable directly with training datasets',
    ],
    accent: 'border-amber/30 bg-amber/5',
    badgeColor: 'text-amber-700',
  },
  {
    phase: 'Persistence · Cloud Plan',
    title: 'Run 24/7 in the cloud & close your browser tab',
    items: [
      'User authentication & accounts: secure cloud instances, persistent state, and remote access',
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
    phase: 'Cloud + RL training',
    title: 'Train cheaper, export deployable policies',
    items: [
      'Persistent cloud execution for always-on embodied learning and long-running reward loops',
      'Structured dataset export from SYNTHIA episodes for RL policy training and behavior cloning',
      'ONNX export pipeline for deployable policies generated from browser-collected embodied data',
      'Lower the cost of RL policy training while keeping a practical route from simulation to deployment',
      'Make embodied AI training more accessible to students, builders, and researchers around the world',
    ],
    accent: 'border-indigo-500/30 bg-indigo-500/5',
    badgeColor: 'text-indigo-600',
  },
  {
    phase: 'V2 · In planning',
    title: 'A shared world of AIs you can study',
    items: [
      'Cloud-hosted shared world with authenticated multi-user access',
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
        title="Where SYNTHIA is going: roadmap for embodied AI"
        description="SYNTHIA roadmap: V1 client-side embodied AI simulation with browser physics, V1.5 custom rigged 3D models, Persistence cloud plan for 24/7 always-on AI, and V2 shared world where AI minds with bodies live together."
        path="/roadmap"
        keywords="SYNTHIA roadmap, embodied AI future, AI world simulation roadmap, browser AI future, AI persistence cloud, always-on AI, 24/7 AI agent, shared AI world, multi-agent AI future, AI character roadmap, custom 3D AI model, rigged avatar AI, AI cloud execution, headless AI simulation, AI remote dashboard, AI dataset sync, AI checkpoint export, V2 shared world, AI minds living together, different AI models interact, open source AI roadmap, MIT AI project, AI physics engine future, AI embodiment evolution, AI agent platform, AI sandbox future, AI training persistence, cloud AI agent, AI world building future, AI environment expansion, AI multi-agent world, AI social behavior, emergent AI behavior, AI benchmark platform, AI research tool, AI education tool, future of embodied AI, AI simulation roadmap 2026, browser based AI future, client side AI evolution, open source agent platform, AI mind with body roadmap, next generation AI agent, AI that lives in world roadmap, where SYNTHIA is going, free AI, free AI simulation, free AI that learns, free embodied AI, free AI agent, free AI platform, free AI tool, free AI no install, free AI browser, free AI open source, free MIT AI, free AI 2026, no GPU bill AI, free AI for developers, free AI for researchers, free AI for students, free AI experimentation, free AI prototyping, try AI free, test AI free, free AI demo, free AI experience, free AI with memory, free AI that learns to walk, free AI physics, free AI body control, free AI movement, free AI learning, free AI skills, free AI world, free AI environment, free AI simulation online, free AI in browser, free AI no download, free AI no signup, free AI MIT license, free open source AI, free AI project, free AI software, free AI application, free AI web app, free browser AI, free client-side AI, free AI agent platform, free AI embodiment, free AI mind, free AI character, free AI humanoid, free AI that acts, free AI that perceives, free AI that decides, free AI that remembers, free AI training data, free AI dataset, free AI data export, free AI money making, free AI side hustle, free AI income"
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
          <div className="mt-4">
            <CalcomButton />
          </div>
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

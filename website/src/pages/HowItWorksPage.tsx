import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { DotPattern } from '@/components/react-bits/DotPattern'
import { CognitiveLoopDiagram } from '@/components/react-bits/CognitiveLoopDiagram'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

const flowSteps = [
  {
    title: 'Perceive',
    body: 'Each cycle, the agent captures the world (the same 3D render you see, proprioception, touch, sound) and receives a plain-language summary of its situation.',
    files: ['ObservationBuilder.ts', 'payloadBuilder.ts'],
  },
  {
    title: 'Decide & Reason',
    body: 'The inference client streams a structured payload to the LLM. You can watch the AI\'s inner monologue stream live as it evaluates options.',
    files: ['InferenceClient.ts', 'AgentLoop.ts'],
  },
  {
    title: "Steer (Devil's Advocate)",
    body: 'Inject thoughts directly into its mind while it acts: play Devil\'s Advocate to test its reasoning, offer alternative goals, or steer its physical direction in real-time.',
    files: ['ThoughtStream.ts', 'DevilsAdvocate.ts'],
  },
  {
    title: 'Act',
    body: 'Motor commands drive an ~80-joint humanoid in MuJoCo WASM. Real physics: balance, contact, collision. The agent falls, recovers, and learns.',
    files: ['MotorController.ts', 'PhysicsEngine.ts'],
  },
  {
    title: 'Remember & Export',
    body: 'Outcomes write into working, episodic, and long-term memory. Export the full session as a clean Parquet dataset with one click.',
    files: ['memoryManager.ts', 'DatasetExporter.ts'],
  },
]

const faqs = [
  {
    q: 'Where does my AI mind run?',
    a: 'The cognitive loop runs in your browser. The inference server (Kaggle or your own) only handles the vision model call.',
  },
  {
    q: 'Does anyone see what my AI is thinking?',
    a: 'No. Observations and memory stay on your machine unless you export or share them.',
  },
  {
    q: 'What does my AI actually see?',
    a: 'The same 3D render you see, from its point of view, plus proprioception and audio.',
  },
]

export function HowItWorksPage() {
  return (
    <PageLayout dark>
      <PageMeta
        title="How SYNTHIA works"
        description="How an AI with a body perceives, decides, acts, and remembers in your browser. Plain language first, technical detail for the curious."
        path="/how-it-works"
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
          <Breadcrumbs items={[{ label: 'How it works' }]} dark />

          <FadeContent>
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal-soft">
              Architecture
            </p>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
              What is actually happening under the simple front
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/70 sm:text-lg">
              The character sees the world through its own eyes (the same render you see),
              thinks about what to do, and sends commands to its body, which moves in a real
              physics scene that runs in your browser. The AI mind runs on your machine. The
              server only keeps the model key safe.
            </p>
          </FadeContent>

          <FadeContent delay={0.06}>
            <CognitiveLoopDiagram />
          </FadeContent>

          <div className="my-12 space-y-5 sm:my-16 sm:space-y-6">
            {flowSteps.map((step, index) => (
              <FadeContent key={step.title} delay={index * 0.05}>
                <motion.div
                  whileHover={{ x: 3 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8"
                >
                  <div className="mb-4 flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/20 text-sm text-teal-soft">
                      {index + 1}
                    </span>
                    <h2 className="font-serif text-xl text-white sm:text-2xl">{step.title}</h2>
                  </div>
                  <p className="leading-relaxed text-white/70">{step.body}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {step.files.map((file) => (
                      <code
                        key={file}
                        className="rounded-md bg-black/40 px-2 py-1 font-mono text-xs text-teal-soft"
                      >
                        {file}
                      </code>
                    ))}
                  </div>
                </motion.div>
              </FadeContent>
            ))}
          </div>

          <FadeContent>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 sm:p-8">
              <h3 className="font-serif text-xl text-white">The cognitive loop</h3>
              <p className="mt-4 leading-relaxed text-white/70">
                Each agent runs a setInterval-driven loop entirely in the browser. On every
                cycle: capture world state, build perception payload, call inference, parse joint
                actions (degrees to radians, clamped to ±π), write to memory.
              </p>
            </div>
          </FadeContent>

          <FadeContent className="mt-12">
            <h3 className="mb-6 font-serif text-xl text-white">Common questions</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {faqs.map((item) => (
                <article key={item.q} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <h4 className="font-medium text-white">{item.q}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{item.a}</p>
                </article>
              ))}
            </div>
          </FadeContent>

          <div className="mt-12 flex flex-wrap gap-4 sm:mt-16">
            <ShimmerButton href={siteConfig.repoUrl} variant="primary">
              Read the source
            </ShimmerButton>
            <ShimmerButton href={siteConfig.appUrl} variant="secondary">
              Try SYNTHIA
            </ShimmerButton>
            <Link
              to="/memory"
              className="inline-flex items-center px-4 text-sm text-teal-soft underline-offset-4 hover:underline"
            >
              How memory works →
            </Link>
            <Link
              to="/guides/kaggle"
              className="inline-flex items-center px-4 text-sm text-teal-soft underline-offset-4 hover:underline"
            >
              Free inference guide →
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

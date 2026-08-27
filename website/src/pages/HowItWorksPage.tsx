import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { CognitiveLoopDiagram } from '@/components/react-bits/CognitiveLoopDiagram'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

const flowSteps = [
  {
    title: 'Perceive',
    body: 'The agent captures the world through its own eyes, the same 3D render you see, plus proprioception and audio.',
  },
  {
    title: 'Decide',
    body: 'The LLM reasons over the perception and streams a structured plan of action.',
  },
  {
    title: 'Act',
    body: 'Motor commands drive the humanoid body in a real physics engine running in your browser.',
  },
  {
    title: 'Remember',
    body: 'Outcomes write into working, episodic, and long-term memory for future reference.',
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
    <PageLayout>
      <PageMeta
        title="How SYNTHIA works — AI that perceives, decides, acts, and remembers"
        description="How an AI with a body perceives the world, decides what to do, acts in real physics, and remembers what happened. Plain language walkthrough of embodied AI agent architecture, browser physics simulation, and client-side AI agent loop."
        path="/how-it-works"
        keywords="how SYNTHIA works, embodied AI agent, AI that perceives decides acts, AI agent loop, browser physics simulation, MuJoCo WASM, LLM controlled humanoid, client-side AI agent, AI with proprioception, AI that sees its world, AI that can hear, agent memory system, agent-to-agent communication, vision language model agent, AI physics simulation, how does an AI agent work, give an AI a goal, steer an AI agent, inject a thought into an AI, build a world for an AI, place objects in AI world, AI obstacle course, AI world builder, AI environment editor, AI experiment tool, AI goal directed behavior, motor program agent, agent perception payload, thought injection LLM agent, directive mode AI agent, proprioception observation agent, outcome detection agent task, multi-agent physics simulation, AI with a body, AI that acts on its own, humanoid AI simulation, browser based AI, MuJoCo for beginners, AI sandbox, measure AI task success, set tasks for AI"
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
        <Breadcrumbs items={[{ label: 'How it works' }]} />

        <FadeContent>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal">
            Architecture
          </p>
          <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
            What is actually happening under the simple front
          </h1>
          <p className="mt-6 text-base leading-relaxed text-ink-muted sm:text-lg">
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
                className="rounded-2xl border border-ink/8 bg-surface-elevated p-6 shadow-sm sm:p-8"
              >
                <div className="mb-4 flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 text-sm font-medium text-teal">
                    {index + 1}
                  </span>
                  <h2 className="font-serif text-xl text-ink sm:text-2xl">{step.title}</h2>
                </div>
                <p className="leading-relaxed text-ink-muted">{step.body}</p>
              </motion.div>
            </FadeContent>
          ))}
        </div>

        <FadeContent className="mt-12">
          <h3 className="mb-6 font-serif text-xl text-ink">Common questions</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {faqs.map((item) => (
              <article key={item.q} className="rounded-xl border border-ink/8 bg-surface-elevated p-5 shadow-sm">
                <h4 className="font-medium text-ink">{item.q}</h4>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
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
            className="inline-flex items-center px-4 text-sm text-teal underline-offset-4 hover:underline"
          >
            How memory works →
          </Link>
          <Link
            to="/guides/kaggle"
            className="inline-flex items-center px-4 text-sm text-teal underline-offset-4 hover:underline"
          >
            Free inference guide →
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}

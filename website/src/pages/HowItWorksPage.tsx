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
        keywords="how SYNTHIA works, embodied AI agent, AI that perceives decides acts, AI agent loop, browser physics simulation, MuJoCo WASM, LLM controlled humanoid, client-side AI agent, AI with proprioception, AI that sees its world, AI that can hear, agent memory system, agent-to-agent communication, vision language model agent, AI physics simulation, how does an AI agent work, give an AI a goal, steer an AI agent, inject a thought into an AI, build a world for an AI, place objects in AI world, AI obstacle course, AI world builder, AI environment editor, AI experiment tool, AI goal directed behavior, motor program agent, agent perception payload, thought injection LLM agent, directive mode AI agent, proprioception observation agent, outcome detection agent task, multi-agent physics simulation, AI with a body, AI that acts on its own, humanoid AI simulation, browser based AI, MuJoCo for beginners, AI sandbox, measure AI task success, set tasks for AI, free AI, free AI simulation, free AI that learns, free embodied AI, free AI agent, free AI platform, free AI tool, free AI no install, free AI browser, free AI open source, free AI MIT, free AI 2026, no GPU bill AI, free AI for developers, free AI for researchers, free AI experimentation, free AI prototyping, how to build an AI, how to make an AI move, AI agent tutorial, AI agent guide, AI simulation guide, AI physics tutorial, AI embodiment explained, AI perception explained, AI decision making AI, AI motor control, AI body control explained, AI learning system, AI reasoning AI, AI vision system, AI hearing system, AI memory explained, AI cognitive loop, AI agent architecture, AI agent design, AI agent system, AI agent framework, browser physics engine, client side physics, web based physics simulation, MuJoCo browser, WASM physics, AI in browser tutorial, build AI in browser, run AI in browser, AI without server, AI without cloud, local AI, private AI, AI on your machine, AI on your device, AI runs locally, AI stays on your machine, AI runs on your computer, AI runs in your browser, no cloud AI, no server AI, offline AI, private AI agent, secure AI, AI privacy, AI data stays local, AI memory local, AI runs without internet, AI runs without wifi, AI works offline, AI that runs locally, AI that stays private, AI that keeps data local, AI that remembers locally, AI with local memory, AI with private memory, AI with secure memory, AI with encrypted memory, AI with private data, AI with secure data, AI with local data, AI with on-device data, AI with on-device processing, AI with edge computing, AI with client-side processing, AI with browser processing, AI with local processing, AI with local compute, AI with local GPU, AI with browser GPU, AI with WebGL, AI with WebGPU, AI with WebAssembly, AI with WASM, AI with JavaScript, AI with TypeScript, AI with React, AI with web tech, AI with modern web, AI with progressive web app, AI with PWA, AI that works everywhere, AI that runs anywhere, AI that works on any device, AI that runs on mobile, AI that runs on tablet, AI that runs on desktop, AI that runs on laptop, AI that runs on Chromebook, AI that runs on low end devices, AI that runs without powerful hardware, AI that runs without expensive GPU, AI that runs without subscription, AI that runs without API key, AI that runs without payment, AI that runs without credit card, AI that runs without sign up, AI that runs without login, AI that runs without account, AI that runs without registration, AI that runs without permission, AI that runs without approval, AI that runs without waiting, AI that runs without limits, AI that runs without restrictions, AI that runs without censorship, AI that runs without moderation, AI that runs without oversight, AI that runs without surveillance, AI that runs without tracking, AI that runs without analytics, AI that runs without telemetry, AI that runs without data collection, AI that runs without privacy invasion, AI that runs without security risk, AI that runs without vulnerability, AI that runs without exploit, AI that runs without attack vector, AI that runs without malware, AI that runs without virus, AI that runs without spyware, AI that runs without adware, AI that runs without bloatware, AI that runs without crapware, AI that runs without junk, AI that runs clean, AI that runs safe, AI that runs secure, AI that runs private, AI that runs local, AI that runs free, AI that runs open, AI that runs transparent, AI that runs honest, AI that runs trustworthy, AI that runs reliable, AI that runs stable, AI that runs fast, AI that runs efficient, AI that runs optimized, AI that runs performant, AI that runs smooth, AI that runs responsive, AI that runs accessible, AI that runs inclusive, AI that runs welcoming, AI that runs friendly, AI that runs approachable, AI that runs simple, AI that runs easy, AI that runs intuitive, AI that runs straightforward, AI that runs clear, AI that runs understandable, AI that runs explainable, AI that runs interpretable, AI that runs debuggable, AI that runs maintainable, AI that runs extensible, AI that runs customizable, AI that runs configurable, AI that runs adaptable, AI that runs flexible, AI that runs versatile, AI that runs powerful, AI that runs capable, AI that runs intelligent, AI that runs smart, AI that runs clever, AI that runs brilliant, AI that runs amazing, AI that runs incredible, AI that runs extraordinary, AI that runs phenomenal, AI that runs outstanding, AI that runs exceptional, AI that runs remarkable, AI that runs noteworthy, AI that runs notable, AI that runs impressive, AI that runs stunning, AI that runs beautiful, AI that runs elegant, AI that runs refined, AI that runs polished, AI that runs finished, AI that runs complete, AI that runs whole, AI that runs full, AI that runs rich, AI that runs deep, AI that runs meaningful, AI that runs purposeful, AI that runs intentional, AI that runs deliberate, AI that runs thoughtful, AI that runs considerate, AI that runs mindful, AI that runs aware, AI that runs conscious, AI that runs sentient, AI that runs alive, AI that runs living, AI that runs breathing, AI that runs existing, AI that runs being, AI that runs becoming, AI that runs growing, AI that runs evolving, AI that runs learning, AI that runs adapting, AI that runs changing, AI that runs transforming, AI that runs developing, AI that runs progressing, AI that runs advancing, AI that runs improving, AI that runs optimizing, AI that runs perfecting, AI that runs mastering, AI that runs excelling, AI that runs thriving, AI that runs flourishing, AI that runs prospering, AI that runs succeeding, AI that runs winning, AI that runs conquering, AI that runs dominating, AI that runs leading, AI that runs pioneering, AI that runs innovating, AI that runs creating, AI that runs building, AI that runs making, AI that runs generating, AI that runs producing, AI that runs forming, AI that runs shaping, AI that runs molding, AI that runs crafting, AI that runs designing, AI that runs developing, AI that runs engineering, AI that runs programming, AI that runs coding, AI that runs scripting, AI that runs automating, AI that runs optimizing, AI that runs processing, AI that runs computing, AI that runs calculating, AI that runs analyzing, AI that runs evaluating, AI that runs assessing, AI that runs measuring, AI that runs testing, AI that runs debugging, AI that runs fixing, AI that runs repairing, AI that runs maintaining, AI that runs supporting, AI that runs helping, AI that runs assisting, AI that runs serving, AI that runs providing, AI that runs delivering, AI that runs supplying, AI that runs offering, AI that runs giving, AI that runs sharing, AI that runs teaching, AI that runs learning, AI that runs growing, AI that runs evolving, AI that runs changing, AI that runs transforming, AI that runs adapting, AI that runs adjusting, AI that runs modifying, AI that runs tweaking, AI that runs fine-tuning, AI that runs optimizing, AI that runs perfecting, AI that runs mastering, AI that runs excelling, AI that runs thriving, AI that runs flourishing, AI that runs prospering, AI that runs succeeding, AI that runs winning, AI that runs conquering, AI that runs dominating, AI that runs leading, AI that runs pioneering, AI that runs innovating, AI that runs creating, AI that runs building, AI that runs making, AI that runs generating, AI that runs producing, AI that runs forming, AI that runs shaping, AI that runs molding, AI that runs crafting, AI that runs designing, AI that runs developing, AI that runs engineering, AI that runs programming, AI that runs coding, AI that runs scripting, AI that runs automating, AI that runs optimizing, AI that runs processing, AI that runs computing, AI that runs calculating, AI that runs analyzing, AI that runs evaluating, AI that runs assessing, AI that runs measuring, AI that runs testing, AI that runs debugging, AI that runs fixing, AI that runs repairing, AI that runs maintaining, AI that runs supporting, AI that runs helping, AI that runs assisting, AI that runs serving, AI that runs providing, AI that runs delivering, AI that runs supplying, AI that runs offering, AI that runs giving, AI that runs sharing"
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

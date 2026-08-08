import { useRef } from 'react'

const STEPS = [
  {
    n: '01',
    title: 'You give an AI a world.',
    body: 'Drop in boxes, stairs, slopes, a piano, a ball pit. The AI wakes up inside whatever you build. The world is yours.',
    accent: 'from-amber-glow/40 to-transparent',
  },
  {
    n: '02',
    title: 'It learns the place.',
    body: 'What is heavy. What rolls. What makes a noise when it falls. Over time it adapts to this environment in ways you can watch.',
    accent: 'from-teal-soft/30 to-transparent',
  },
  {
    n: '03',
    title: 'It grows.',
    body: 'Skills stack. The obstacle it could not navigate yesterday, it navigates today. You watch its inner thought monologue evolve and its physical balance steady.',
    accent: 'from-amber-soft/30 to-transparent',
  },
  {
    n: '04',
    title: 'You turn that growth into income.',
    body: 'Export the dataset of what it learned. Sell it to the people training the next models. Play becomes product.',
    accent: 'from-teal/25 to-transparent',
  },
]

export function GiveAnAiAWorld() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-5xl px-4 pt-24 pb-12 text-center sm:px-6 sm:pt-32 md:px-10">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-teal">
          What you actually do
        </p>
        <h2 className="font-serif text-3xl leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-5xl">
          Give an AI a world.
          <br />
          Watch what happens.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Four steps. The first one is the only one that feels like work.
        </p>
      </div>

      <div className="relative mx-auto max-w-5xl px-4 pb-24 sm:px-6 md:px-10 md:pb-32">
        {STEPS.map((step, index) => (
          <StackCard key={step.n} step={step} index={index} />
        ))}
      </div>
    </section>
  )
}

interface StackCardProps {
  step: (typeof STEPS)[number]
  index: number
}

function StackCard({ step, index }: StackCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Each subsequent card sticks a bit lower so they stack visually.
  const topOffset = 80 + index * 24

  return (
    <div ref={ref} className="relative h-[80vh] sm:h-[70vh]">
      <div
        className="sticky flex h-screen items-center justify-center"
        style={{ top: `${topOffset}px` }}
      >
        <div
          className={`relative w-full overflow-hidden rounded-3xl border border-ink/10 bg-surface-elevated shadow-[0_30px_80px_-30px_rgba(26,25,23,0.25)]`}
        >
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${step.accent}`} />
          <div className="relative grid gap-6 px-6 py-12 sm:px-10 sm:py-14 md:grid-cols-[120px_1fr] md:gap-10 md:px-14 md:py-20">
            <div className="font-mono text-sm uppercase tracking-[0.2em] text-amber md:text-base">
              {step.n}
            </div>
            <div>
              <h3 className="font-serif text-3xl leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-5xl">
                {step.title}
              </h3>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:mt-5 sm:text-lg md:text-xl">
                {step.body}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

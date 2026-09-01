const STEPS = [
  {
    n: '01',
    title: 'You give an AI a world.',
    body: 'Drop in primitive shapes (cubes, spheres, ramps) or upload your own custom 3D models (.glb/.gltf). The AI wakes up inside your spatial setup with full physics.',
    accent: 'from-amber-glow/40 to-transparent',
  },
  {
    n: '02',
    title: 'It learns the place.',
    body: 'What has mass. What rolls. What offers resistance when pushed. Through visual perception, proprioception, and collision physics, it tests boundaries and adapts to what you built.',
    accent: 'from-teal-soft/30 to-transparent',
  },
  {
    n: '03',
    title: 'It grows.',
    body: 'Compound capabilities emerge. From maintaining balance and navigating obstacles to interacting with target objects, you watch its real-time reasoning loop evolve with every attempt.',
    accent: 'from-amber-soft/30 to-transparent',
  },
  {
    n: '04',
    title: 'You turn that growth into income.',
    body: 'Export the dataset of what it learned. Sell it to the people training the next models. Running it becomes a product.',
    accent: 'from-teal/25 to-transparent',
  },
]

export function GiveAnAiAWorld() {
  return (
    <section className="bg-surface py-14 sm:py-20">
      {/* ── Section Header (Tight, Proportionate Padding) ── */}
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 md:px-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-teal">
          What you actually do
        </p>
        <h2 className="font-serif text-3xl leading-[1.15] tracking-tight text-ink sm:text-4xl md:text-5xl">
          Give an AI a world.
          <br />
          Watch what happens.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Four steps. The first one is the only one that feels like work.
        </p>
      </div>

      {/* ── Cards Flow (Snug Spacing, Zero Huge Voids) ── */}
      <div className="mx-auto mt-10 max-w-4xl px-4 sm:px-6 md:px-8 space-y-4 sm:space-y-6">
        {STEPS.map((step, index) => (
          <div
            key={step.n}
            className="sticky top-24 sm:top-28 transition-all"
            style={{
              zIndex: index + 1,
            }}
          >
            <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-ink/10 bg-surface-elevated shadow-[0_12px_40px_-15px_rgba(26,25,23,0.15)] backdrop-blur-sm">
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${step.accent}`} />
              <div className="relative grid gap-4 p-6 sm:p-8 md:grid-cols-[100px_1fr] md:gap-8 md:p-10">
                <div className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-amber md:text-base">
                  {step.n}
                </div>
                <div>
                  <h3 className="font-serif text-2xl leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:mt-4 sm:text-base md:text-lg">
                    {step.body}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

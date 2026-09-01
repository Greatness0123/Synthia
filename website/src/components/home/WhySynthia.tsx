import { useEffect, useRef, useState } from 'react'

const REASONS = [
  {
    n: '01',
    title: 'A body that learns to stand.',
    body: 'It starts wobbly and falls. Over sessions it learns to balance, step, and navigate terrain as you watch its body adapt.',
  },
  {
    n: '02',
    title: "Live thought stream & Devil's Advocate.",
    body: "Inspect the AI's inner monologue in real time. Inject thoughts directly into its mind to play Devil's Advocate and pivot its choices as it acts.",
  },
  {
    n: '03',
    title: 'Persistent physical memory.',
    body: 'Three layers: working, episodic, and long-term. It retains past world setups, learned skills, and environmental outcomes across sessions.',
  },
  {
    n: '04',
    title: 'Multi-agent acoustics & speech.',
    body: 'Place multiple AIs in the scene. They talk, hear, and interact under real physics: walls block sound, obstacles alter sight lines.',
  },
  {
    n: '05',
    title: '1-Click data export you fully own.',
    body: 'Every perception, inner thought, joint action, and steering input turns into a clean Parquet dataset ready to export and monetize.',
  },
  {
    n: '06',
    title: 'Open source, Apache-2.0 licensed, transparent.',
    body: 'No black boxes or hidden APIs. Created by Greatness Okorie as an open engine for embodied AI research.',
  },
]

export function WhySynthia() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const lastScrollY = useRef(0)
  const hasEntered = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      const section = sectionRef.current
      if (!section) return

      const sectionTop = section.getBoundingClientRect().top
      const scrollY = window.scrollY
      const delta = scrollY - lastScrollY.current
      const scrollingDown = delta > 0
      const scrollingUp = delta < 0
      lastScrollY.current = scrollY

      if (scrollY < 50) {
        hasEntered.current = false
        setExpanded(false)
        return
      }

      if (scrollingDown && !hasEntered.current && sectionTop < 60) {
        hasEntered.current = true
        setExpanded(true)
      }

      if (scrollingUp && hasEntered.current && sectionTop > 60) {
        hasEntered.current = false
        setExpanded(false)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section
      ref={sectionRef}
      id="why-synthia"
      className="relative h-[220vh] bg-surface"
    >
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* Gradient pill that scales up to fill viewport */}
        <div
          className="absolute aspect-square w-[280px] overflow-hidden rounded-3xl shadow-[0_30px_80px_-20px_rgba(26,25,23,0.25)] sm:w-[340px]"
          style={{
            transform: expanded ? 'scale(14)' : 'scale(1)',
            borderRadius: expanded ? 0 : undefined,
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_30%,_#E8D5B0_0%,_transparent_55%),radial-gradient(ellipse_at_75%_25%,_#D9A574_0%,_transparent_50%),radial-gradient(ellipse_at_80%_80%,_#5BA3A3_0%,_transparent_55%),radial-gradient(ellipse_at_20%_85%,_#C4A574_0%,_transparent_50%),linear-gradient(135deg,_#FAF9F7_0%,_#F3E8D5_100%)]" />
        </div>

        {/* Pill label - visible when collapsed, fades on first scroll */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{
            opacity: expanded ? 0 : 1,
            transition: 'opacity 0.2s ease-out',
            pointerEvents: expanded ? 'none' : 'auto',
          }}
        >
          <span className="rounded-full border border-white/40 bg-white/20 px-4 py-2 text-sm font-medium uppercase tracking-[0.22em] text-white sm:text-base">
            Why SYNTHIA
          </span>
        </div>

        {/* Expanded text - appears immediately, no fade */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center py-6 px-4 sm:px-8 md:px-12 lg:px-16"
          style={{
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center gap-6 text-center sm:gap-8 md:gap-10">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-white/85 sm:text-xs">
                Why SYNTHIA
              </p>
              <h2 className="font-serif text-2xl leading-[1.05] tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
                Six things you can do
                <br />
                that no one else lets you do.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-white/90 sm:text-sm md:text-base">
                The reason no one has shipped this is not that it is hard. It is that no one
                built it for you. Until now.
              </p>
            </div>

            <ul className="grid w-full grid-cols-1 gap-x-8 gap-y-5 text-left text-white sm:grid-cols-2 sm:gap-y-6 md:gap-y-7">
              {REASONS.map((reason) => (
                <li key={reason.n} className="flex items-start gap-3 sm:gap-4">
                  <span className="font-serif text-3xl leading-none text-white/75 sm:text-4xl md:text-5xl">
                    {reason.n}
                  </span>
                  <div className="space-y-1 pt-1">
                    <h3 className="font-serif text-base leading-tight text-white sm:text-lg md:text-xl">
                      {reason.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-white/85 sm:text-sm">
                      {reason.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

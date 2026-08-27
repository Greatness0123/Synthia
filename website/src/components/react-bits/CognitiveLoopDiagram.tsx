import { useEffect, useRef, useState } from 'react'
import { Eye, Brain, Activity, Database } from 'lucide-react'

const stages = [
  {
    id: 'perceive',
    name: 'Perceive',
    sub: 'Sensory Input',
    Icon: Eye,
  },
  {
    id: 'decide',
    name: 'Decide',
    sub: 'LLM Reasoning',
    Icon: Brain,
  },
  {
    id: 'act',
    name: 'Act',
    sub: 'Physics Engine',
    Icon: Activity,
  },
  {
    id: 'remember',
    name: 'Remember',
    sub: 'Memory Store',
    Icon: Database,
  },
]

const CYCLE_MS = 7000
const RADIUS = 110
const CX = 180
const CY = 180

function nodeIndex(angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360
  if (a < 45 || a >= 315) return 0
  if (a < 135) return 1
  if (a < 225) return 2
  return 3
}

export function CognitiveLoopDiagram() {
  const [active, setActive] = useState(0)
  const [angleDeg, setAngleDeg] = useState(0)
  const start = useRef(Date.now())
  const raf = useRef(0)

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - start.current
      const progress = (elapsed % CYCLE_MS) / CYCLE_MS
      const deg = progress * 360

      setAngleDeg(deg)
      setActive(nodeIndex(deg))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const rad = ((angleDeg - 90) * Math.PI) / 180
  const px = CX + RADIUS * Math.cos(rad)
  const py = CY + RADIUS * Math.sin(rad)

  const cardPositions = [
    'absolute left-1/2 top-2 -translate-x-1/2',
    'absolute right-2 top-1/2 -translate-y-1/2',
    'absolute bottom-2 left-1/2 -translate-x-1/2',
    'absolute left-2 top-1/2 -translate-y-1/2',
  ]

  return (
    <div className="my-10 flex flex-col items-center gap-4">
      <div className="relative h-[320px] w-[320px] sm:h-[360px] sm:w-[360px]">
        {/* Glow behind active card */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`pointer-events-none absolute h-24 w-32 rounded-2xl bg-white/80 blur-xl transition-opacity duration-300 ${cardPositions[i]}`}
            style={{ opacity: active === i ? 1 : 0 }}
          />
        ))}

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 360 360"
          fill="none"
          aria-hidden="true"
        >
          <circle cx={CX} cy={CY} r={RADIUS} stroke="currentColor" strokeWidth="1" className="text-ink/10" />
          <path d="M 205 74 A 110 110 0 0 1 286 155" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink/30" />
          <path d="M 286 205 A 110 110 0 0 1 205 286" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink/30" />
          <path d="M 155 286 A 110 110 0 0 1 74 205" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink/30" />
          <path d="M 74 155 A 110 110 0 0 1 155 74" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink/30" />

          {/* Arrow particle — points in direction of travel (tangent = angleDeg + 90) */}
          <g transform={`translate(${px}, ${py}) rotate(${angleDeg + 90})`}>
            <polygon
              points="0,-8 5,4 -5,4"
              fill="currentColor"
              className="text-ink/60"
            />
            <polygon
              points="0,-12 7,5 -7,5"
              fill="currentColor"
              className="text-ink/10"
            />
          </g>
        </svg>

        {/* Nodes with scale + shadow on active */}
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            className={`absolute transition-all duration-300 rounded-2xl ${cardPositions[i]} ${
              active === i
                ? 'scale-[1.06] shadow-[0_0_20px_4px_rgba(0,0,0,0.08)]'
                : 'scale-100 shadow-none'
            }`}
          >
            <Node stage={stage} />
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="font-serif text-sm font-medium text-ink-muted sm:text-base">Cognitive</p>
          <p className="font-serif text-sm font-medium text-ink-muted sm:text-base">Loop</p>
        </div>
      </div>

      <p className="text-center text-xs text-ink-muted">
        Simplified abstraction of the full system
      </p>
    </div>
  )
}

function Node({ stage }: { stage: (typeof stages)[number] }) {
  const { Icon, name, sub } = stage
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
      <Icon size={18} className="text-ink" />
      <span className="font-serif text-sm font-medium text-ink">{name}</span>
      <span className="text-[11px] text-ink-muted">{sub}</span>
    </div>
  )
}

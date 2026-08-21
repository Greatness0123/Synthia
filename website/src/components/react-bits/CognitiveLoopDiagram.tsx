import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Brain, Activity, Database, ArrowRight, Play, Pause } from 'lucide-react'

const STAGES = [
  {
    id: 'perceive',
    index: '01',
    name: 'Perceive',
    icon: Eye,
    tag: 'Sensory Input',
    metric: 'RGB + 80-DOF Joints',
    log: 'Capturing 3D point-of-view camera render, audio PCM, and joint proprioception array',
    accent: 'border-teal/40 bg-teal/5 text-teal',
  },
  {
    id: 'decide',
    index: '02',
    name: 'Decide',
    icon: Brain,
    tag: 'LLM Reasoning',
    metric: 'Token Stream',
    log: '"Obstacle detected at 1.4m. Adjusting hip pitch +18° to clear elevation smoothly"',
    accent: 'border-amber/40 bg-amber/5 text-amber',
  },
  {
    id: 'act',
    index: '03',
    name: 'Act',
    icon: Activity,
    tag: 'Physics Engine',
    metric: '60 Hz MuJoCo WASM',
    log: 'Actuating 80 joint motor torques in browser WASM. Computing ground collision & balance',
    accent: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600',
  },
  {
    id: 'remember',
    index: '04',
    name: 'Remember',
    icon: Database,
    tag: 'Memory Store',
    metric: '3-Tier Parquet',
    log: 'Writing episodic memory frame #1042. Balance rating 0.96 recorded to working memory',
    accent: 'border-indigo-500/40 bg-indigo-500/5 text-indigo-600',
  },
]

export function CognitiveLoopDiagram() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  // Cycle automatically every 1.5 seconds through the 4 steps
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % STAGES.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [isPlaying])

  const activeStage = STAGES[activeIdx]

  return (
    <div className="my-10 overflow-hidden rounded-3xl border border-ink/10 bg-surface-elevated p-5 shadow-[0_12px_40px_-10px_rgba(26,25,23,0.08)] sm:p-8">
      {/* ── Top Bar with Status & Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink">
            Live Cognitive Loop Telemetry
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-ink/20 hover:text-ink cursor-pointer"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Pause Loop' : 'Play Loop'}</span>
          </button>
          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 font-mono text-[11px] text-ink-muted">
            1 Hz Cycle
          </span>
        </div>
      </div>

      {/* ── Interactive 4-Stage Horizontal Grid ── */}
      <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, idx) => {
          const isActive = idx === activeIdx
          const Icon = stage.icon

          return (
            <div
              key={stage.id}
              onClick={() => {
                setActiveIdx(idx)
                setIsPlaying(false)
              }}
              className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300 cursor-pointer ${
                isActive
                  ? `${stage.accent} shadow-md scale-[1.02]`
                  : 'border-ink/8 bg-surface/60 hover:border-ink/15 hover:bg-surface text-ink-muted'
              }`}
            >
              {/* Card Header: Step & Icon */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs font-bold text-ink-muted">
                  {stage.index}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    isActive ? 'bg-white shadow-sm' : 'bg-ink/5'
                  }`}
                >
                  <Icon size={16} />
                </div>
              </div>

              {/* Title & Tag */}
              <div>
                <h4 className="font-serif text-lg font-medium text-ink">{stage.name}</h4>
                <p className="text-xs text-ink-muted mt-0.5">{stage.tag}</p>
              </div>

              {/* Metric Badge */}
              <div className="mt-4 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
                <span className="font-mono font-medium">{stage.metric}</span>
                {isActive && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Live Step Execution Log Console ── */}
      <div className="relative overflow-hidden rounded-2xl border border-ink/8 bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2 font-mono text-[11px] text-ink-muted uppercase tracking-wider">
          <span>Active Step</span>
          <ArrowRight size={12} className="text-teal" />
          <span className="font-bold text-ink">{activeStage.name}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeStage.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-xs sm:text-sm text-ink leading-relaxed"
          >
            <span className="text-teal font-semibold">▶ </span>
            {activeStage.log}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer Summary ── */}
      <p className="mt-4 text-center text-xs text-ink-muted">
        One loop, every second, entirely in your browser. No server GPU bills.
      </p>
    </div>
  )
}

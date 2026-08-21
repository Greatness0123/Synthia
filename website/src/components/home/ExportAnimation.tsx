import { Download, Check } from 'lucide-react'

export function ExportAnimation() {
  return (
    <section className="bg-surface-card/60 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 md:px-10">
        <h2 className="font-serif text-3xl leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-5xl">
          You keep the data.
          <br />
          You own what it learns.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          Every moment your AI spends in training, its vision, motor forces, and telemetry write directly into a clean dataset file. One click exports everything.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-[#161615] p-6 shadow-xl sm:p-8">
          
          {/* Card Header: Training Session Info */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-soft" />
                <h3 className="font-serif text-lg font-medium text-white">Balance & Reach Telemetry</h3>
              </div>
              <p className="text-xs text-white/50">Recorded Session #SYN-8049 · 45 min duration</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-white/70">
              14,200 records
            </span>
          </div>

          {/* Training Session Summary Grid */}
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 font-mono text-xs">
              <p className="text-white/40 mb-1">Session Type</p>
              <p className="text-white font-medium">Upright Locomotion & Reach</p>
              <p className="mt-2 text-white/50 text-[11px]">80 Joint Telemetry · 60 Hz Physics</p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 font-mono text-xs">
              <p className="text-white/40 mb-1">Export File Format</p>
              <p className="text-white font-medium">Apache Parquet (.parquet)</p>
              <p className="mt-2 text-white/50 text-[11px]">18.4 MB · Snappy Compressed</p>
            </div>
          </div>

          {/* Sample Telemetry Record */}
          <div className="space-y-2 rounded-xl border border-white/5 bg-black/40 p-4 font-mono text-xs text-white/70">
            <div className="flex justify-between text-[11px] text-white/40 border-b border-white/10 pb-2 mb-2">
              <span>Sample Telemetry Frame #1042</span>
              <span>Proprioception + Vision</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-soft shrink-0">vision:</span>
              <span className="text-white/80">&quot;Object detected at 1.4m, angle 12°&quot;</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-soft shrink-0">motor_torque:</span>
              <span className="text-white/80">&quot;shoulder_pitch: 34Nm, elbow_flex: 12Nm&quot;</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-soft shrink-0">outcome:</span>
              <span className="text-white/80">&quot;Grasp successful. Balance index 0.96&quot;</span>
            </div>
          </div>

          {/* Card Footer: Export Button */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Check size={14} className="text-teal-soft" />
              <span>Self-hosted dataset export ready</span>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <Download size={15} />
              Export Dataset (.parquet)
            </button>
          </div>

        </div>

        <p className="mx-auto mt-6 text-center text-xs text-ink-muted">
          Your data remains on your machine. Export clean files anytime to use or share.
        </p>
      </div>
    </section>
  )
}


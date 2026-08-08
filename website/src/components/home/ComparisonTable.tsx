interface Row {
  label: string
  values: [string, string, string, string] // SYNTHIA, ChatGPT, Isaac, Robot demos
}

const ROWS: Row[] = [
  {
    label: 'Body',
    values: ['Simulated ~80-joint humanoid with physical WASM engine', 'None (Text box)', 'Simulated humanoid', 'Pre-recorded physical robot'],
  },
  {
    label: 'Thought Stream',
    values: ['Live real-time inner monologue & decision reasoning', 'Hidden black box', 'Hidden / Scripted logs', 'None'],
  },
  {
    label: 'Thought Steering',
    values: ["Inject thoughts to play Devil's Advocate & steer mind", 'Static system prompts', 'Complex code edit', 'None'],
  },
  {
    label: 'World',
    values: ['Interactive 3D scene in browser (no install)', 'None', 'Desktop app + local GPU build', 'Recorded video'],
  },
  {
    label: 'Memory',
    values: ['3-tier persistent memory (working, episodic, long-term)', 'Chat history buffer', 'Custom script required', 'None'],
  },
  {
    label: 'Skill Growth',
    values: ['Progressive physical skill milestones over sessions', 'None', 'Custom RL setup', 'None'],
  },
  {
    label: 'Voice & Speech',
    values: ['Per-agent STT + TTS with spatial acoustic physics', 'TTS only', 'External speech engine', 'None'],
  },
  {
    label: 'Data Export',
    values: ['1-click clean Parquet & JSON dataset export', 'Text transcript', 'Custom C++ exporter', 'None'],
  },
  {
    label: 'Setup & Access',
    values: ['Free in browser (Zero GPU / Zero setup)', 'Subscription required', 'High GPU hardware + CUDA setup', 'Watch only'],
  },
]

const COLUMNS = ['SYNTHIA', 'ChatGPT and image generators', 'NVIDIA Isaac, MuJoCo, Unity', 'Robot demo videos']

export function ComparisonTable() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-5xl px-4 pt-24 pb-12 text-center sm:px-6 sm:pt-32 md:px-10">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-teal">
          How it compares
        </p>
        <h2 className="font-serif text-3xl leading-[1.1] tracking-tight text-ink sm:text-4xl md:text-5xl">
          What is actually different.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          A side-by-side look at the tools people usually compare SYNTHIA to.
        </p>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 md:px-10 md:pb-32">
        <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-surface-elevated">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink/10 bg-surface-card/60">
                <th className="sticky left-0 z-10 bg-surface-card/95 px-5 py-5 text-xs font-medium uppercase tracking-[0.18em] text-ink-muted backdrop-blur sm:px-6">
                  Capability
                </th>
                {COLUMNS.map((col, idx) => (
                  <th
                    key={col}
                    className={`px-5 py-5 text-xs font-medium uppercase tracking-[0.18em] sm:px-6 ${
                      idx === 0 ? 'text-teal' : 'text-ink-muted'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, rowIdx) => (
                <tr
                  key={row.label}
                  className={rowIdx !== ROWS.length - 1 ? 'border-b border-ink/8' : ''}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface-elevated px-5 py-4 text-sm font-medium text-ink sm:px-6 sm:text-base"
                  >
                    {row.label}
                  </th>
                  {row.values.map((value, idx) => (
                    <td
                      key={idx}
                      className={`px-5 py-4 text-sm leading-relaxed sm:px-6 sm:text-base ${
                        idx === 0 ? 'text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

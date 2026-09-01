import { ArrowRight, BookOpen, Layers, Cpu, Compass, Network, Sparkles, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Section, SectionHeader } from '@/components/ui/Section'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { PageLayout } from '@/components/layout/PageLayout'
import { siteConfig } from '@/config/site'
import { ExportAnimation } from '@/components/home/ExportAnimation'

const marketStats = [
  { label: 'AI training data market (2026)', value: '$3.9B' },
  { label: 'Projected by 2033', value: '$16B+' },
  { label: 'Dataset ownership', value: '100% Yours' },
]

const subClassifications = [
  {
    domain: 'Reinforcement Learning',
    classification: 'Reference Motion Library / Reward Shaping Seeds',
    usage: 'Used as tracking targets where the RL policy gets rewarded for mimicking keyframes while maintaining dynamic stability in simulation.',
    icon: Cpu,
    tag: 'Reward Shaping',
  },
  {
    domain: 'Imitation Learning & BC',
    classification: 'Kinematic Demonstration Dataset',
    usage: "Used to warm-start or bootstrap an agent's policy before fine-tuning in physical simulation engines.",
    icon: Layers,
    tag: 'Policy Bootstrapping',
  },
  {
    domain: 'Embodied AI & VLA',
    classification: 'Annotated Multi-Modal Action Codex',
    usage: 'Bridges language to physical kinematics through structured intent, phase commentary, and biomechanical observation notes.',
    icon: Network,
    tag: 'Vision-Language-Action',
  },
  {
    domain: 'Trajectory Optimization',
    classification: 'Keyframe Trajectory Dataset',
    usage: 'Serves as initialization waypoints for numerical trajectory solvers such as Model Predictive Control (MPC) and Collocation.',
    icon: Compass,
    tag: 'Optimal Control',
  },
]

const faqs = [
  {
    q: 'Does SYNTHIA host a marketplace?',
    a: 'No. SYNTHIA does not host an internal marketplace. You export clean Parquet or JSONL datasets directly to your machine with one click, and you decide where to sell, host, or share them.',
  },
  {
    q: 'What kind of data does SYNTHIA generate?',
    a: 'Embodied multimodal agent data: 3D vision, proprioception vectors, inner thought reasoning streams, Devil\'s Advocate steering interventions, joint motor torques, and physics outcomes.',
  },
  {
    q: 'Where can I sell or publish exported datasets?',
    a: 'You can upload or sell your datasets on open data platforms like Kaggle, Hugging Face Datasets, or data platforms (e.g. Troveo, Defined.ai, Wirestock), or license them directly to AI research labs.',
  },
  {
    q: 'Is selling AI training data legal?',
    a: 'Yes. When you generate synthetic embodied data from sessions you run on your machine, you own the resulting dataset files.',
  },
  {
    q: 'How do I start exporting data?',
    a: 'Launch SYNTHIA, run an agent session in 3D physics, interact or steer its mind, then click "Export Dataset" in the control toolbar.',
  },
]

const PAPER_SUMMARY =
  'A structured, semantically annotated kinematic motion prior dataset for humanoid imitation learning, RL reward shaping, and LLM-guided embodied control.'

export function DataPage() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(PAPER_SUMMARY)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageLayout>
      <PageMeta
        title="AI Training Data Export and Research Classification"
        description="Turn your AI experiences into structured kinematic datasets. Export structured embodied AI training data with one click: vision, proprioception, motor torques, inner thoughts. 100% self-hosted Parquet format."
        path="/data"
        keywords="sell AI training data, AI dataset classification, synthetic kinematic motion prior dataset, reference trajectory dataset, imitation learning dataset, reward shaping seeds, embodied AI dataset, humanoid dataset, Parquet AI data, self-hosted dataset"
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

      <Section className="pt-32">
        <Breadcrumbs items={[{ label: 'Data export' }]} />

        <FadeContent>
          <SectionHeader
            eyebrow="1-Click Dataset Export"
            title="Turn what your AI experiences into clean data."
            description="Every moment the AI spends perceiving, reasoning, moving, and responding to thought steering, it writes clean structured telemetry. One click packages the run into a Parquet dataset."
          />
        </FadeContent>

        <div className="grid items-center gap-6 sm:gap-10 lg:grid-cols-3 mb-16">
          {marketStats.map((stat) => (
            <FadeContent key={stat.label}>
              <div className="rounded-2xl border border-ink/10 bg-surface-elevated px-6 py-7 text-center shadow-sm">
                <p className="font-serif text-3xl font-semibold text-ink">{stat.value}</p>
                <p className="mt-2 text-xs uppercase tracking-wider text-ink-muted">{stat.label}</p>
              </div>
            </FadeContent>
          ))}
        </div>

        {/* Live Export Interactive Animation */}
        <FadeContent>
          <ExportAnimation />
        </FadeContent>

        {/* ── Research & Machine Learning Classification Section ── */}
        <div className="mt-20 sm:mt-28">
          <FadeContent>
            <div className="mb-10 text-center max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal">
                <BookOpen size={13} />
                Research Taxonomy
              </span>
              <h2 className="mt-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">
                How researchers classify SYNTHIA datasets
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
                In robotics and machine learning research, data generated by SYNTHIA is classified across four core academic disciplines.
              </p>
            </div>
          </FadeContent>

          {/* Primary Classification Highlight Card */}
          <FadeContent delay={0.05}>
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-ink/10 bg-surface-elevated p-6 sm:p-8 md:p-10 shadow-sm">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-glow/20 via-transparent to-teal-soft/10" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-amber/15 border border-amber/20 px-3.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-amber-900">
                    Primary Classification
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    Reference Trajectory Standard
                  </span>
                </div>

                <h3 className="mt-4 font-serif text-2xl text-ink sm:text-3xl">
                  Synthetic Kinematic Motion Prior Dataset
                </h3>
                <p className="mt-1 text-sm font-medium text-teal sm:text-base">
                  (or Reference Trajectory Dataset)
                </p>

                <div className="mt-6 grid gap-6 md:grid-cols-2 pt-6 border-t border-ink/8">
                  <div>
                    <h4 className="font-semibold text-ink text-sm uppercase tracking-wider">
                      Why it is classified this way
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      It contains structured target joint angles, timings, and milestone phases rather than raw low-level motor torques, making it portable across physics engines.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink text-sm uppercase tracking-wider">
                      Equivalent in literature
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      Directly analogous to the motion libraries used in <strong className="text-ink font-semibold">DeepMimic</strong>, <strong className="text-ink font-semibold">NVIDIA AMP (Adversarial Motion Priors)</strong>, and <strong className="text-ink font-semibold">ProtoMotions</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeContent>

          {/* Sub-classifications Grid */}
          <div className="mt-6 grid gap-4 sm:gap-6 sm:grid-cols-2">
            {subClassifications.map((item, index) => {
              const Icon = item.icon
              return (
                <FadeContent key={item.domain} delay={0.08 + index * 0.04}>
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-ink/8 bg-surface-elevated p-6 shadow-sm hover:border-ink/20 transition-colors">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
                          <Icon size={14} className="text-teal" />
                          {item.domain}
                        </span>
                        <span className="font-mono text-[11px] text-ink-muted">
                          {item.tag}
                        </span>
                      </div>
                      <h3 className="mt-4 font-serif text-lg font-semibold text-ink sm:text-xl">
                        {item.classification}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                        {item.usage}
                      </p>
                    </div>
                  </div>
                </FadeContent>
              )
            })}
          </div>

          {/* Paper / Pitch Summary Callout Block */}
          <FadeContent delay={0.25}>
            <div className="mt-8 rounded-2xl border border-teal/20 bg-teal/5 p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal">
                  <Sparkles size={15} />
                  Short summary for a paper, README, or pitch
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-teal/30 bg-surface px-3 py-1.5 text-xs font-medium text-teal hover:bg-teal/10 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy Citation Summary</span>
                    </>
                  )}
                </button>
              </div>

              <blockquote className="mt-4 font-serif text-lg italic text-ink sm:text-xl leading-relaxed">
                &ldquo;{PAPER_SUMMARY}&rdquo;
              </blockquote>
            </div>
          </FadeContent>
        </div>

        {/* ── Common Questions / FAQs ── */}
        <FadeContent className="mt-20 sm:mt-28">
          <h2 className="mb-8 font-serif text-2xl text-ink md:text-3xl">Common questions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {faqs.map((item) => (
              <article key={item.q} className="rounded-xl border border-ink/10 bg-surface-elevated p-6 shadow-sm">
                <h3 className="font-medium text-ink text-base">{item.q}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.a}</p>
              </article>
            ))}
          </div>
        </FadeContent>

        <FadeContent className="mt-16 text-center">
          <ShimmerButton href={siteConfig.appUrl} className="mx-auto">
            Generate data in SYNTHIA. It's Free
            <ArrowRight size={16} />
          </ShimmerButton>
        </FadeContent>
      </Section>
    </PageLayout>
  )
}

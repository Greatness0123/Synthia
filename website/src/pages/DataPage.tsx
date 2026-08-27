import { ArrowRight } from 'lucide-react'
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

export function DataPage() {
  return (
    <PageLayout>
      <PageMeta
        title="Sell AI training data — export what your AI learns"
        description="Turn your AI's experiences into sellable datasets. Export structured embodied AI training data with one click — vision, proprioception, motor torques, inner thoughts. Parquet format, 100% self-hosted. The AI dataset marketplace starts here."
        path="/data"
        keywords="sell AI training data, make money selling AI data, AI dataset marketplace, sell AI data, export AI training data, AI training data for sale, generate AI training data, sell data to AI companies, how to sell AI training data, can you sell data to AI companies, new ways to make money with AI, AI data side hustle, sell agent data, embodied AI data, AI behavior data, multimodal AI dataset, synthetic agent data, make money with AI data, AI training data market, how to export AI agent data, sell data online, how much is AI training data worth, who buys AI training data, how to start selling AI data, AI data buyers, dataset export CSV JSONL, AI training data generation, structured AI data, Parquet AI data, one click data export, self-hosted dataset, AI data ownership, sell embodied data, AI telemetry data, agent data export, vision data AI, proprioception data, motor torque data, AI reasoning data, thought stream data, AI session data, export AI dataset, AI data file, training data format, AI data marketplace 2026, make AI data for sale, AI data income, passive income AI data, AI side income"
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

        <div className="grid items-center gap-10 lg:grid-cols-3 mb-16">
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

        <FadeContent className="mt-20">
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


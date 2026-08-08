import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import kaggleScript from '../scripts/kaggle_new.py?raw'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { CodeArtifact } from '@/components/ui/CodeArtifact'
import { Section, SectionHeader } from '@/components/ui/Section'
import { PageLayout } from '@/components/layout/PageLayout'

const kaggleLimits = [
  { label: 'GPU quota', value: '~30 hours/week', note: 'Resets weekly. Phone verification required.' },
  { label: 'Session limit', value: 'Up to 12 hours', note: 'Restart the notebook if it times out.' },
  { label: 'GPU options', value: 'T4 x2 or P100', note: 'Use T4 x2 (32GB total) for Qwen2.5-VL 3B.' },
  { label: 'Disk', value: '20 GB/session', note: 'Save outputs to /kaggle/working.' },
  { label: 'CPU', value: 'Unlimited', note: 'No weekly cap on CPU-only notebooks.' },
]

const steps = [
  {
    title: 'Create a Kaggle account',
    body: (
      <>
        Go to{' '}
        <a
          href="https://www.kaggle.com/account/login"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal underline-offset-2 hover:underline"
        >
          kaggle.com
        </a>{' '}
        and sign up with Google, email, or GitHub. Verify your phone number under Settings → Phone
        Verification to unlock free GPU access.
      </>
    ),
  },
  {
    title: 'Create a new notebook',
    body: 'Click New → Notebook. Name it something like synthia-inference. Under Session Options → Accelerator, choose GPU T4 x2 (recommended) or GPU P100.',
  },
  {
    title: 'Install dependencies',
    body: 'In the first cell, run: pip install fastapi uvicorn pydantic transformers accelerate bitsandbytes qwen-vl-utils schedule pillow',
  },
  {
    title: 'Add the Qwen model dataset (optional but faster)',
    body: (
      <>
        Click Add Input → search for Qwen2.5-VL 3B. Adding a pre-uploaded model dataset avoids
        re-downloading weights every session. If you skip this, the script downloads from Hugging
        Face on first run.
      </>
    ),
  },
  {
    title: 'Paste and run the script',
    body: 'Copy kaggle_new.py below into a new cell (or save as a file in the notebook). Run the cell. First load takes several minutes while the vision model loads into GPU memory.',
  },
  {
    title: 'Copy the tunnel URL into SYNTHIA',
    body: (
      <>
        When the script starts, it prints a{' '}
        <code className="rounded bg-surface-card px-1.5 py-0.5 text-sm">trycloudflare.com</code>{' '}
        URL ending in <code className="rounded bg-surface-card px-1.5 py-0.5 text-sm">/infer</code>.
        Paste that into SYNTHIA God Mode → Inference URL. See the{' '}
        <Link to="/guides/cloudflare-tunnel" className="text-teal hover:underline">
          Cloudflare tunnel guide
        </Link>{' '}
        if the link does not appear.
      </>
    ),
  },
]

export function KaggleGuidePage() {
  return (
    <PageLayout>
      <PageMeta
        title="Free AI inference on Kaggle"
        description="Step-by-step guide to run SYNTHIA inference on Kaggle free GPU. Copy the kaggle_new.py script, connect via Cloudflare tunnel, no credit card."
        path="/guides/kaggle"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Run SYNTHIA inference on Kaggle free GPU',
          step: steps.map((s, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: s.title,
            text: typeof s.body === 'string' ? s.body : s.title,
          })),
        }}
      />

      <Section className="pt-32">
        <Breadcrumbs
          items={[
            { label: 'Guides', href: '/guides/kaggle' },
            { label: 'Kaggle inference' },
          ]}
        />

        <FadeContent>
          <SectionHeader
            eyebrow="Setup guide"
            title="Free AI inference on Kaggle"
            description="Run the SYNTHIA vision model on Kaggle's free GPU tier. No credit card. The script below removes the CLAP audio model to save VRAM and avoid overload."
          />
        </FadeContent>

        <FadeContent className="mb-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kaggleLimits.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-ink/5 bg-surface-elevated p-5"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-teal">{item.label}</p>
                <p className="mt-2 font-serif text-xl text-ink">{item.value}</p>
                <p className="mt-2 text-sm text-ink-muted">{item.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            Limits are set by Kaggle and may change. Check{' '}
            <a
              href="https://www.kaggle.com/docs/efficient-gpu-usage"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal hover:underline"
            >
              Kaggle GPU docs
              <ExternalLink size={12} />
            </a>{' '}
            for the latest quotas.
          </p>
        </FadeContent>

        <div className="space-y-10">
          {steps.map((step, index) => (
            <FadeContent key={step.title} delay={index * 0.04}>
              <article className="flex gap-4 sm:gap-6">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal/10 font-mono text-sm text-teal">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-xl text-ink md:text-2xl">{step.title}</h2>
                  <p className="mt-3 leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              </article>
            </FadeContent>
          ))}
        </div>

        <FadeContent className="mt-14">
          <h2 className="mb-4 font-serif text-2xl text-ink">kaggle_new.py</h2>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-muted">
            CLAP audio classification has been removed from this version. Audio is reported as
            silent or non-silent only, which keeps GPU memory free for the vision model.
          </p>
          <CodeArtifact code={kaggleScript} filename="kaggle_new.py" maxHeight="24rem" />
        </FadeContent>

        <FadeContent className="mt-10 rounded-xl border border-amber/20 bg-amber/5 p-6">
          <h3 className="font-medium text-ink">Troubleshooting</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
            <li>Out of memory: switch to T4 x2, restart the session, or set MOCK_MODE=true to test the tunnel first.</li>
            <li>Model load fails: run pip install bitsandbytes accelerate and add the Qwen dataset as input.</li>
            <li>Session died: Kaggle kills notebooks after ~12 hours. Re-run the cell and update the new tunnel URL.</li>
          </ul>
        </FadeContent>
      </Section>
    </PageLayout>
  )
}

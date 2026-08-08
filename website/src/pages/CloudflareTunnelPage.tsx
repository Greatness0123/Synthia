import { ExternalLink } from 'lucide-react'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Section, SectionHeader } from '@/components/ui/Section'
import { PageLayout } from '@/components/layout/PageLayout'
import { Link } from 'react-router-dom'

const quickTunnelSteps = [
  'The kaggle_new.py script downloads cloudflared and starts a quick tunnel automatically.',
  'No Cloudflare account is required for quick tunnels.',
  'After ~8 seconds, check the notebook output for a URL like https://something-random.trycloudflare.com',
  'Append /infer to that URL and paste it into SYNTHIA God Mode → Inference URL.',
  'Quick tunnel URLs change every time you restart the script. Update SYNTHIA when you start a new session.',
]

const namedTunnelSteps = [
  'Create a free account at cloudflare.com (Workers & Pages plan is free).',
  'Install cloudflared locally or use it in your notebook.',
  'Create a tunnel in Zero Trust → Networks → Tunnels → Create a tunnel.',
  'Copy the tunnel token and run: cloudflared tunnel run --token YOUR_TOKEN',
  'Configure a public hostname pointing to http://127.0.0.1:8000 for a stable URL.',
]

export function CloudflareTunnelPage() {
  return (
    <PageLayout>
      <PageMeta
        title="Connect SYNTHIA with Cloudflare Tunnel"
        description="Expose your Kaggle inference server to SYNTHIA using Cloudflare quick tunnels or named tunnels. Step-by-step, free tier explained."
        path="/guides/cloudflare-tunnel"
      />

      <Section className="pt-32">
        <Breadcrumbs
          items={[
            { label: 'Guides', href: '/guides/kaggle' },
            { label: 'Cloudflare tunnel' },
          ]}
        />

        <FadeContent>
          <SectionHeader
            eyebrow="Setup guide"
            title="Connect SYNTHIA with Cloudflare"
            description="SYNTHIA runs in your browser. The AI model runs on Kaggle. Cloudflare Tunnel bridges them with a public HTTPS URL your browser can reach."
          />
        </FadeContent>

        <FadeContent className="mb-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink/5 bg-surface-elevated p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-teal">Quick tunnel</p>
            <p className="mt-2 font-serif text-lg text-ink">Free, no account</p>
            <p className="mt-2 text-sm text-ink-muted">
              Temporary trycloudflare.com URL. Used by the Kaggle script. Best for getting started.
            </p>
          </div>
          <div className="rounded-xl border border-ink/5 bg-surface-elevated p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-teal">Named tunnel</p>
            <p className="mt-2 font-serif text-lg text-ink">Free Cloudflare account</p>
            <p className="mt-2 text-sm text-ink-muted">
              Stable hostname on your domain. For advanced users who want a permanent inference URL.
            </p>
          </div>
          <div className="rounded-xl border border-ink/5 bg-surface-elevated p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-teal">Cloudflare free tier</p>
            <p className="mt-2 font-serif text-lg text-ink">$0/month</p>
            <p className="mt-2 text-sm text-ink-muted">
              Unlimited bandwidth on free plan for tunnel traffic. No credit card for basic tunnel use.
            </p>
          </div>
        </FadeContent>

        <FadeContent>
          <h2 className="mb-6 font-serif text-2xl text-ink">Option A: Quick tunnel (recommended)</h2>
          <p className="mb-6 max-w-2xl leading-relaxed text-ink-muted">
            This is what{' '}
            <Link to="/guides/kaggle" className="text-teal hover:underline">
              kaggle_new.py
            </Link>{' '}
            sets up automatically. You do not need to visit Cloudflare first.
          </p>
          <ol className="space-y-4">
            {quickTunnelSteps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-mono text-sm text-teal">{i + 1}.</span>
                <span className="leading-relaxed text-ink-muted">{step}</span>
              </li>
            ))}
          </ol>
        </FadeContent>

        <FadeContent className="mt-14">
          <h2 className="mb-6 font-serif text-2xl text-ink">Option B: Named tunnel (stable URL)</h2>
          <p className="mb-6 max-w-2xl leading-relaxed text-ink-muted">
            If you want the same URL every session, create a free Cloudflare account and a named
            tunnel. This is optional; most users only need the quick tunnel.
          </p>
          <ol className="space-y-4">
            {namedTunnelSteps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-mono text-sm text-teal">{i + 1}.</span>
                <span className="leading-relaxed text-ink-muted">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ink-faint">
            Official docs:{' '}
            <a
              href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal hover:underline"
            >
              Cloudflare Tunnel documentation
              <ExternalLink size={12} />
            </a>
          </p>
        </FadeContent>

        <FadeContent className="mt-14 rounded-xl border border-teal/20 bg-teal/5 p-6">
          <h3 className="font-medium text-ink">Security note</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Quick tunnel URLs are public. Anyone with the link can send requests while your Kaggle
            session is running. Do not share the URL publicly. Stop the notebook when you are done.
            SYNTHIA only sends inference payloads; your API keys stay in the browser.
          </p>
        </FadeContent>
      </Section>
    </PageLayout>
  )
}

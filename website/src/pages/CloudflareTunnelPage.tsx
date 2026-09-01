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
        title="Free AI tunnel — expose Kaggle GPU to browser with Cloudflare"
        description="Free AI inference proxy: expose your Kaggle free GPU to SYNTHIA using Cloudflare quick tunnels. No credit card, no server bill. Get a public URL for your free AI model in minutes."
        path="/guides/cloudflare-tunnel"
        keywords="free AI, free AI inference, free AI GPU, free AI server, free AI proxy, free AI tunnel, free AI model, free AI compute, free AI hosting, free AI online, run AI for free, free AI no credit card, free AI no install, free AI browser, free GPU AI, free cloud AI, free AI inference server, free AI public URL, free AI server tunnel, Cloudflare free AI, Kaggle free AI, free AI tool, free AI platform, free AI simulation, free AI sandbox, free AI agent, free AI with body, free embodied AI, free physics AI, free AI that learns, free AI open source, free MIT AI, free AI 2026, no cost AI, zero cost AI, free AI model hosting, free GPU inference, free GPU server, free GPU tunnel, free cloud GPU, free AI compute tier, free AI without GPU, no GPU bill AI, free AI inference guide, free AI setup guide, free AI step by step, how to run AI for free, free AI tutorial, free AI for developers, free AI for researchers, free AI for students, free AI experimentation, free AI prototyping, Cloudflare tunnel AI, Kaggle tunnel setup, expose AI server, Cloudflare quick tunnel, named tunnel AI, Kaggle inference proxy, AI server public URL, Cloudflare free tier tunnel, tunnel for AI inference, SYNTHIA Cloudflare setup, browser AI tunnel, AI inference exposure, free tunnel for notebook, Kaggle notebook tunnel, Cloudflare zero trust tunnel, AI server tunnel guide, how to expose AI server, Kaggle GPU tunnel, AI server public access, Cloudflare tunnel tutorial, tunnel Kaggle to browser, AI inference tunnel setup, free AI exposure, notebook tunnel guide, Kaggle Cloudflare setup, AI server URL tunnel, public AI inference, browser AI connection, SYNTHIA inference connection, AI server proxy free, tunnel guide step by step, expose Kaggle server, AI inference access guide, Kaggle GPU public, browser based AI tunnel, AI inference proxy guide, connect AI to browser, SYNTHIA Cloudflare guide, tunnel for free GPU, Cloudflare tunnel notebook, Kaggle inference access"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Set up free AI inference with Cloudflare Tunnel',
          description: 'Step-by-step guide to expose a free Kaggle GPU inference server to SYNTHIA using Cloudflare quick tunnels or named tunnels at zero cost.',
          step: [
            { '@type': 'HowToStep', position: 1, name: 'Create free Kaggle account', text: 'Sign up at kaggle.com with Google, email, or GitHub. Verify your phone to unlock free GPU access.' },
            { '@type': 'HowToStep', position: 2, name: 'Create Kaggle notebook', text: 'Start a new notebook, select GPU T4 x2 or P100 under Session Options. No credit card required.' },
            { '@type': 'HowToStep', position: 3, name: 'Paste and run kaggle_new.py', text: 'Copy the inference script into your notebook. It installs dependencies, loads the vision model, and starts a Cloudflare quick tunnel automatically.' },
            { '@type': 'HowToStep', position: 4, name: 'Copy the tunnel URL', text: 'After ~8 seconds, the notebook prints a trycloudflare.com URL ending in /infer.' },
            { '@type': 'HowToStep', position: 5, name: 'Paste URL into SYNTHIA', text: 'Open SYNTHIA, go to God Mode, and paste the tunnel URL into the Inference URL field.' },
          ],
          totalTime: 'PT10M',
          supply: [
            { '@type': 'HowToSupply', name: 'Kaggle account (free)' },
            { '@type': 'HowToSupply', name: 'SYNTHIA browser app' },
          ],
          tool: [
            { '@type': 'HowToTool', name: 'Cloudflare quick tunnel (free)' },
            { '@type': 'HowToTool', name: 'Kaggle free GPU' },
          ],
        }}
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

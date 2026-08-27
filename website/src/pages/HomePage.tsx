import { Hero } from '@/components/home/Hero'
import { WhySynthia } from '@/components/home/WhySynthia'
import { GiveAnAiAWorld } from '@/components/home/GiveAnAiAWorld'
import { ComparisonTable } from '@/components/home/ComparisonTable'
import { ExportAnimation } from '@/components/home/ExportAnimation'
import { FounderQuote } from '@/components/home/FounderQuote'
import { TryIt } from '@/components/home/TryIt'
import { PageLayout } from '@/components/layout/PageLayout'
import { PageMeta } from '@/components/seo/PageMeta'
import { siteConfig } from '@/config/site'

export function HomePage() {
  return (
    <PageLayout>
      <PageMeta
        title="SYNTHIA | AI with a body that learns to live in a world"
        description="Give an AI a body and a world to live in — right in your browser, no install, no GPU bill. Watch it learn skills, remember what happens, and export everything it learns as data you can sell. The first browser-based embodied AI simulation."
        path="/"
        keywords="AI with a body, AI that lives in a world, living AI, AI mind with a body, embodied AI, AI simulation in browser, browser based AI, AI world simulation, make an AI online free, AI sandbox, AI that learns to walk, AI that learns skills, AI with memory, AI that remembers, AI that talks to other AI, AI you can talk to, AI character online, no install AI, AI that acts on its own, AI that sees its world, AI with proprioception, AI physics simulation, humanoid AI simulation, AI character that moves, AI obstacle course, AI world builder, AI environment editor, AI experiment tool, control AI without coding, interact with AI without coding, AI you can shape, sell AI training data, make money selling AI data, AI dataset marketplace, export AI training data, generate AI training data, how to direct an AI agent, give an AI a goal, build a world for an AI, set tasks for AI, observe an AI agent, watch an AI learn, place objects in AI world, AI goal directed behavior, browser physics simulation, client-side AI agent, open source embodied AI, free AI agent, AI agent with a body"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'SYNTHIA',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web browser',
          description: 'Give an AI a body, shape its world, and watch it learn. The first browser-based embodied AI simulation with real physics, memory, and one-click data export.',
          url: siteConfig.url,
          license: 'https://opensource.org/licenses/MIT',
          codeRepository: siteConfig.repoUrl,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          featureList: 'AI with a body, AI world simulation, agent memory, skill ladder, data export, multi-agent communication, browser physics simulation, no install AI, free AI sandbox',
          keywords: 'AI with a body, AI that lives in a world, living AI, embodied AI, AI simulation in browser, browser based AI, AI world simulation, make an AI online free, AI sandbox, AI that learns to walk, AI that learns skills, AI with memory, AI that remembers, AI that talks to other AI, sell AI training data, make money selling AI data, AI dataset marketplace, export AI training data, generate AI training data, how to direct an AI agent, give an AI a goal, build a world for an AI, control AI without coding, humanoid AI simulation, AI physics simulation, AI character that moves, AI that acts on its own, AI that sees its world, AI with proprioception, AI that can hear, no install AI, AI character online',
        }}
      />
      <Hero />
      <WhySynthia />
      <GiveAnAiAWorld />
      <ComparisonTable />
      <ExportAnimation />
      <FounderQuote />
      <TryIt />
    </PageLayout>
  )
}

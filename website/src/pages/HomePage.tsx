import { Hero } from '@/components/home/Hero'
import { WhySynthia } from '@/components/home/WhySynthia'
import { GiveAnAiAWorld } from '@/components/home/GiveAnAiAWorld'
import { ComparisonTable } from '@/components/home/ComparisonTable'
import { ExportAnimation } from '@/components/home/ExportAnimation'
import { TryIt } from '@/components/home/TryIt'
import { PageLayout } from '@/components/layout/PageLayout'
import { PageMeta } from '@/components/seo/PageMeta'
import { siteConfig } from '@/config/site'

export function HomePage() {
  return (
    <PageLayout>
      <PageMeta
        title="SYNTHIA | The first browser-based embodiment application for AI"
        description="The first browser-based embodiment application for artificial intelligence. Open the page and an AI is already living in a world. No install. No GPU bill."
        path="/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'SYNTHIA',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web browser',
          description: siteConfig.tagline,
          url: siteConfig.url,
          license: 'https://opensource.org/licenses/MIT',
          codeRepository: siteConfig.repoUrl,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <Hero />
      <WhySynthia />
      <GiveAnAiAWorld />
      <ComparisonTable />
      <ExportAnimation />
      <TryIt />
    </PageLayout>
  )
}

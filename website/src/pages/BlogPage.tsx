import { Link } from 'react-router-dom'
import { blogPosts } from '@/data/blogPosts'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { PageLayout } from '@/components/layout/PageLayout'
import { Section, SectionHeader } from '@/components/ui/Section'

export function BlogPage() {
  return (
    <PageLayout>
      <PageMeta
        title="Blog | Embodied AI, AI training data, and AI worlds"
        description="Stories about embodied AI, selling AI training data, building worlds for AI agents, and what happens when AI minds with bodies learn to live. First-person builder voice from the creator of SYNTHIA."
        path="/blog"
        keywords="embodied AI blog, AI training data blog, AI world simulation blog, AI with a body stories, selling AI data stories, AI agent blog, AI that learns to walk blog, AI memory blog, AI physics blog, multi-agent AI blog, AI character stories, make money AI data blog, AI dataset marketplace blog, browser AI blog, open source AI blog, AI builder stories, AI development blog, AI experiment stories, AI learning stories, AI mind body blog, AI embodiment stories, AI sandbox stories, AI world builder blog, AI training stories, AI skill learning blog, AI movement stories, AI perception blog, AI reasoning stories, AI autonomous agent blog, AI vision stories, AI hearing stories, AI speech stories, AI communication stories, AI behavior stories, AI emergence stories, AI research blog, AI education blog, AI tutorial blog, AI guide blog, AI how to blog, AI getting started blog, AI beginner stories, AI advanced stories, AI technical blog, AI plain language blog, SYNTHIA creator blog, Greatness Okorie blog, AI open source stories, AI MIT licensed blog, free AI blog, free AI stories, free AI that learns, free embodied AI, free AI agent, free AI platform, free AI tool, free AI no install, free AI browser, free AI open source, free MIT AI, free AI 2026, no GPU bill AI, free AI for developers, free AI for researchers, free AI for students, free AI experimentation, free AI prototyping, try AI free, test AI free, free AI demo, free AI experience, free AI with memory, free AI that learns to walk, free AI physics, free AI body control, free AI movement, free AI learning, free AI skills, free AI world, free AI environment, free AI simulation online, free AI in browser, free AI no download, free AI no signup, free AI MIT license, free open source AI, free AI project, free AI software, free AI application, free AI web app, free browser AI, free client-side AI, free AI agent platform, free AI embodiment, free AI mind, free AI character, free AI humanoid, free AI that acts, free AI that perceives, free AI that decides, free AI that remembers, free AI training data, free AI dataset, free AI data export, free AI money making, free AI side hustle, free AI income"
      />
      <Section className="pt-24 sm:pt-32">
        <SectionHeader
          eyebrow="Blog"
          title="Stories from building a world where AI learns to live"
          description="First-person builder voice. What it is, what you can earn, and what happens when minds with bodies share a place."
        />

        <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
          {blogPosts.map((post, index) => (
            <FadeContent key={post.slug} delay={index * 0.04}>
              <Link
                to={`/blog/${post.slug}`}
                className="group block h-full rounded-2xl border border-ink/5 bg-surface-elevated p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-ink/5 sm:p-8"
              >
                <div className="mb-4 flex items-center gap-3 text-xs text-ink-faint">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </time>
                  <span>·</span>
                  <span>{post.readTime}</span>
                </div>
                <h2 className="font-serif text-xl leading-snug text-ink transition-colors group-hover:text-teal sm:text-2xl">
                  {post.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:mt-4">{post.excerpt}</p>
                <span className="mt-5 inline-block text-sm text-teal sm:mt-6">Read →</span>
              </Link>
            </FadeContent>
          ))}
        </div>
      </Section>
    </PageLayout>
  )
}

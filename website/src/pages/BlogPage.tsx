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
        title="Blog"
        description="Stories about embodied AI, selling AI training data, and building a world where an AI mind with a body learns to live."
        path="/blog"
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

import { Link, Navigate, useParams } from 'react-router-dom'
import { getBlogPost } from '@/data/blogPosts'
import { PageMeta } from '@/components/seo/PageMeta'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { PageLayout } from '@/components/layout/PageLayout'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

export function BlogPostPage() {
  const { slug } = useParams()
  const post = slug ? getBlogPost(slug) : undefined

  if (!post) {
    return <Navigate to="/blog" replace />
  }

  return (
    <PageLayout>
      <PageMeta
        title={post.title}
        description={post.excerpt}
        path={`/blog/${post.slug}`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          author: { '@type': 'Person', name: siteConfig.builderName },
          publisher: { '@type': 'Organization', name: 'SYNTHIA' },
        }}
      />
      <article className="section-padding mx-auto max-w-3xl pt-24 sm:pt-32">
        <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title }]} />

        <FadeContent>
          <div className="mt-6 flex items-center gap-3 text-xs text-ink-faint">
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

          <h1 className="mt-6 font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
            {post.title}
          </h1>
        </FadeContent>

        <FadeContent delay={0.06}>
          <div className="prose prose-lg mt-10 max-w-none prose-p:text-ink-muted prose-p:leading-relaxed sm:mt-12">
            {post.content.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>
        </FadeContent>

        <FadeContent delay={0.1}>
          <div className="mt-12 flex flex-wrap gap-4 border-t border-ink/5 pt-8 sm:mt-16 sm:pt-10">
            <ShimmerButton href={siteConfig.appUrl}>Try SYNTHIA</ShimmerButton>
            <Link
              to="/data"
              className="inline-flex items-center px-4 text-sm text-teal underline-offset-4 hover:underline"
            >
              Data export
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex items-center px-4 text-sm text-teal underline-offset-4 hover:underline"
            >
              See how it works
            </Link>
          </div>
        </FadeContent>
      </article>
    </PageLayout>
  )
}

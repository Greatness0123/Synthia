import { useEffect } from 'react'

interface PageMetaProps {
  title: string
  description: string
  path?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

function upsertMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

export function PageMeta({ title, description, path = '', jsonLd }: PageMetaProps) {
  const fullTitle = title.includes('SYNTHIA') ? title : `${title} | SYNTHIA`
  const url = `https://synthia.online${path}`

  useEffect(() => {
    document.title = fullTitle
    upsertMeta('description', description)
    upsertMeta('og:title', fullTitle, true)
    upsertMeta('og:description', description, true)
    upsertMeta('og:url', url, true)
    upsertMeta('twitter:title', fullTitle)
    upsertMeta('twitter:description', description)
    upsertLink('canonical', url)

    const existing = document.getElementById('page-jsonld')
    existing?.remove()

    if (jsonLd) {
      const script = document.createElement('script')
      script.id = 'page-jsonld'
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }

    return () => {
      document.getElementById('page-jsonld')?.remove()
    }
  }, [fullTitle, description, url, jsonLd])

  return null
}

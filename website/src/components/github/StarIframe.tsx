import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

interface StarIframeProps {
  showCount?: boolean
  large?: boolean
  className?: string
}

export function StarIframe({ showCount = true, large = false, className }: StarIframeProps) {
  const src = `https://ghbtns.com/github-btn.html?user=${siteConfig.githubOwner}&repo=${siteConfig.githubRepo}&type=star${showCount ? '&count=true' : ''}${large ? '&size=large' : ''}`

  const width = large ? (showCount ? 170 : 90) : showCount ? 150 : 80
  const height = large ? 30 : 20

  return (
    <iframe
      src={src}
      frameBorder={0}
      scrolling="no"
      width={width}
      height={height}
      title="GitHub Star Button"
      loading="lazy"
      className={cn('border-0', className)}
    />
  )
}

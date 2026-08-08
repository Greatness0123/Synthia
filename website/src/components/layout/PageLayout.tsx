import type { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { ScrollProgress } from '@/components/react-bits/ScrollProgress'
import { cn } from '@/lib/utils'

interface PageLayoutProps {
  children: ReactNode
  dark?: boolean
  className?: string
}

export function PageLayout({ children, dark, className }: PageLayoutProps) {
  return (
    <div className={cn(dark && 'engine-page min-h-screen', className)}>
      <ScrollProgress />
      <Header />
      <main>{children}</main>
      <Footer dark={dark} />
    </div>
  )
}

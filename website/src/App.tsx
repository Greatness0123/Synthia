import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { CustomCursor } from '@/components/react-bits/CustomCursor'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { HomePage } from '@/pages/HomePage'
import { ResearchersPage } from '@/pages/ResearchersPage'
import { HowItWorksPage } from '@/pages/HowItWorksPage'
import { MemoryPage } from '@/pages/MemoryPage'
import { DataPage } from '@/pages/DataPage'
import { RoadmapPage } from '@/pages/RoadmapPage'
import { BlogPage } from '@/pages/BlogPage'
import { BlogPostPage } from '@/pages/BlogPostPage'
import { KaggleGuidePage } from '@/pages/KaggleGuidePage'
import { CloudflareTunnelPage } from '@/pages/CloudflareTunnelPage'
import { BenchmarkPage } from '@/pages/BenchmarkPage'
import { SitemapPage } from '@/pages/SitemapPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CustomCursor />
      <Routes>
        <Route path="/" element={<HomePage />} />
         <Route path="/researchers" element={<ResearchersPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/benchmarks" element={<BenchmarkPage />} />
        <Route path="/guides/kaggle" element={<KaggleGuidePage />} />
        <Route path="/guides/cloudflare-tunnel" element={<CloudflareTunnelPage />} />
        <Route path="/sitemap" element={<SitemapPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  )
}

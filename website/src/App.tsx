import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CustomCursor } from '@/components/react-bits/CustomCursor'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { HomePage } from '@/pages/HomePage'
import { HowItWorksPage } from '@/pages/HowItWorksPage'
import { MemoryPage } from '@/pages/MemoryPage'
import { DataPage } from '@/pages/DataPage'
import { RoadmapPage } from '@/pages/RoadmapPage'
import { BlogPage } from '@/pages/BlogPage'
import { BlogPostPage } from '@/pages/BlogPostPage'
import { KaggleGuidePage } from '@/pages/KaggleGuidePage'
import { CloudflareTunnelPage } from '@/pages/CloudflareTunnelPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CustomCursor />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/guides/kaggle" element={<KaggleGuidePage />} />
        <Route path="/guides/cloudflare-tunnel" element={<CloudflareTunnelPage />} />
        <Route path="/skills" element={<Navigate to="/how-it-works" replace />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
      </Routes>
    </BrowserRouter>
  )
}

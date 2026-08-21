import { useState } from 'react'
import { OPEN_SOURCE_MODELS, type OpenSourceModel } from '@/data/openSourceModels'
import { siteConfig } from '@/config/site'
import { Check, Copy, Cpu, Zap, ShieldCheck, ChevronDown, ExternalLink, Sparkles } from 'lucide-react'
import { Section } from '@/components/ui/Section'
import { FadeContent } from '@/components/react-bits/FadeContent'

export function OpenSourceModelSelector() {
  const [selectedModelId, setSelectedModelId] = useState<string>('qwen-2.5-vl-72b')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)

  const selectedModel: OpenSourceModel =
    OPEN_SOURCE_MODELS.find((m) => m.id === selectedModelId) ?? OPEN_SOURCE_MODELS[0]

  const categories = ['All', 'Vision-Language', 'Code & Structure', 'Reasoning & MoE', 'Fast Local Control']

  const filteredModels =
    categoryFilter === 'All'
      ? OPEN_SOURCE_MODELS
      : OPEN_SOURCE_MODELS.filter((m) => m.category === categoryFilter)

  // Sync to localStorage so clicking "Open SYNTHIA" will carry the selected model into the app
  const applyModelToApp = () => {
    try {
      localStorage.setItem('synthia_selected_model', selectedModel.codeConfig.modelName)
      localStorage.setItem('synthia_selected_provider', selectedModel.codeConfig.providerType)
      setApplied(true)
      setTimeout(() => setApplied(false), 2500)
    } catch {
      /* ignore */
    }
  }

  // Dynamic code snippet showing real-time replacement of the model name in code
  const codeSnippet = `// SYNTHIA Agent Runtime Configuration
import { useAgentRuntimeStore } from './store/agentRuntimeStore';

// Configuring open-source model for joint & motor control
useAgentRuntimeStore.getState().setConfig('agent_0', {
  provider: '${selectedModel.codeConfig.providerType}',
  model: '${selectedModel.codeConfig.modelName}', // Selected Open-Source Model
  endpoint: '${selectedModel.recommendedEndpoint.split(' / ')[0].toLowerCase().includes('kaggle') ? 'http://localhost:8000/infer' : 'http://localhost:11434/v1'}',
  cycleMs: ${selectedModel.codeConfig.cycleMs}, // Optimal cycle for ${selectedModel.params}
});

console.log('SYNTHIA active model set to: ${selectedModel.codeConfig.modelName}');`

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Section id="model-selector" className="py-16 md:py-24">
      <FadeContent>
        <div className="mx-auto max-w-5xl">
          {/* Header section */}
          <div className="text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal/20 bg-teal/5 px-3.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-teal">
              <Cpu size={14} />
              Open-Source Model Selector
            </div>
            <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
              Choose your open-source brain.
              <br />
              <span className="text-ink-muted">Tailored for joint precision & stress resistance.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-ink-muted sm:text-lg">
              SYNTHIA supports any OpenAI-compatible open-source model. Select a model below to inspect its joint control performance, instruction adherence, and live code configuration.
            </p>
          </div>

          {/* Model selection bar */}
          <div className="mt-10 rounded-2xl border border-ink/10 bg-surface-elevated p-6 shadow-sm sm:p-8">
            {/* Category tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 pb-5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                    categoryFilter === cat
                      ? 'bg-ink text-white shadow-sm'
                      : 'bg-surface text-ink-muted hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Selector Dropdown & Info Grid */}
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              {/* Left Column: Dropdown & Specs */}
              <div className="space-y-6 lg:col-span-6">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    Select Open-Source Model
                  </label>
                  <div className="relative">
                    <select
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-ink/15 bg-surface px-4 py-3.5 pr-10 text-sm font-medium text-ink shadow-sm transition-all hover:border-ink/30 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                    >
                      {filteredModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.params}) — {m.category}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={18}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                  </div>
                </div>

                {/* Model Characteristics Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-ink/10 bg-surface p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-amber-500">
                      <Sparkles size={14} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Joint Rating</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-ink">
                      {selectedModel.jointControlRating.toFixed(1)} / 5.0
                    </p>
                  </div>

                  <div className="rounded-xl border border-ink/10 bg-surface p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-teal">
                      <ShieldCheck size={14} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Adherence</span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-ink">
                      {selectedModel.instructionAdherence}
                    </p>
                  </div>

                  <div className="col-span-2 rounded-xl border border-ink/10 bg-surface p-3.5 text-center sm:col-span-1">
                    <div className="flex items-center justify-center gap-1 text-emerald-600">
                      <Zap size={14} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Stress Capacity</span>
                    </div>
                    <p className="mt-1 text-base font-bold text-ink">
                      {selectedModel.stressHandling}
                    </p>
                  </div>
                </div>

                {/* Model Description */}
                <div className="rounded-xl border border-ink/10 bg-surface p-4 text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Model Profile: </span>
                  {selectedModel.description}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-ink-faint">
                    <span className="rounded bg-ink/5 px-2 py-0.5">Params: {selectedModel.params}</span>
                    <span className="rounded bg-ink/5 px-2 py-0.5">Endpoint: {selectedModel.recommendedEndpoint}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Code Snippet & Action Controls */}
              <div className="flex flex-col justify-between space-y-4 rounded-xl border border-white/10 bg-surface-dark p-5 text-white shadow-inner lg:col-span-6">
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-white/70">
                      <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                      agentRuntimeConfig.ts
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <pre className="mt-4 overflow-x-auto font-mono text-xs leading-relaxed text-white/90">
                    <code>{codeSnippet}</code>
                  </pre>
                </div>

                {/* Action buttons */}
                <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={applyModelToApp}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-xs font-semibold text-white shadow transition-all hover:bg-teal-dark"
                  >
                    {applied ? <Check size={16} /> : <Cpu size={16} />}
                    {applied ? 'Saved as Default!' : `Use ${selectedModel.name} in App`}
                  </button>
                  <a
                    href={siteConfig.appUrl}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    Launch SYNTHIA
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FadeContent>
    </Section>
  )
}

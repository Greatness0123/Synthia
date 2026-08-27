import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronDown, Check, Copy, Terminal, } from 'lucide-react'

interface KaggleModel {
  id: string
  name: string
  tag: string
  huggingFaceId: string
  kaggleDataset: string | null
}

const KAGGLE_MODELS: KaggleModel[] = [
  {
    id: 'qwen25-vl-3b',
    name: 'Qwen2.5-VL-3B-Instruct',
    tag: 'Default · Lightweight',
    huggingFaceId: 'Qwen/Qwen2.5-VL-3B-Instruct',
    kaggleDataset: '/kaggle/input/qwen2.5-vl/transformers/3b-instruct/1',
  },
  {
    id: 'qwen25-vl-7b',
    name: 'Qwen2.5-VL-7B-Instruct',
    tag: 'Higher Precision',
    huggingFaceId: 'Qwen/Qwen2.5-VL-7B-Instruct',
    kaggleDataset: null,
  },
  {
    id: 'qwen25-vl-32b',
    name: 'Qwen2.5-VL-32B-Instruct',
    tag: 'Maximum Accuracy',
    huggingFaceId: 'Qwen/Qwen2.5-VL-32B-Instruct',
    kaggleDataset: null,
  },
  {
    id: 'llama32-11b-vision',
    name: 'Llama-3.2-11B-Vision-Instruct',
    tag: 'Meta Vision',
    huggingFaceId: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
    kaggleDataset: null,
  },
  {
    id: 'llama32-90b-vision',
    name: 'Llama-3.2-90B-Vision-Instruct',
    tag: 'Large Parameter',
    huggingFaceId: 'meta-llama/Llama-3.2-90B-Vision-Instruct',
    kaggleDataset: null,
  },
  {
    id: 'mistral-small-24b',
    name: 'Mistral-Small-3.1-24B-Instruct',
    tag: 'Low Latency',
    huggingFaceId: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503',
    kaggleDataset: null,
  },
  {
    id: 'phi35-vision',
    name: 'Phi-3.5-Vision-Instruct',
    tag: 'Ultra-Compact',
    huggingFaceId: 'microsoft/Phi-3.5-vision-instruct',
    kaggleDataset: null,
  },
]

interface KaggleScriptViewerProps {
  baseScript: string
  filename?: string
  maxHeight?: string
}

/**
 * Lightweight syntax highlighter for Python snippets with MODEL_PATH highlighting.
 */
function renderHighlightedCode(code: string, activeModelName: string) {
  const lines = code.split('\n')

  return lines.map((line, idx) => {
    const isModelLine = line.includes('MODEL_PATH = "') || line.includes('MODEL_PATH = \'')
    const isComment = line.trim().startsWith('#')

    return (
      <div
        key={idx}
        className={`flex px-4 py-0.5 leading-6 transition-colors font-mono text-xs sm:text-[13px] ${
          isModelLine
            ? 'bg-teal/15 border-l-2 border-teal-soft -ml-[2px]'
            : 'hover:bg-white/[0.02]'
        }`}
      >
        {/* Line number gutter */}
        <span className="w-10 select-none text-right pr-4 text-white/20 shrink-0">
          {idx + 1}
        </span>

        {/* Code line content */}
        <span className="flex-1 whitespace-pre overflow-x-visible">
          {isComment ? (
            <span className="text-white/40 italic">{line}</span>
          ) : isModelLine ? (
            <span>
              <span className="text-[#e5c07b] font-semibold">MODEL_PATH</span>
              <span className="text-white/70"> = </span>
              <span className="text-[#98c379] font-semibold underline decoration-teal/50 decoration-2 underline-offset-4">
                "{activeModelName}"
              </span>
            </span>
          ) : (
            colorizePythonTokens(line)
          )}
        </span>
      </div>
    )
  })
}

function colorizePythonTokens(line: string) {
  const tokens = line.split(/(".*?"|'.*?'|#.*|\b(?:import|from|def|class|return|if|else|elif|try|except|as|in|is|not|and|or|for|while|with|print|None|True|False|async|await)\b|\b\d+\b)/g)

  const keywords = new Set([
    'import', 'from', 'def', 'class', 'return', 'if', 'else', 'elif', 'try',
    'except', 'as', 'in', 'is', 'not', 'and', 'or', 'for', 'while', 'with',
    'print', 'None', 'True', 'False', 'async', 'await'
  ])

  return tokens.map((token, i) => {
    if (!token) return null
    if (token.startsWith('#')) {
      return <span key={i} className="text-white/40 italic">{token}</span>
    }
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return <span key={i} className="text-[#98c379]">{token}</span>
    }
    if (keywords.has(token)) {
      return <span key={i} className="text-[#c678dd] font-medium">{token}</span>
    }
    if (/^\d+$/.test(token)) {
      return <span key={i} className="text-[#d19a66]">{token}</span>
    }
    return <span key={i} className="text-[#abb2bf]">{token}</span>
  })
}

export function KaggleScriptViewer({
  baseScript,
  filename = 'kaggle_new.py',
  maxHeight = '28rem',
}: KaggleScriptViewerProps) {
  const [selectedId, setSelectedId] = useState<string>('qwen25-vl-3b')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedModel = KAGGLE_MODELS.find((m) => m.id === selectedId) ?? KAGGLE_MODELS[0]

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Patch MODEL_PATH in the script dynamically
  const patchedScript = useMemo(() => {
    return baseScript
      .replace(
        /MODEL_PATH\s*=\s*["'][^"']+["']/,
        `MODEL_PATH = "${selectedModel.huggingFaceId}"`
      )
      .replace(
        /if os\.path\.exists\(["'][^"']*["']\):\s*\n\s*MODEL_PATH\s*=\s*["'][^"']+["']/,
        selectedModel.kaggleDataset
          ? `if os.path.exists("${selectedModel.kaggleDataset}"):\n        MODEL_PATH = "${selectedModel.kaggleDataset}"`
          : `# No pre-uploaded Kaggle dataset for this model; downloads from HuggingFace`
      )
  }, [baseScript, selectedModel])

  async function handleCopy() {
    await navigator.clipboard.writeText(patchedScript)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/15 bg-[#0f0f0e] shadow-2xl transition-all">
      {/* ── IDE Top Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#161615] px-4 py-3 sm:px-5">
        {/* Window controls & file tab */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]/90 shadow-sm" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]/90 shadow-sm" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]/90 shadow-sm" />
          </div>
          <div className="ml-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1 border border-white/8">
            <Terminal size={14} className="text-teal-soft" />
            <span className="font-mono text-xs font-medium text-white/80">{filename}</span>
          </div>
        </div>

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/15 hover:shadow active:scale-95"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied Full Script!</span>
            </>
          ) : (
            <>
              <Copy size={14} className="text-white/70" />
              <span>Copy Script</span>
            </>
          )}
        </button>
      </div>

      {/* ── Custom Model Selector Bar (Custom React Dropdown) ── */}
      <div className="border-b border-white/10 bg-[#131312] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-white/70 shrink-0">
            <span>Target Model:</span>
          </div>

          {/* Custom Dropdown Component */}
          <div className="relative flex-1 min-w-[260px] max-w-md" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/8 px-3.5 py-2 text-left text-sm font-medium text-white shadow-inner transition-all hover:border-teal-soft/60 focus:border-teal-soft focus:outline-none focus:ring-2 focus:ring-teal-soft/20 cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="truncate text-white font-medium">{selectedModel.name}</span>
                <span className="hidden sm:inline rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">
                  {selectedModel.tag}
                </span>
              </div>
              <ChevronDown
                size={15}
                className={`text-white/60 transition-transform duration-200 shrink-0 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Floating Options Menu */}
            {dropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-white/15 bg-[#181817] p-1.5 shadow-2xl backdrop-blur-xl">
                {KAGGLE_MODELS.map((m) => {
                  const isSelected = m.id === selectedId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(m.id)
                        setDropdownOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-teal/15 text-teal-soft font-semibold'
                          : 'text-white/80 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-white">{m.name}</span>
                        <span className="text-[11px] text-white/40">{m.tag}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-teal-soft shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* <span className="text-xs text-white/40 hidden md:inline">
            Updates <code className="text-teal-soft font-mono">MODEL_PATH</code> live below
          </span> */}
        </div>
      </div>

      {/* ── Syntax Highlighted Code Viewer ── */}
      <div
        className="overflow-auto py-3 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
      >
        {renderHighlightedCode(patchedScript, selectedModel.huggingFaceId)}
      </div>
    </div>
  )
}

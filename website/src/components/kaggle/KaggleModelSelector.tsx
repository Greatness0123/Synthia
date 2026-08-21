import { useState } from 'react'
import { ChevronDown, Copy, Check, Cpu } from 'lucide-react'

interface KaggleModel {
  id: string
  name: string
  params: string
  huggingFaceId: string
  kaggleDataset: string | null
  description: string
  vram: string
  speed: 'Fastest' | 'Fast' | 'Medium' | 'Slower'
  jointRating: string
  instructionAdherence: string
}

const KAGGLE_MODELS: KaggleModel[] = [
  {
    id: 'qwen25-vl-3b',
    name: 'Qwen2.5-VL-3B-Instruct',
    params: '3B',
    huggingFaceId: 'Qwen/Qwen2.5-VL-3B-Instruct',
    kaggleDataset: '/kaggle/input/qwen2.5-vl/transformers/3b-instruct/1',
    description: 'Default model — fits comfortably in 16GB VRAM (T4 x2) with 4-bit quantization. Fast inference, good visual joint parsing.',
    vram: '~8GB (4-bit)',
    speed: 'Fastest',
    jointRating: '4.2 / 5',
    instructionAdherence: '93.5%',
  },
  {
    id: 'qwen25-vl-7b',
    name: 'Qwen2.5-VL-7B-Instruct',
    params: '7B',
    huggingFaceId: 'Qwen/Qwen2.5-VL-7B-Instruct',
    kaggleDataset: null,
    description: 'Strong 7B vision model with noticeably better joint angle precision and instruction comprehension than the 3B variant.',
    vram: '~12GB (4-bit)',
    speed: 'Fast',
    jointRating: '4.5 / 5',
    instructionAdherence: '94.7%',
  },
  {
    id: 'qwen25-vl-32b',
    name: 'Qwen2.5-VL-32B-Instruct',
    params: '32B',
    huggingFaceId: 'Qwen/Qwen2.5-VL-32B-Instruct',
    kaggleDataset: null,
    description: 'Top-tier open-source vision model. Use with T4 x2 (4-bit, aggressive offload) or P100. Best spatial reasoning and motor control.',
    vram: '~28GB (4-bit, T4 x2)',
    speed: 'Medium',
    jointRating: '4.9 / 5',
    instructionAdherence: '97.8%',
  },
  {
    id: 'llama32-11b-vision',
    name: 'Llama-3.2-11B-Vision-Instruct',
    params: '11B',
    huggingFaceId: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
    kaggleDataset: null,
    description: "Meta's lightweight vision model. Solid instruction following and good speed on T4 x2. Requires HuggingFace token.",
    vram: '~14GB (4-bit)',
    speed: 'Fast',
    jointRating: '4.4 / 5',
    instructionAdherence: '94.2%',
  },
  {
    id: 'llama32-90b-vision',
    name: 'Llama-3.2-90B-Vision-Instruct',
    params: '90B',
    huggingFaceId: 'meta-llama/Llama-3.2-90B-Vision-Instruct',
    kaggleDataset: null,
    description: 'Best Llama vision model. Requires aggressive 4-bit quantization and careful VRAM management on T4 x2. Excellent spatial comprehension.',
    vram: '~48GB (4-bit, T4 x2 tight)',
    speed: 'Slower',
    jointRating: '4.8 / 5',
    instructionAdherence: '96.8%',
  },
  {
    id: 'mistral-small-24b',
    name: 'Mistral-Small-3.1-24B-Instruct',
    params: '24B',
    huggingFaceId: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503',
    kaggleDataset: null,
    description: 'Efficient 24B open model with very low latency. High instruction adherence and clean JSON joint output. Runs well on T4 x2 at 4-bit.',
    vram: '~20GB (4-bit)',
    speed: 'Fast',
    jointRating: '4.6 / 5',
    instructionAdherence: '95.9%',
  },
  {
    id: 'phi35-vision',
    name: 'Phi-3.5-Vision-Instruct',
    params: '3.8B',
    huggingFaceId: 'microsoft/Phi-3.5-vision-instruct',
    kaggleDataset: null,
    description: "Microsoft's ultra-compact vision model. Extremely fast on T4 x2, useful when quick motor-loop iteration matters more than precision.",
    vram: '~6GB (4-bit)',
    speed: 'Fastest',
    jointRating: '4.1 / 5',
    instructionAdherence: '91.5%',
  },
]

const speedColor: Record<KaggleModel['speed'], string> = {
  Fastest: 'bg-emerald-100 text-emerald-700',
  Fast: 'bg-teal-100 text-teal-700',
  Medium: 'bg-amber-100 text-amber-700',
  Slower: 'bg-orange-100 text-orange-700',
}

export function KaggleModelSelector() {
  const [selectedId, setSelectedId] = useState<string>('qwen25-vl-3b')
  const [copied, setCopied] = useState(false)

  const model = KAGGLE_MODELS.find((m) => m.id === selectedId) ?? KAGGLE_MODELS[0]

  // Build the MODEL_PATH block as it would look in kaggle_new.py
  const codeSnippet = `MODEL_PATH = "${model.huggingFaceId}"
${
  model.kaggleDataset
    ? `if os.path.exists("${model.kaggleDataset}"):
    MODEL_PATH = "${model.kaggleDataset}"\n`
    : `# No pre-uploaded Kaggle dataset — downloads from HuggingFace on first run\n`
}
print(f"Loading model from: {MODEL_PATH}")`

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-8 rounded-2xl border border-ink/10 bg-surface-elevated p-5 shadow-sm sm:p-7">
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/10">
          <Cpu size={17} className="text-teal" />
        </div>
        <div>
          <p className="font-medium text-ink">Choose your open-source model</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Select a model to see how the{' '}
            <code className="rounded bg-surface-card px-1.5 py-0.5 text-xs">MODEL_PATH</code> line
            in <code className="rounded bg-surface-card px-1.5 py-0.5 text-xs">kaggle_new.py</code>{' '}
            should look. All models use 4-bit quantization for Kaggle's free GPU tier.
          </p>
        </div>
      </div>

      {/* Dropdown */}
      <div className="relative mb-5">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none rounded-xl border border-ink/15 bg-surface px-4 py-3.5 pr-10 text-sm font-medium text-ink shadow-sm transition-all hover:border-ink/30 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        >
          {KAGGLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.params}) — {m.speed}
            </option>
          ))}
        </select>
        <ChevronDown
          size={17}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>

      {/* Model stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-ink/8 bg-surface p-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Parameters</p>
          <p className="mt-1 text-base font-bold text-ink">{model.params}</p>
        </div>
        <div className="rounded-xl border border-ink/8 bg-surface p-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">VRAM</p>
          <p className="mt-1 text-base font-bold text-ink">{model.vram}</p>
        </div>
        <div className="rounded-xl border border-ink/8 bg-surface p-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Joint Rating</p>
          <p className="mt-1 text-base font-bold text-ink">{model.jointRating}</p>
        </div>
        <div className="rounded-xl border border-ink/8 bg-surface p-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Adherence</p>
          <p className="mt-1 text-base font-bold text-ink">{model.instructionAdherence}</p>
        </div>
      </div>

      {/* Description + speed badge */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ink/8 bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        <p className="flex-1">{model.description}</p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${speedColor[model.speed]}`}
        >
          {model.speed}
        </span>
      </div>

      {/* Code snippet */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-dark">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="font-mono text-xs text-white/50">kaggle_new.py — MODEL_PATH block</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/20"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-white/85">
          <code>{codeSnippet}</code>
        </pre>
      </div>

      {!model.kaggleDataset && (
        <p className="mt-3 text-xs text-ink-faint">
          ⚠️ This model has no pre-uploaded Kaggle dataset — first run will download from Hugging
          Face (~several GB). Add it as a Kaggle dataset input to skip the download.
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodeArtifactProps {
  code: string
  filename?: string
  language?: string
  className?: string
  maxHeight?: string
}

export function CodeArtifact({
  code,
  filename,
  language = 'python',
  className,
  maxHeight = '28rem',
}: CodeArtifactProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-ink/10 bg-[#141413] shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-teal-soft/80" />
          {filename && (
            <span className="ml-2 font-mono text-xs text-white/50">{filename}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="overflow-auto p-4 font-mono text-xs leading-relaxed text-white/85 sm:text-sm"
        style={{ maxHeight }}
      >
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  )
}

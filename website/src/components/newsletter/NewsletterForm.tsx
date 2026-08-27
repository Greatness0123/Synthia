import { useState, useRef } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewsletterFormProps {
  label?: string
  placeholder?: string
  buttonText?: string
  source?: string
  className?: string
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function NewsletterForm({
  label,
  placeholder = 'you@example.com',
  buttonText = 'Subscribe',
  source = 'footer-newsletter',
  className,
}: NewsletterFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('submitting')
    setMessage('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
        signal: controller.signal,
      })

      const data = await res.json()

      if (data.ok) {
        setStatus('success')
        setMessage(data.message || "You're on the list.")
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error || 'Something went wrong.')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-teal/20 bg-teal/5 px-4 py-3 text-sm text-teal',
          className,
        )}
        role="status"
      >
        <Check size={16} className="shrink-0" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn('w-full', className)} noValidate>
      {label && (
        <label
          htmlFor={`newsletter-email-${source}`}
          className="mb-2 block text-sm font-medium text-ink-muted"
        >
          {label}
        </label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`newsletter-email-${source}`}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === 'error') setStatus('idle')
          }}
          placeholder={placeholder}
          disabled={status === 'submitting'}
          required
          aria-required="true"
          aria-invalid={status === 'error'}
          aria-describedby={`newsletter-status-${source}`}
          className={cn(
            'flex-1 rounded-xl border bg-surface-elevated px-4 py-2.5 text-sm text-ink',
            'placeholder:text-ink-faint transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40',
            status === 'error' ? 'border-red-400/50' : 'border-ink/10',
          )}
        />
        <button
          type="submit"
          disabled={status === 'submitting' || !email.trim()}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-2.5',
            'text-sm font-medium text-white transition-all',
            'hover:scale-[1.02] active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {status === 'submitting' ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Subscribing…</span>
            </>
          ) : (
            <>
              <span>{buttonText}</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
      {status === 'error' && (
        <p
          id={`newsletter-status-${source}`}
          className="mt-2 text-sm text-red-500"
          role="alert"
        >
          {message}
        </p>
      )}
    </form>
  )
}

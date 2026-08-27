import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(ip) || []
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent)
    return true
  }
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return false
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Too many requests. Please try again in a minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: { email?: string; source?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Please enter a valid email address.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { error } = await resend.contacts.create({
      email,
      audienceId: AUDIENCE_ID!,
      unsubscribed: false,
    })

    if (error) {
      if (error.message?.includes('already') || error.message?.includes('duplicate')) {
        return new Response(
          JSON.stringify({ ok: false, error: "You're already subscribed." }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        )
      }
      console.error('Resend contact creation error:', error)
      return new Response(
        JSON.stringify({ ok: false, error: 'Something went wrong. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, message: "You're on the list. Watch your inbox." }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Unexpected error in subscribe handler:', err)
    return new Response(
      JSON.stringify({ ok: false, error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

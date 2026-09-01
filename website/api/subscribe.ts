import type { VercelRequest, VercelResponse } from '@vercel/node'
import dns from 'node:dns'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID
const FROM_EMAIL = process.env.RESEND_FROM

const SOCIAL_LINKS = [
  { label: 'GitHub', url: 'https://github.com/Greatness0123/synthia1.5.1', slug: 'github' },
  { label: 'X', url: 'https://x.com/Gruco_okorie', slug: 'x' },
  { label: 'Telegram', url: 'https://t.me/+IHNi6lg3PWNhNjVk', slug: 'telegram' },
  { label: 'Discord', url: 'https://discord.gg/bgw9fXHRTs', slug: 'discord' },
  { label: 'YouTube', url: 'https://www.youtube.com/@Synthia.online', slug: 'youtube' },
]

function buildWelcomeEmail(
  email: string,
): { subject: string; html: string; text: string } {
  const calLink = 'https://cal.com/greatnessokorie/15min'
  const githubUrl = 'https://github.com/Greatness0123/synthia1.5.1'
  const siteUrl = 'https://www.runsynthia.online'
  const logoUrl = 'https://www.runsynthia.online/logo.svg'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Welcome to SYNTHIA</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap');
  
  body, table, td, p, a, li, blockquote {
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }
  
  @media only screen and (max-width: 620px) {
    .wrapper { width: 100% !important; padding: 12px !important; }
    .card-body { padding: 28px 20px !important; }
    .main-heading { font-size: 28px !important; line-height: 34px !important; }
    .nav-pill { padding: 8px 16px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF9F7; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A1917; -webkit-font-smoothing: antialiased;">

  <!-- Preview Text -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Give an AI a body. Shape its world. Welcome to SYNTHIA.
  </div>

  <!-- Outer Canvas with Ambient Top Glow -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FAF9F7; background: radial-gradient(circle at 50% 0%, #F2EAD9 0%, #FAF9F7 70%); padding: 36px 12px 60px;">
    <tr>
      <td align="center">

        <!-- Main Email Container -->
        <table role="presentation" class="wrapper" width="580" cellpadding="0" cellspacing="0" border="0" style="width: 580px; max-width: 580px; margin: 0 auto;">
          
          <!-- Sleek Floating Navbar Pill -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="nav-pill" style="background-color: rgba(255, 255, 255, 0.85); border: 1px solid rgba(26, 25, 23, 0.08); border-radius: 9999px; padding: 10px 22px; box-shadow: 0 4px 20px -4px rgba(26, 25, 23, 0.05);">
                <tr>
                  <td align="center" style="vertical-align: middle;">
                    <a href="${siteUrl}" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                      <img src="${logoUrl}" alt="SYNTHIA" width="24" height="24" style="vertical-align: middle; border: 0; display: inline-block;" />
                      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 20px; font-weight: 700; color: #1A1917; vertical-align: middle; letter-spacing: -0.01em; margin-left: 6px;">SYNTHIA</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Letter Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FFFFFF; border: 1px solid rgba(26, 25, 23, 0.07); border-radius: 24px; box-shadow: 0 20px 40px -15px rgba(26, 25, 23, 0.06); overflow: hidden;">
                
                <!-- Subtle Gradient Accent Top Border -->
                <tr>
                  <td style="height: 3px; background: linear-gradient(90deg, #E8D5B0 0%, #5BA3A3 50%, #3D8B8B 100%); font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>

                <!-- Content Body -->
                <tr>
                  <td class="card-body" style="padding: 40px 36px 36px;">
                    
                    <!-- Sub-badge -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                      <tr>
                        <td style="background-color: rgba(61, 139, 139, 0.1); border-radius: 9999px; padding: 4px 12px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; color: #3D8B8B;">
                          Welcome to the list
                        </td>
                      </tr>
                    </table>

                    <!-- Editorial Headline -->
                    <h1 class="main-heading" style="margin: 0 0 22px; font-family: 'Instrument Serif', Georgia, serif; font-size: 34px; line-height: 40px; font-weight: 400; color: #1A1917; letter-spacing: -0.02em;">
                      Give an AI a body.<br />
                      Watch what happens.
                    </h1>

                    <!-- Letter Paragraphs -->
                    <p style="margin: 0 0 18px; font-size: 15px; line-height: 25px; color: #4A4740;">
                      Hey there,
                    </p>

                    <p style="margin: 0 0 18px; font-size: 15px; line-height: 25px; color: #4A4740;">
                      Thank you for subscribing to SYNTHIA. I wanted to reach out personally because early adopters and researchers like you shape the future of what we build.
                    </p>

                    <p style="margin: 0 0 18px; font-size: 15px; line-height: 25px; color: #4A4740;">
                      SYNTHIA is built around a single premise: <strong style="color: #1A1917; font-weight: 600;">AI minds need physical bodies</strong>. By giving multimodal models real-time vision, proprioception, and physics simulation right inside the browser, we enable agents to learn, adapt, and build motor memory without expensive GPU clusters.
                    </p>

                    <p style="margin: 0 0 24px; font-size: 15px; line-height: 25px; color: #4A4740;">
                      As part of this list, you will receive early releases, roadmap updates, and behind-the-scenes research insights as we progress toward custom 3D avatars and 24/7 cloud persistence.
                    </p>

                    <!-- Founder Callout Box -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, rgba(242, 234, 217, 0.35) 0%, rgba(224, 242, 241, 0.45) 100%); border: 1px solid rgba(61, 139, 139, 0.15); border-radius: 16px; margin: 24px 0 28px; padding: 24px;">
                      <tr>
                        <td>
                          <p style="margin: 0 0 14px; font-family: 'Instrument Serif', Georgia, serif; font-size: 20px; line-height: 26px; color: #1A1917; font-weight: 600;">
                            Have an idea, question, or research feedback?
                          </p>
                          <p style="margin: 0 0 18px; font-size: 14px; line-height: 22px; color: #4A4740;">
                            I would love to hear how you plan to use SYNTHIA or what features you want to see next. You can reply directly to this email or book a quick 1-on-1 chat.
                          </p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="background-color: #1A1917; border-radius: 10px; box-shadow: 0 4px 12px rgba(26, 25, 23, 0.15);">
                                <a href="${calLink}" target="_blank" style="display: inline-block; padding: 11px 22px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 10px;">
                                  Book 15 mins with Greatness &rarr;
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Signature -->
                    <p style="margin: 0 0 4px; font-size: 15px; line-height: 24px; color: #4A4740;">
                      Glad to have you with us on this journey,
                    </p>
                    <p style="margin: 0 0 2px; font-family: 'Instrument Serif', Georgia, serif; font-size: 20px; font-weight: 700; color: #1A1917;">
                      Greatness Okorie
                    </p>
                    <p style="margin: 0; font-size: 13px; font-weight: 500; color: #3D8B8B;">
                      Founder &amp; Builder, SYNTHIA
                    </p>

                  </td>
                </tr>

                <!-- Community Links Footer Section -->
                <tr>
                  <td style="background-color: #FAF9F7; border-top: 1px solid rgba(26, 25, 23, 0.06); padding: 26px 36px; text-align: center;">
                    <p style="margin: 0 0 16px; font-size: 13px; color: #736E65; font-weight: 500;">
                      Star the open source repository on <a href="${githubUrl}" target="_blank" style="color: #3D8B8B; text-decoration: underline; font-weight: 600;">GitHub</a>
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                      <tr>
                        ${SOCIAL_LINKS.map(
                          (s) => `
                          <td align="center" style="padding: 0 6px;">
                            <a href="${s.url}" target="_blank" title="${s.label}" style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background-color: #EFECE6; border: 1px solid rgba(26, 25, 23, 0.06); border-radius: 50%; text-decoration: none;">
                              <img src="https://cdn.simpleicons.org/${s.slug}/4A4740" alt="${s.label}" width="16" height="16" style="vertical-align: middle; border: 0; width: 16px; height: 16px; display: inline-block; margin-top: 10px;" />
                            </a>
                          </td>
                        `,
                        ).join('')}
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Subtle Legal / Unsubscribe Footer -->
          <tr>
            <td align="center" style="padding-top: 24px; font-size: 12px; line-height: 18px; color: #9E998F; text-align: center;">
              <p style="margin: 0 0 6px;">
                You are receiving this because you subscribed at <a href="${siteUrl}" style="color: #736E65; text-decoration: none;">runsynthia.online</a>.
              </p>
              <p style="margin: 0;">
                <a href="{{{unsubscribe_url}}}" style="color: #9E998F; text-decoration: underline;">Unsubscribe</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="{{{preferences_url}}}" style="color: #9E998F; text-decoration: underline;">Preferences</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`

  const socialText = SOCIAL_LINKS.map((s) => `${s.label}: ${s.url}`).join('\n')

  const text = `Welcome to SYNTHIA

Give an AI a body. Watch what happens.

Hey there,

Thank you for subscribing to SYNTHIA. I wanted to reach out personally because early adopters and researchers like you shape the future of what we build.

SYNTHIA is built around a single premise: AI minds need physical bodies. By giving multimodal models real-time vision, proprioception, and physics simulation right inside the browser, we enable agents to learn, adapt, and build motor memory without expensive GPU clusters.

As part of this list, you will receive early releases, roadmap updates, and behind-the-scenes research insights as we progress toward custom 3D avatars and 24/7 cloud persistence.

Have an idea, question, or research feedback?
I would love to hear how you plan to use SYNTHIA or what features you want to see next. You can reply directly to this email or book a quick 1-on-1 chat with me:
${calLink}

Glad to have you with us on this journey,

Greatness Okorie
Founder & Builder, SYNTHIA

Follow the project:
${socialText}

Star the open-source repository on GitHub:
${githubUrl}

You are receiving this email because you subscribed at ${siteUrl}.
Unsubscribe: {{{unsubscribe_url}}}
Update preferences: {{{preferences_url}}}
`

  return {
    subject: 'Welcome to SYNTHIA — AI minds with bodies',
    html,
    text,
  }
}

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

async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await dns.promises.resolveMx(domain)
    return records && records.length > 0
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again in a minute.' })
  }

  const email = req.body?.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' })
  }

  const domain = email.split('@')[1]
  if (!(await hasMxRecords(domain))) {
    return res.status(400).json({ ok: false, error: 'This email domain does not accept mail.' })
  }

  if (!process.env.RESEND_API_KEY || !AUDIENCE_ID) {
    console.error('Missing env vars:', {
      hasApiKey: !!process.env.RESEND_API_KEY,
      hasAudienceId: !!AUDIENCE_ID,
    })
    return res.status(500).json({ ok: false, error: 'Server configuration error. Please try again later.' })
  }

  try {
    const { error } = await resend.contacts.create({
      email,
      audienceId: AUDIENCE_ID,
      unsubscribed: false,
    })

    if (error) {
      if (error.message?.includes('already') || error.message?.includes('duplicate')) {
        return res.status(409).json({ ok: false, error: "You're already subscribed." })
      }
      console.error('Resend contact creation error:', error)
      return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' })
    }

    if (FROM_EMAIL) {
      const welcomeEmail = buildWelcomeEmail(email)
      const { error: emailError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
        text: welcomeEmail.text,
      })
      if (emailError) {
        console.error('Welcome email error:', emailError)
      }
    }

    return res.status(200).json({ ok: true, message: "You're on the list. Watch your inbox." })
  } catch (err) {
    console.error('Unexpected error in subscribe handler:', err)
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' })
  }
}

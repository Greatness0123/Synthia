export const siteConfig = {
  name: 'SYNTHIA',
  tagline: 'The first browser-based embodiment application for artificial intelligence.',
  url: 'https://synthia.online',
  repoUrl: 'https://github.com/Greatness0123/synthia1.5.1',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  demoVideoUrl: import.meta.env.VITE_DEMO_VIDEO_URL ?? '',
  builderName: 'Greatness Okorie',
  builderPortfolioUrl: 'https://greatnessokorie.vercel.app',
  license: 'MIT',
  calcomUrl: 'https://cal.com/greatnessokorie/15min',
  githubOwner: 'Greatness0123',
  githubRepo: 'synthia1.5.1',
  social: [
    {
      label: 'GitHub',
      href: import.meta.env.VITE_SOCIAL_GITHUB ?? 'https://github.com/Greatness0123/synthia1.5.1',
      icon: 'github' as const,
    },
    {
      label: 'Telegram',
      href: import.meta.env.VITE_SOCIAL_TELEGRAM ?? 'https://t.me/+IHNi6lg3PWNhNjVk',
      icon: 'telegram' as const,
    },
    {
      label: 'X (Twitter)',
      href: import.meta.env.VITE_SOCIAL_X ?? 'https://x.com/Gruco_okorie',
      icon: 'x' as const,
    },
    {
      label: 'Discord',
      href: import.meta.env.VITE_SOCIAL_DISCORD ?? 'https://discord.gg/bgw9fXHRTs',
      icon: 'discord' as const,
    },
    {
      label: 'YouTube',
      href: import.meta.env.VITE_SOCIAL_YOUTUBE ?? 'https://www.youtube.com/@Synthia.online',
      icon: 'youtube' as const,
    },
  ],
} as const

export const heroCopy = {
  eyebrow: '',
  headline: 'Run an AI in a world.\nRight in your browser.',
  subheadline:
    'The first browser-based embodiment application for artificial intelligence. No install required, no GPU bill. Give an AI a body, shape its environment, and watch it learn.',
}

export const siteRoutes = [
  { path: '/', label: 'Home' },
  { path: '/how-it-works', label: 'How it works' },
  { path: '/memory', label: 'Memory' },
  { path: '/data', label: 'Data export' },
  { path: '/guides/kaggle', label: 'Free inference guide' },
  { path: '/roadmap', label: 'Roadmap' },
  { path: '/blog', label: 'Blog' },
] as const

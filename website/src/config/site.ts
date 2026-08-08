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
  social: [
    {
      label: 'GitHub',
      href: import.meta.env.VITE_SOCIAL_GITHUB ?? 'https://github.com/Greatness0123/synthia1.5.1',
      icon: 'github' as const,
    },
    {
      label: 'Telegram',
      href: import.meta.env.VITE_SOCIAL_TELEGRAM ?? '',
      icon: 'telegram' as const,
    },
    {
      label: 'X (Twitter)',
      href: import.meta.env.VITE_SOCIAL_X ?? '',
      icon: 'x' as const,
    },
    {
      label: 'Discord',
      href: import.meta.env.VITE_SOCIAL_DISCORD ?? '',
      icon: 'discord' as const,
    },
    {
      label: 'YouTube',
      href: import.meta.env.VITE_SOCIAL_YOUTUBE ?? '',
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

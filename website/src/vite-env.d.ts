/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string
  readonly VITE_DEMO_VIDEO_URL?: string
  readonly VITE_SOCIAL_GITHUB?: string
  readonly VITE_SOCIAL_X?: string
  readonly VITE_SOCIAL_DISCORD?: string
  readonly VITE_SOCIAL_YOUTUBE?: string
  readonly VITE_SOCIAL_TELEGRAM?: string
}

declare module '*?raw' {
  const content: string
  export default content
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

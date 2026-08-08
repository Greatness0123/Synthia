# SYNTHIA Marketing Website

The public-facing site for [synthia.online](https://synthia.online) — built as a standalone React project inside this repo.

## Stack

- **React 19 + Vite + TypeScript**
- **Tailwind CSS** — lit, plain aesthetic per brand guidelines
- **Framer Motion** — moderate animations (hero reveal, section transitions, export demo)
- **React Bits–style components** — `SplitText`, `FadeContent`, `DotPattern` (copy-paste architecture)
- **21st.dev–inspired UI** — `ShimmerButton` CTA pattern

## Pages

| Route | Purpose |
|---|---|
| `/` | Main landing — hero, three beats, what you can do, data export, differentiation, V2 vision, try it |
| `/how-it-works` | Architecture for the curious |
| `/memory` | Three-tier memory system |
| `/skills` | Ten-rung skill ladder |
| `/roadmap` | V1 vs V2 — honest roadmap |
| `/blog` | Builder-voice posts (SEO long game) |

## Development

```bash
cd website
npm install
npm run dev
```

Opens at `http://localhost:5173` by default (change port in vite if the main app is running).

## Environment

Create `.env` in this folder:

```env
# Where "Try it" buttons point (main SYNTHIA app)
VITE_APP_URL=http://localhost:5173

# Optional: 20-second demo video for "See it move"
VITE_DEMO_VIDEO_URL=
```

For production:

```env
VITE_APP_URL=https://app.synthia.online
```

## Deploy

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host. Point `synthia.online` here and the app at a subdomain or path.

## Media assets

See **`RESOURCES.md`** — you need real SYNTHIA footage for the hero and three-beat clips. Placeholders are wired; drop files into `public/media/`.

## Brand compliance

Copy and structure follow `launch-research-updated-2/05-website-design-plan.md` and `10-branding.md`. No hype words, no purple gradients, no fake social proof.

# SYNTHIA Website: What to Replace and Where to Get It

This file is your checklist for finishing the marketing site. Drop files in the paths below and set env vars. No code changes needed for most items.

---

## 1. Environment variables (`website/.env`)

Copy from `.env.example`:

| Variable | What it does | Where to get the value |
|----------|--------------|------------------------|
| `VITE_APP_URL` | All "Try it" / "Open SYNTHIA" buttons | Production app URL (e.g. `https://app.synthia.online` or your Vercel deploy). Local dev: `http://localhost:5173` |
| `VITE_DEMO_VIDEO_URL` | "See it move" button (optional) | YouTube/Vimeo link to a ~20s demo, or leave empty to scroll to three beats |
| `VITE_SOCIAL_GITHUB` | GitHub icon in header/footer | Your repo URL (default: synthia1.5.1 repo) |
| `VITE_SOCIAL_TELEGRAM` | Telegram icon | Your channel or group link, e.g. `https://t.me/yourchannel` |
| `VITE_SOCIAL_X` | X (Twitter) icon | Profile URL, e.g. `https://x.com/yourhandle` |
| `VITE_SOCIAL_DISCORD` | Discord icon | Invite link, e.g. `https://discord.gg/...` |
| `VITE_SOCIAL_YOUTUBE` | YouTube icon | Channel URL |

Icons with empty URLs are hidden automatically.

---

## 2. Hero video (Priority 1)

| File | Path |
|------|------|
| Loop video | `website/public/media/hero-loop.mp4` |
| Poster frame | `website/public/media/hero-poster.jpg` |

**How to record**

1. Run the main SYNTHIA app from the repo root: `npm run dev`
2. Open a lit room scene (not a void). Minimal UI if possible.
3. Record 10–20 seconds: character standing, looking around, one step or turn. Show natural wobble.
4. Crop with OBS, Windows Game Bar, or any screen recorder.
5. Compress with [HandBrake](https://handbrake.fr/) or [FFmpeg](https://ffmpeg.org/): H.264, 1280×720 or 1920×1080, under 5 MB, 24–30 fps.

**Why it matters:** The hero is the product. A lit room reads as "a being in a place."

---

## 3. Three beat clips (Priority 2)

All under `website/public/media/`:

| File | What to show |
|------|----------------|
| `beat-body.mp4` + `beat-body-poster.jpg` | First time standing, wobbling |
| `beat-world.mp4` + `beat-world-poster.jpg` | In a room, turning to look at something |
| `beat-agents.mp4` + `beat-agents-poster.jpg` | Two agents turning toward each other |

Specs: portrait 4:5 or 9:16, 8–15 seconds each, under 2 MB each, same lit-room look as the hero.

---

## 4. Open Graph / social share image (Priority 3)

| File | Path |
|------|------|
| OG image | `website/public/media/og-image.jpg` |

**Specs:** 1200×630 px. SYNTHIA character in a lit world. Optional headline text: "Give an AI a body and a world to live in." No purple gradients, stock robots, or wireframe brains.

Already referenced in `index.html` as `https://synthia.online/media/og-image.jpg`.

---

## 5. Favicon (Priority 4)

| File | Path |
|------|------|
| Favicon | `website/public/favicon.svg` |

Replace the default mark with a simple SYNTHIA mark (letter S in Instrument Serif, or abstract "doorway to a world"). Keep lit/plain palette: surface `#FAF9F7`, ink `#1A1917`, accent teal or amber.

---

## 6. Custom cursor

**Already enabled** in the site. No file to add.

- Component: `website/src/components/react-bits/CustomCursor.tsx`
- Mounted in: `website/src/App.tsx`
- CSS hide default cursor: `website/src/index.css` (class `custom-cursor-active` on `<html>`)

**Behavior:** Teal dot + ring on desktop. Grows on links and buttons. **Disabled** on touch/coarse pointers (phones, tablets).

**To disable:** Remove `<CustomCursor />` from `App.tsx` and remove the `custom-cursor-active` rules from `index.css`.

**To tweak colors/size:** Edit `CustomCursor.tsx` (teal border/dot classes) and spring stiffness in the same file.

---

## 7. Kaggle inference script (for users)

| File | Path |
|------|------|
| Copy-paste script | `website/src/scripts/kaggle_new.py` |

Also shown on `/guides/kaggle` in a scrollable copy box. This version **removes CLAP** to save GPU memory. Sync updates from repo root `kaggle_new.py` if you change the server, then re-copy without CLAP blocks.

---

## 8. SEO files (already in repo)

| File | Purpose |
|------|---------|
| `website/public/robots.txt` | Allow marketing site, disallow `/app` |
| `website/public/sitemap.xml` | Submit to Google Search Console + Bing Webmaster |
| Per-page meta | Updated at runtime via `PageMeta` component |

After deploy, verify at [Google Rich Results Test](https://search.google.com/test/rich-results) for FAQ/HowTo pages.

---

## 9. What NOT to use

- Stock AI/robot imagery
- Purple-to-blue gradients
- Wireframe brains or glowing neural networks
- Dark dashboard aesthetics
- `website/src/assets/hero.png` (old purple isometric art, off-brand)

---

## 10. Quick checklist

- [ ] `.env` with `VITE_APP_URL` and social links
- [ ] `hero-loop.mp4` + `hero-poster.jpg`
- [ ] Three beat videos + posters
- [ ] `og-image.jpg`
- [ ] Custom favicon (optional polish)
- [ ] Optional demo video URL
- [ ] Deploy and submit `sitemap.xml` to search consoles

Once media is in place, refresh the site. No rebuild required for static files in `public/` if you deploy those with the site.

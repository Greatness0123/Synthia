# 📊 SYNTHIA 1.5.1 COMPREHENSIVE AUDIT REPORT

**Audit date:** latest commit `c01acde` (pulled fresh). **Auditor:** SuperNinja. **Scope:** full repo sync, `website/` marketing site spun up + visually inspected, all 12 launch-research docs cross-referenced against the live site and the real app source.

* * *

## 1\. 🚀 Executive Summary & Site Status

-   **Local Server Test:** **PASS (with one environmental caveat).**
    -   `cd website && npm install` → clean (121 packages, 4s, no vulnerabilities blocking).
    -   `npm run dev` → Vite 8.2.1 ready in ~200ms, serves `http://localhost:5173/` with **HTTP 200** and full client render.
    -   `npm run build` → **PASS**, `tsc -b && vite build` completed in **1.34s with zero TypeScript errors**. Output: `index.js` 487 KB (154 KB gzip), `index.css` 56 KB (9 KB gzip), self-hosted Instrument Serif + DM Sans woff2.
    -   **No console errors** observed on the rendered routes (`/`, `/how-it-works`).
    -   _Caveat:_ the **root** SYNTHIA app (the actual embodied-AI product) was **not** booted in this sandbox — its dev dependencies were not installed at the repo root, so a full `tsc`/run of the 3D app was out of scope for this pass. The audit of the _product_ is therefore based on source inspection (`src/world/`, `src/components/agent/`, `src/utils/`), which confirms it is a real, substantial codebase — not a mockup.
-   **Visual & Functional Overview:**
    -   The site is a **multi-page React 19 marketing app** (Home, How-it-works, Memory, Data, Skills, Roadmap, Blog, two guides). It is **not** the 3D app — there is **no Three.js/WebGL in `website/`**. The "3D" is intended to come from a **hero background video** (`hero-loop.mp4`) plus three "beat" clips.
    -   **The hero currently renders as text + gradient only.** The `<video>` element reports `readyState: 0 (HAVE_NOTHING)`, `networkState: 3 (NETWORK_NO_SOURCE)`, `videoWidth: 0`. `curl /media/hero-loop.mp4` returns `Content-Type: text/html` (the Vite SPA fallback), confirming the file is absent. The design degrades gracefully (the `onError` keeps it hidden), so it _looks_ intentional — but the central "living AI in a world" visual is simply **not there**.
    -   Design system is genuinely strong: a disciplined warm-neutral palette (`surface #FAF9F7`, `ink #1A1917`, `amber #B8860B`, `teal #3D8B8B`), Instrument Serif display + DM Sans body, scroll-driven "expanding pill" Why section, stacking step cards, an animated cognitive-loop SVG, and a device-gated custom cursor. It reads **premium, calm, and trustworthy** — not generic SaaS.
-   **Doc-to-Site Alignment Score:** **7.5 / 10.**
    -   The site was clearly written against the _same honest, de-gamified positioning_ we baked into the 12 research docs — it even uses our exact phrases ("a world where an AI mind with a body learns to live" on Roadmap/Blog; "what it is, what you can earn" on Blog; "I placed an AI in a world" as a blog title). `website/README.md` states outright: _"Copy and structure follow `launch-research-updated-2/05-website-design-plan.md` and `10-branding.md`. No hype words, no purple gradients, no fake social proof."_ The two research folders are now **byte-identical** (in sync).
    -   The 2.5-point deduction is for **(a)** a hero/primary tagline that uses a positioning line found _nowhere_ in the docs, **(b)** a handful of residual gamified/overselling phrases, and **(c)** the missing media that the docs' entire conversion strategy depends on.

* * *

## 2\. 🛡️ Strengths (What Is Already Top-Tier)

**Technical Excellence**

-   **Clean, modern, fast build.** React 19 + Vite 8 + TS 6 + Tailwind 3 + framer-motion 13. Zero-error production build in ~1.3s. Sensible dependency footprint (no bloat, no jQuery-era baggage).
-   **Real SEO hygiene.** Per-route `PageMeta` with OpenGraph/Twitter cards, canonical URLs, `theme-color`, and **JSON-LD structured data** (`SoftwareApplication` on Home, `FAQPage` on How-it-works). `robots.txt` + `sitemap.xml` present. This is rare discipline for an indie launch page.
-   **Genuinely impressive engineering credibility to point at.** The _actual app_ source contains a **pure-browser Apache Parquet v1 writer** (`src/utils/parquetWriter.ts`, ~400 lines, hand-rolled Thrift footer) and a `clientDatasetExporter.ts` that does **JSONL + CSV + Parquet + LeRobot + per-agent ZIP** entirely client-side. The website's "1-click export" claim is **backed by real code** — and in fact _undersells_ it.
-   **Craft details done right.** `CustomCursor` is gated behind `window.matchMedia('(pointer: coarse)')` so it never breaks touch devices. `CognitiveLoopDiagram` is a hand-built animated SVG with a traveling pulse along the Perceive→Decide→Act→Remember loop. Self-hosted fonts (no Google Fonts render-blocking / GDPR exposure).

**Messaging Alignment**

-   **The honest framing survived.** Hero subhead: _"Give an AI a body, shape its environment, and watch it learn."_ No "build a character," no "the AI waves at you," no sentience claims. This is exactly the de-gamified, non-overselling voice we set in the docs.
-   **How-it-works is the standout page.** It names **real source files** (`ObservationBuilder.ts`, `InferenceClient.ts`, `MotorController.ts`, `memoryManager.ts`), explains the `setInterval` cognitive loop in plain language, and answers the privacy question head-on ("Does anyone see what my AI is thinking? No."). This is the most trustworthy, builder-credible page on the site.
-   **The comparison table is honest and specific.** "~80-joint humanoid with physical WASM engine," "Inject thoughts to play Devil's Advocate," "3-tier persistent memory" — concrete, checkable, not marketing fog.
-   **Skill ladder matches the docs exactly** (10 rungs: Static Balance → Full Autonomy).

* * *

## 3\. ⚠️ Weaknesses & Critical Gaps

**UI/UX Friction**

-   **The hero has no product in it.** The single most important asset — live footage of an embodied AI standing/wobbling in a lit room — is **missing**. First impression is "elegant text page," not "holy shit, there's a living thing in my browser." For a product whose entire pitch is _visual_, a text-only hero is the biggest conversion leak on the site.
-   **Social preview is broken.** `og-image.jpg` is absent, so every X/Twitter/LinkedIn/Discord share renders a **blank/link-only card**. This directly suppresses the X/HN virality the launch depends on.
-   **Dead social links.** Header/footer Telegram → `https://t.me/+placeholder`, Discord → `https://discord.gg/placeholder`. These are clickable dead ends (they should auto-hide when blank, but they're hardcoded placeholder strings, so they render).
-   **CTA loop-back risk.** With no `.env`, `VITE_APP_URL` defaults to `http://localhost:5173`, so **every "It's Free" / "Open SYNTHIA" button points back at the marketing site itself.** In a default deploy the primary CTA goes nowhere.
-   **Bundle is heavy for a content site.** 487 KB JS (154 KB gzip) for a page with no 3D and no route-level code-splitting. On mid-tier mobile this delays Time-to-Interactive. Not fatal, but there's easy headroom.

**Content Disconnect (doc promise vs. site)**

-   **Tagline drift.** The docs' canonical line is **"a world where an AI mind with a body learns to live."** The site's primary tagline/H1 is **"The first browser-based embodiment application for artificial intelligence"** — a phrase that appears **nowhere** in the 12 docs. Meanwhile the site _does_ use the canonical line on the Roadmap and Blog page descriptions, so the site is **internally inconsistent** (hero says one thing, subpages say another).
-   **Residual gamified/overselling phrases** (the exact things we scrubbed from the docs):
    -   `GiveAnAiAWorld.tsx` step 04: **"Play becomes product."** → In doc 07 we changed this to **"Running it becomes a product."**
    -   `TryIt.tsx`: **"Then it is alive."** → borders on the "it's alive / it knows you" overselling the honesty rule forbids.
    -   `ExportAnimation.tsx`: the demo dataset is **"Sword Practice & Balance Telemetry," "Sword Strike," "Target dummy detected," "Target strike successful."** Combat/game imagery sits awkwardly against the neutral, non-game positioning.
-   **Export capability undersold.** Site says "Parquet & JSON." The app actually ships **JSONL, CSV, Parquet, LeRobot, and ZIP**. The site should claim the full, more impressive truth.

* * *

## 4\. 🛠️ Mandatory Corrections (Fix First)

-   [ ]  **Correction 1 — Ship the hero media (highest-leverage fix).** `website/public/media/` is empty (only `.gitkeep`). → Record 10–20s of the real app (lit room, AI standing/wobbling/one step), compress to H.264 ≤5 MB, and drop in:
    -   `website/public/media/hero-loop.mp4` (+ `hero-poster.jpg`)
    -   `website/public/media/og-image.jpg` (1200×630, for social cards)
    -   `website/public/media/beat-body.mp4`, `beat-mind.mp4`, `beat-world.mp4` (+ posters) per `RESOURCES.md`. Until `og-image.jpg` exists, add a **static fallback** so shares never render blank. _This one fix does more for conversion than any copy change._
-    **Correction 2 — Fix the CTA target.** `website/src/config/site.ts` → `appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'`. → Set a real production fallback so a missing env var never loops the CTA back to the marketing site:
    
    ```ts
    appUrl: import.meta.env.VITE_APP_URL ?? 'https://app.synthia.online',
    ```
    
    and add a `.env` (or CI-injected env) for every deploy. If the app isn't live yet, point the CTA at `/how-it-works` or a "Get notified" instead of a dead loop.
    
-    **Correction 3 — Remove dead social placeholders.** `website/src/config/site.ts` → change the Telegram/Discord fallbacks from `'https://t.me/+placeholder'` / `'https://discord.gg/placeholder'` to `''` (empty), so the existing "hide when empty" logic actually hides them:
    
    ```ts
    href: import.meta.env.VITE_SOCIAL_TELEGRAM ?? '',
    href: import.meta.env.VITE_SOCIAL_DISCORD ?? '',
    ```
    
-   [ ]  **Correction 4 — De-gamify the three residual phrases.**
    -   `website/src/components/home/GiveAnAiAWorld.tsx` step 04 body: `"Play becomes product."` → `"Running it becomes a product."`
    -   `website/src/components/home/TryIt.tsx` H2: `"Then it is alive."` → `"Then it is running."` (or "Then it's in its world.")
    -   `website/src/components/home/ExportAnimation.tsx`: re-skin the demo from "Sword Practice / Target dummy / Target strike" to a neutral task, e.g. **"Balance & Reach Telemetry," "Object detected at 1.4m," "Grasp successful. Balance index 0.96."**
-    **Correction 5 — Resolve the tagline (one canonical line, everywhere).** Pick a single primary tagline and apply it to `site.ts` `tagline`, the `index.html` `<title>`/meta/OG, and the Home `PageMeta`. Recommended (matches the docs and the site's own subpages):
    
    > **"A world where an AI mind with a body learns to live."** Keep the _functional_ line "Run an AI in a world, right in your browser" as the **hero H1** (it's a great action headline), but make the _descriptive_ tagline consistent. Right now "browser-based embodiment application" is a third, orphaned positioning.
    

* * *

## 5\. 🔄 Strategic Modifications (Refinements)

**Copywriting Tweaks**

-   **Hero subhead — claim the full export truth.** Current: _"...watch it learn."_ → _"...watch it learn. Every session exports as a clean dataset — JSONL, CSV, Parquet, or LeRobot — that you own."_ (Accurate _and_ more impressive; turns a feature into the differentiator it is.)
-   **"It's Free" CTA label.** It's honest but generic and slightly bait-y. → **"Open SYNTHIA"** or **"Launch the world"** as the button text, with "Free · No install · MIT" as a micro-caption beneath. The current label reads like a pricing claim; the product is the draw.
-   **Why-section header.** "Six things you can do that no one else lets you do" is strong but long. → **"Six things only SYNTHIA lets you do."** Tighter, same punch.
-   **Add one honest expectation-setter near the CTA** (the docs' honesty rule, surfaced): a single quiet line like _"The AI doesn't know you exist. You're not building a friend — you're steering a mind in a world."_ This is the positioning that makes SYNTHIA _different_ from every "AI companion" — lean into it on the page, not just in the docs.

**Layout Restructuring**

-   **Route-level code-splitting.** `React.lazy()` each page in `src/App.tsx`/`main.tsx` so Home doesn't ship Blog/Roadmap/Guides JS. Should cut initial JS meaningfully toward ~200 KB.
-   **Preload the hero poster.** Add `<link rel="preload" as="image" href="/media/hero-poster.jpg">` once the asset exists, to protect LCP.
-   **The Why-section scroll-jack (220vh expanding pill)** is beautiful on desktop but risky on mobile — verify the `scale(14)` expansion doesn't cause horizontal overflow or jank on small screens; consider a reduced-motion / static fallback via `prefers-reduced-motion`.
-   **Comparison table on mobile** is `min-w-[720px]` with horizontal scroll — fine, but add a visible scroll affordance (fade edge or "scroll →" hint) so mobile users know there's more.

* * *

## 6\. 🔥 High-Impact Enhancements ("What Will Click")

-   **Enhancement 1 (Visual/Interactive Hook) — a _live_ hero, not a video.** The biggest "holy shit" available: embed the **actual MuJoCo-WASM sim** (or a lightweight headless build of it) as the hero background, so the visitor is watching a _real_ AI balance in real time, not a recording. The research docs (06-seo §4) currently advise _against_ live 3D above the fold for LCP/TBT reasons — that advice is correct for the full app, but a **stripped, single-agent, low-poly "hero build"** lazy-loaded after first paint (`requestIdleCallback` + dynamic `import()`) gives the mesmerize-factor without the perf hit. Blueprint: split `src/world/` into a `heroSim` entry, render at 0.5× DPR, cap at 30fps, pause when off-screen (`IntersectionObserver`). If that's too heavy for launch week, the recorded loop (Correction 1) is the acceptable floor — but live is what trends.
-   **Enhancement 2 (Developer/Researcher Delight) — an interactive "thought injection" teaser.** The single most novel, most shareable capability is **Devil's-Advocate thought injection**. Put a _tiny, safe, sandboxed_ version on the page: a read-only live "thought stream" panel (animated, pre-recorded, or replayed from a real exported JSONL) with one disabled-looking-but-functional input — _"Inject a thought…"_ — that, when typed into, shows how the AI's next reasoning step would pivot. Even a scripted demo of this is catnip for the HN/X builder crowd because it's a capability **no one else demos**. Pair it with a one-click **"Download a sample dataset"** (a real `.parquet`/`.jsonl` from the exporter) so researchers can _touch_ the output — that tangibility is what gets GitHub stars.
-   **Enhancement 3 (Long-Term Scalability) — turn the export story into a data flywheel page.** The `/data` page is the seed of SYNTHIA's real moat (owned embodied-AI training data). Upgrade it from "here's a feature" to "here's a market": add a concrete **dataset schema viewer** (render the actual Parquet schema from `parquetWriter.ts`), a **"what a row looks like"** live table, and a short, honest **"how people sell embodied data"** explainer that mirrors doc 07's "Running it becomes a product." Structurally, move the media pipeline to a CDN with hashed assets + `srcset`/`webp`/`avif` for the posters, and add `vite build --analyze` to CI to keep the bundle honest as the site grows.

* * *

## Appendix — Evidence Log (what was actually run)

| Check | Result |
| --- | --- |
| `git pull` | Updated to `c01acde`; added `project_info__90–95.md`, `website/`, V-HACD spawning work |
| `website npm install` | PASS (121 pkgs) |
| `website npm run dev` | PASS — Vite 8.2.1, `http://localhost:5173/` HTTP 200 |
| `website npm run build` | PASS — 1.34s, 0 TS errors, 487 KB JS / 56 KB CSS |
| Hero `<video>` state | `readyState 0`, `networkState 3`, `videoWidth 0` → **no source** |
| `curl /media/hero-loop.mp4` | `Content-Type: text/html` (SPA fallback) → **file missing** |
| `public/media/` | empty except `.gitkeep` → **hero/poster/og-image/beat clips all absent** |
| `.env` present? | **No** → `VITE_APP_URL` falls back to `localhost:5173` (CTA loop) |
| Social fallbacks | Telegram/Discord = `+placeholder` dead links |
| `launch-research-updated` vs `website/launch-research-updated-2` | **IDENTICAL** (in sync) |
| App export capability | JSONL + CSV + Parquet + LeRobot + ZIP (`clientDatasetExporter.ts`, `parquetWriter.ts`) — **site undersells it** |
| Gamified residue on site | "Play becomes product" · "Then it is alive" · "Sword Practice / Target dummy" |
| Tagline | Site hero: "browser-based embodiment application" (orphaned) vs docs/subpages: "a world where an AI mind with a body learns to live" |
# SYNTHIA — Website Edit Plan (Concrete, Actionable)

**Built for the current website in `synthia cleanup/website/` (React 19 + Vite + Tailwind + Framer Motion). This is a plan — a checklist of what to add/change, with the actual copy to use.**

---

## 1. The Big Structural Change: Add a `/researchers` Page

The current site has: `/` (landing), `/how-it-works`, `/memory`, `/skills`, `/roadmap`, `/blog`. 

**The single highest-ROI change** is moving the "complex stuff" out of the landing page and into a dedicated `/researchers` page. This does two things:
- It keeps the landing page *simple and broad* (so the general public doesn't get overwhelmed).
- It gives researchers a *credible, deep* place to disappear into (so the high-profile tier doesn't dismiss you).

### What goes on `/researchers` (the "complex stuff")

Create `/researchers` as a **technical dossier** page. Content sections (all grounded in `src`):

| Section | What to show | Sourced from |
|---|---|---|
| **Physics Core** | MuJoCo WASM, 500 Hz fixed timestep, `implicitfast` integrator, 200 solver iterations, pre-allocated 20 env slots | `PhysicsEngine.ts`, `MJCFHumanoidTemplate.ts` |
| **Humanoid Rig** | ~80 joints, 120 DOF, 15 kg pelvis capsule, 18 kg reaction mass (RMBS), per-bone servo gains, anatomical limits | `MJCFHumanoidTemplate.ts`, `motorController.ts`, `rigConstraints.ts` |
| **Balance Stack** | Road-2 (capsule PD), Road-3 (root velocity servo ≤0.15 m/s), Road-4 (COM lean-reflex + capture-step), Road-5 (reaction-mass slide rails) | `HumanoidPhysicsBinder.ts`, `ComReflexController.ts`, `ReactionMassController.ts` |
| **Sensing** | 7 channels: vision (448×448 webp), proprioception (joint state), tactile (contact forces), vestibular (tilt summary), audio, overheard speech w/ occlusion, user injection | `PayloadBuilder.ts`, `CameraManager.ts`, `ObservationBuilder.ts` |
| **The Agent Loop** | `setInterval` heartbeat, payload → LLM → action JSON → `synthia:action` → motor targets → outcome → memory | `AgentLoop.ts`, `useWorld.ts` |
| **Data Schema** | The `MemoryEntry` (s, a, r, s′, goal, reason, vision, proprioception), export to HDF5/Parquet | `memoryManager.ts`, `hdf5Writer.ts`, `parquetWriter.ts`, `clientDatasetExporter.ts` |
| **Identity** | Self-modifying name/beliefs/traits with rate-limit + audit log | `identityManager.ts` |
| **Multi-Agent** | Per-agent binders, per-agent loop overrides, StateRehydrator world rebuilds, overheard-speech tunnel | `useWorld.ts`, `StateRehydrator.ts`, `speechStore` |
| **Instrumentation** | `window.__SYNTHIA_*` hooks, 300-frame fall diagnostics ring, RMBS telemetry ring | `useWorld.ts`, `HumanoidPhysicsBinder.ts` |
| **Provider Agnostic** | 24+ providers, per-agent overrides | `connectionStore.ts`, `agentRuntimeStore.ts` |

**A really effective pattern for `/researchers`:** make it a **"How to run a reproducible experiment in 5 steps"** walkthrough. Example:

1. **Spawn** — click "+ Spawn Agent" (or call `window.synthia.spawnAgent()`).
2. **Configure** — set provider/key/model per-agent in the settings modal (`agentRuntimeStore`).
3. **Capture** — enable training mode + ET (`trainingStore.etEnabled`) to auto-define episodes.
4. **Export** — open ExportModal → choose HDF5/Parquet → download.
5. **Reproduce** — use `StateRehydrator` semantics; describe *exactly* what's instrumented so a reviewer can trust it.

---

## 2. Fix the "Why SYNTHIA" Area

**Recommendation: Do NOT keep it as six items. Do NOT reduce to one sentence either. Use a 3-item "The Why" and one "the real reason" punchline.**

### Current problem with six items:
Six feature bullets read as a *feature list*, not a *why*. Nobody remembers six. It feels like a spec sheet, not a reason to care.

### The answer: **3 core beats + 1 punchline**

**Layout:** Three short cards/rows, each with a one-line headline + 1–2 sentence body. Then a single "the real reason" line beneath.

---

### ✏️ The Copy to Use (drop-in ready)

**Section header:** *Why SYNTHIA*

**Card 1 — Real body, not a chatbot**
> *Most AI lives in a text box. SYNTHIA gives an AI an actual body — a ~80-joint humanoid with real physics, real contact forces, real balance, fingers, and a vestibular sense. It doesn't just answer; it exists.*

**Card 2 — It learns from what it does**
> *Every heartbeat, the agent records what it saw, what it reasoned, what it did, and what happened — with the reward it got. That's a labeled training episode, not a chat log. Export it to HDF5 or Parquet and keep training.*

**Card 3 — Multiple agents that change themselves**
> *Spawn several agents. They share one world, hear each other, form memories, and can literally rewrite their own personality (name, beliefs, traits) — with a reasoned, auditable edit every 5 minutes.*

---

**The punchline (the "real reason"):**

> **"SYNTHIA exists because the bottleneck in embodied AI isn't models — it's the hard, expensive work of giving an AI a body, senses, memory, and a way to turn what it does into usable data. SYNTHIA does all of that in one open browser tab."**

---

### Alternative (if you want the one-sentence version):

> **"SYNTHIA turns an AI's experience — what it saw, thought, did, and learned — into a real, labeled, exportable dataset, inside a real-physics body in your browser."**

---

### Why 3 beats + punchline works:

- **3 is the magic number** — memorable without being a wall of text.
- Each beat maps directly to a **different audience**:
  - Beat 1 → general public ("it's real, it's a body, not a chatbot")
  - Beat 2 → developers/researchers ("I can get real data out")
  - Beat 3 → people who care about multi-agent/self-modifying agents
- The **punchline** is the *emotional/strategic* anchor — it's what a skeptical researcher reads and thinks "oh, that's actually the point."

---

## 3. Other Website Edits (Quick Wins)

### 3a. The Landing Page Hero — Re-frame

The current hero reads "The first browser-based embodiment application for AI." That's *true* but doesn't create urgency.

**Recommended hero headline (A/B):**
> **"Give an AI a body, a world, and a memory. Open a browser."**

**Subheadline:**
> *"SYNTHIA is a free, open-source, browser-based AI simulation where an actual artificial intelligence lives in a real-physics humanoid body — it sees, thinks, moves, talks, remembers, and learns from everything it does. No install. No GPU bill."*

### 3b. Add a "Built to Export Data" strip (mid-page)

Because this is your *real* differentiator for the serious crowd:

> **"Don't just watch it. Keep the data. Every heartbeat produces a complete labeled episode — observation, reasoning, action, outcome, reward. Export to HDF5 or Parquet in one click."**

### 3c. Add a "For Researchers" teaser near the footer

A small link/CTA:
> **"Researchers: see the full architecture — physics core, balance stack, 7 sensing channels, memory schema, telemetry, and how to run a reproducible experiment."** → `/researchers`

### 3d. Add an honest "Body types" note (the rigor move)

Under "What you can do," a small honest line (this pre-empts the biggest researcher doubt):

> **"SYNTHIA v1 ships a full humanoid rig — ~80 joints, 120 DOF, fingers, a 15 kg pelvis, layered balance. The architecture is body-type-extensible (quadruped/arm/custom types exist in the type system), and the prompt layer already supports body-type overrides. Non-humanoid rigs are a porting effort, not a rebuild."**

### 3e. The `/roadmap` — make it honest

Current roadmap is "V1 vs V2." Good. But **explicitly add the body-type extension + non-humanoid rigs + benchmark publishing** on the roadmap so researchers see it's coming.

---

## 4. What NOT to Change

- **Keep the clean "lit" aesthetic** — no purple gradients, no glowing neural nets, no stock robots (your `RESOURCES.md` and branding guide already say this — good).
- **Keep the `HowItWorks` page** — it's good for the "explain it simply" tier.
- **Keep `memory` and `skills`** — they're clear feature pages.
- **Don't add fake social proof.** This is your biggest credibility killer. Find *real* early user quotes, or nothing.
- **Don't claim "AGI" or "the future."** (Already covered in the marketing strategy doc.)

---

## 5. The Single Highest-Value Change

If you can only do one thing: **create `/researchers` with the technical dossier + move the "complex stuff" off the landing page.** 

That one change simultaneously:
- Makes the landing page *cleaner* for the general public.
- Gives the high-profile tier a *reason to take you seriously*.
- Differentiates you from every "AI demo" website on the planet, because you're showing *actual internals* (not marketing fluff).

---

## 6. File-Level Edit Checklist

**Create:**
- [x] `website/src/pages/Researchers.tsx` (new route `/researchers`)
- [x] Add route in `website/src/App.tsx` (or the router config) → `/researchers`
- [x] Add `/researchers` to nav/footer links
- [x] Add a "For Researchers" teaser CTA on the landing page

**Edit:**
- [ ] `website/src/pages/Landing.tsx` (or `Home.tsx`):
  - Change hero headline/subheadline (use the copy above)
  - Replace the 6-item "Why SYNTHIA" with the 3-beat + punchline version
  - Add the "Built to Export Data" strip
  - Add the honest "Body types" note
  - Add "For Researchers →" teaser near footer
- [ ] `website/src/pages/Roadmap.tsx`: add "Body types / non-humanoid rigs" + "publish first benchmark" items
- [ ] `website/src/components/...` nav/footer: add `/researchers` link
- [ ] `website/index.html`: update meta description to match the new broader-but-honest framing

---

**Note:** This is a *plan*, not code. The `website` folder lives at `synthia cleanup/website/` — if you want me to actually *write* the code for these edits, I'm in Explore Mode and can't modify files beyond these docs. Switch to Act Mode and I (the main agent) can implement the changes.

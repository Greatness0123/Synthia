# SYNTHIA — Open-Source Readiness Plan
**Goal:** Turn this repo into a professional-grade, publicly adoptable open-source project.
**Scope:** Full codebase audit completed (root files, `src/`, `api/`, `server-side Python`, `website/`, configs, git state).
**Note:** Files already covered by `.gitignore` (`walkdiag1/`, `discards/`, `updates/`, `.claude/`, `.cursor/`, `node_modules/`, `dist/`) will not ship — they're excluded from this plan except where a gitignore entry is missing.

---

## 1. Verdict Summary

| Area | Status | Notes |
|---|---|---|
| Core app code quality | 🟢 Good | Clean TS, modular engine, tested physics controllers |
| Secrets hygiene | 🟡 Mostly OK | No hardcoded API keys found in `api/`; `frpc.ini` leaks infrastructure |
| Repo hygiene | 🔴 Poor | 41 internal `project_info__*.md` files, dev diaries, marketing research with contact lists |
| Standard OSS files | 🔴 Missing | No real README (current one is the untouched Vite template), no CONTRIBUTING/CODE_OF_CONDUCT/CI |
| Legal/licensing | 🟡 Attention | MIT license ✔, but Mixamo model/animation assets need attribution clarity |

---

## 2. REMOVE — files & folders that must NOT go public

### 🔴 Critical (privacy / professionalism risk)

| Path | Why remove |
|---|---|
| `project_info__70.md` … `project_info__110.md` (41 files) | Internal AI-exploration artifacts. Delete all before publishing — including the ones generated today. |
| `launch-research-updated/` (12 docs) | Private launch strategy: **creator contact lists, outreach templates, pitch decks**. Absolutely must not be public. |
| `SYNTHIA_1.5.1_AUDIT_REPORT.md` | Internal marketing/site audit with strategic commentary. |
| `noserverprompt/`, `v2update/` | Raw internal AI-planning prompts for past phases. |
| `frpc.ini` | Reveals your tunnel infrastructure (`fxtun.dev`, `synthia-brain.fxtun.dev`). Delete + add `*.ini` / `frpc*.ini` to `.gitignore`. |
| `by_jules/` | Internal architecture audits authored by an assistant. Optionally salvage `repository_map.md` → rewrite as `docs/architecture.md` yourself, then delete the folder. |

### 🟠 Dev diaries & experiments (delete or relocate to `docs/`)

| Path | Recommendation |
|---|---|
| `PHASE_1…7_COMPLETE.md`, `PHASE_6.1_COMPLETE.md` | Move to `docs/history/` if you want the development story, else delete. They contain useful architecture narrative. |
| `implementation_plan_13 changes.md`, `gyroscope-analysis.md`, `PEER_REVIEW_DIAGNOSTIC_REPORT.md`, `joint dossier.md`, `walking2.md` | Relocate the genuinely useful ones (`PEER_REVIEW_DIAGNOSTIC_REPORT.md`, `gyroscope-analysis.md`) to `docs/physics/`; delete the rest. Rename remaining ones to kebab-case (no spaces). |
| `fall_diagnosis (1).json` | Debug dump artifact. Delete (also: filename contains a space + `(1)` — never ship). |
| `claude ragdoll.html` | Scratch file. Delete. |
| `walking_script_by_qwen.js`, `walking` (extension-less), `walking2.md` | Experiment scraps. Delete. |
| `com_pendulum_recorder.js`, `console_diagnose_arm_motion.js` | Genuinely useful console diagnostics → move to `tools/console-diagnostics/` with a small README explaining usage. |
| `balance.py` | Standalone Python experiment referencing a `robot/scene.xml` that isn't even in the repo (broken as-is). Delete or move to `experiments/` with a disclaimer. |
| `kaggle_new.py`, `kaggle_original.py` | Old iterations. Keep **only** `kaggle_server.py` (move to `server/kaggle_server.py` alongside `KAGGLE_SERVER_SETUP.md` → `server/README.md`). |

### 🟠 Decide deliberately

| Path | Decision needed |
|---|---|
| `model data/` (Mixamo animation JSONs) | Mixamo assets are usable but require attribution per Adobe terms. Rename to `assets/motion-data/` (remove the space), add attribution note in README/Acknowledgments. Or fold into `public/animations/`. |
| `actions/walkbyqwen .js`, `actions/walkbyqwen(backup).js`, `actions/walkupdated.js`, `actions/walk(oneturn).js`, `actions/walkbackwardsaved.js` | Versioned experiment copies with messy names. Keep ONE canonical walking preset + `00_action_runner.js` suite; delete backups. |
| `website/` | Marketing site inside the product repo creates confusion (two package.json, two builds). Strongly recommend: **separate repo**. If keeping, add a root note in README + ensure its placeholder links are fixed first. |
| `tests/verify-proxy.ts` | Keep — but it requires deployed edge functions to pass. Document as integration test requiring env vars. |

### ➕ Add to `.gitignore`

```
__pycache__/
*.ini
.env
.env.*
!.env.example
coverage/
.vercel
```

---

## 3. ADD — standard OSS files that are missing

| File | Purpose |
|---|---|
| `README.md` | **Provided separately** (see `project_info__112.md`). Replaces the current Vite-template stub. |
| `CONTRIBUTING.md` | Dev setup, branch naming, commit style, PR checklist, how to run tests/lint/typecheck. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 boilerplate is fine. |
| `SECURITY.md` | Where to report vulnerabilities + the "you bring your own keys/database" security model. |
| `CHANGELOG.md` | Seed with 1.5.1 highlights; use Keep-a-Changelog format going forward. |
| `.env.example` (root) | Documents optional deploy-time vars for `api/infer/*`: `SYNTHIA_SHARED_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, etc. (Runtime app config is entered in-app — say so in the file.) |
| `.nvmrc` | Pin `20` (setup docs require Node ≥ 20). |
| `.github/workflows/ci.yml` | On PR: `npm ci && npm run typecheck && npm run lint && npm test`. |
| `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md` | Standard templates (browser/OS/provider fields matter for this app). |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist: tests pass, typecheck passes, docs updated. |
| `CITATION.cff` *(optional)* | Researchers export embodied-AI datasets — make citing easy. |
| `docs/` restructure | See target tree in §6. |
| `package.json` metadata | Add: `"version": "1.5.1"` (currently `0.1.0` — mismatch!), `"license": "MIT"`, `"engines": { "node": ">=20" }`, `repository`, `bugs`, `homepage`, `keywords` (`embodied-ai`, `mujoco`, `threejs`, `llm-agent`, `webgl`, `simulation`). |

---

## 4. FIX — code/config issues found during audit

1. **Broken doc links** — `SYNTHIA_README.md` links to `PHASE1_DOCS.md`, `PHASE2_DOCS.md`, etc., which don't exist. Resolved by replacing README (§3) and archiving phase docs properly.
2. **Three overlapping readmes** — `README.md` (Vite junk), `SYNTHIA_README.md`, `SYNTHIA_SETUP.md`. Consolidate: one root README + `docs/setup.md`.
3. **Version mismatch** — package.json says `0.1.0`, branding says 1.5.1. Align.
4. **Dead code flag (documented in your own audit)** — `MotorController.GAIT_BALANCE_SCALE` / `gaitActive` is never activated by any caller. Either wire it or annotate/remove. Reviewers *will* find this.
5. **Supabase RLS is fully public** (`CREATE POLICY ... FOR ALL USING (true)`). This is intentional for the BYO-database model, but must be stated loudly in README/SECURITY.md: *"Anyone who obtains your Supabase URL + anon key can read/write your agent memories. Treat those credentials like passwords."* Consider offering an auth-tightened variant of the schema later.
6. **Kaggle server has zero auth + CORS `*`** — anyone with the tunnel URL can burn your free GPU quota. Add a simple shared-token header check (mirror the `x-synthia-secret` pattern from the edge proxies) — small fix, big win. Document current behavior meanwhile.
7. **Gemini key passed via URL query param** (`?key=${apiKey}`) in `api/infer/gemini.ts` — functional, but prefer the `x-goog-api-key` header so keys never land in proxy/access logs.
8. **Spaces & parentheses in filenames** (`fall_diagnosis (1).json`, `joint dossier.md`, `model data/`, `walkbyqwen .js`) — breaks tooling and looks unprofessional. All handled by §2 removals/renames.
9. **Git history scrub before publishing** — verify nothing sensitive was ever committed:
   - `git log --all --full-history --oneline -- frpc.ini "*.env"`
   - If anything appears, either BFG-clean or (simplest for a fresh launch) squash to a single fresh initial commit on a new orphan branch and replace history.
10. **Repo naming** — remote is `Greatness0123/synthia1.5.1.git`. Rename to `synthia` (clean, versionless); put versions in releases/tags (`v1.5.1`).

---

## 5. Pre-publish verification checklist

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] `npm test` (jest) → green
- [ ] `npm run build` → succeeds
- [ ] Fresh-clone smoke test: clone to temp dir → `npm i && npm run dev` → app boots, agent spawns
- [ ] `api/infer/*` deployed once with test env vars → `npm run verify-proxy` passes
- [ ] All README links resolve (no `/../../issues` dead ends once repo renamed)
- [ ] Search whole tree for leftover secrets: `TODO`, `sk-`, `AIza`, `supabase.co` hardcoded URLs
- [ ] Social preview image uploaded in GitHub repo Settings (1200×630)
- [ ] Topics set: `ai-agents`, `embodied-ai`, `mujoco`, `threejs`, `webgl`, `llm`, `simulation`, `robotics`
- [ ] Enable GitHub Discussions (Q&A category) — this app will generate lots of setup questions

---

## 6. Target repository tree after cleanup

```
synthia/
├── .github/                  # workflows, issue & PR templates
├── actions/                  # curated console motion presets (+ cleaned README)
├── api/infer/                # Vercel edge inference proxies
├── docs/
│   ├── assets/               # logo (circular PNG), screenshots, og-image
│   ├── setup.md              # full setup walkthrough (from SYNTHIA_SETUP.md)
│   ├── architecture.md       # rewritten from by_jules/repository_map.md
│   ├── physics/              # peer-review report, gyro analysis, RMBS docs
│   ├── history/              # PHASE_*_COMPLETE.md archive
│   └── debugging.md          # console diagnostics usage
├── public/                   # favicon, logos (dedupe the 5 logo variants → keep 2), animations, models, mujoco.wasm
├── scripts/                  # sync-types, gait authoring tools
├── server/                   # kaggle_server.py + its README
├── src/                      # application source (unchanged structure)
│   ├── components/
│   ├── constants/
│   ├── store/
│   ├── types/
│   ├── utils/
│   ├── workers/
│   └── world/{agent,engine,hooks}
├── supabase/
│   ├── schema.sql            # from root supabase_schema.sql
│   └── migrations/v2_additive.sql
├── tests/                    # verify-proxy integration test
├── tools/console-diagnostics/# COM recorder, arm-motion diag
├── .env.example
├── .gitignore  (amended)
├── .nvmrc
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md                 # from project_info__112.md
└── SECURITY.md
```

*(Delete from repo root: everything in §2. `website/` moves to its own repo.)*

---

## 7. Ordered execution plan

1. Create `docs/`, `server/`, `tools/console-diagnostics/`, `supabase/`, `.github/**` skeleton.
2. Move/rename survivors (phase docs → `docs/history/`, diagnostics → `tools/`, `kaggle_server.py` → `server/`, schema → `supabase/schema.sql`).
3. Rewrite `docs/architecture.md` based on `by_jules/repository_map.md` **in your own words**, then delete `by_jules/`.
4. Drop in the new `README.md` (project_info__112.md) + create `docs/assets/synthia-logo-circle.png` (512×512, circular crop, subtle ring — see §8).
5. Write CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG / `.env.example` / `.nvmrc` / CI workflow / templates.
6. Amend `.gitignore`; update `package.json` metadata + version `1.5.1`.
7. Delete every file in §2. Run the secret-history check; squash history if needed.
8. Fix Kaggle-server token auth + switch Gemini key to header (small patches).
9. Run §5 verification checklist end-to-end.
10. Rename repo to `synthia`, push, tag `v1.5.1`, create GitHub Release with notes.
11. Add repo social preview, topics, Discussions. Announce.

---

## 8. Making the circular logo asset (for the README)

GitHub strips inline CSS, so the circle must exist **in the image file itself**:

1. Take `public/synthia_logo_white.svg` (best contrast on dark) or `logo_bg_removed.png`.
2. Render/export at **1024×1024**, center the mark with generous padding.
3. Apply a circular mask + a 12px ring border (brand amber `#B8860B` or neutral white) in any editor (Figma/Photopea/Canva).
4. Export as `docs/assets/synthia-logo-circle.png` (PNG keeps the transparency outside the ring).
5. Commit. The README in project_info__112.md already points at this exact path — drop the file in and it renders perfectly.

Until then, a temporary fallback that works immediately with existing files: point the `<img>` at `public/logo_bg_removed.png` — square corners, but functional.

---

## 9. Things intentionally left OUT (per your request)

- Video/demo embeds — a `<!-- TODO: demo videos -->` placeholder comment is placed in the README where they'll slot in later.
- Live website URL — README uses the placeholder `https://your-website-link-here.com`; swap when live.

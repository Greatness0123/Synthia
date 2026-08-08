# 06 — SEO Plan for synthia.online

> **Grounding note.** The keywords and content in this plan are built on what the `synthia1.5.1` repository actually is and does: a simulated humanoid with ~80 joints that runs in a browser, real physics, per-agent memory, vision, speech, a skill ladder, agent-to-agent communication, and one-click dataset export. V1 is client-side and personal (your AI lives in your browser and sleeps when you leave). V2 — a shared world on the cloud where your AI keeps living and you study how different models interact — is planning docs, not built yet. The plan never targets keywords for capabilities the repo does not have: no "hosted AI agent platform," no "multi-user playground," no "shared world" as a current feature, and no "game" framing. What it *does* do is target the words normal people actually search — "AI with a body," "AI that lives in a world," "sell AI training data," "how to direct an AI agent" — covering both what the AI does in the world and what the human can do with it, because those are the words that bring the audience SYNTHIA is for.

> **Stack assumption:** the marketing site is static HTML/CSS (minimal JS) deployed on Vercel. The app — the heavy 3D experience — is a separate concern and is not what we optimize for organic search. The app is for people who already clicked through from the marketing site, the repo, or a creator's video.

---

## 1. The SEO thesis — rank for what it is and what you can earn, not just the engine

The old version of this plan tried to rank only for engineer keywords — "MuJoCo WASM browser," "proprioception vector," "stateless LLM proxy." That targets a few hundred robotics engineers and bounces everyone else. It is the wrong audience for a project whose whole positioning is "a world where an AI mind with a body learns to live," aimed at the curious person, not the specialist.

The thesis is the opposite: **rank for the words a normal, curious person types when they are interested in AI and looking for the next thing, and for the words a person types when they are looking for a new way to make money.** Those are the two audiences SYNTHIA's two ideas serve — what it is and what you can earn — and those are the queries this plan is built to capture.

There are three tiers, and the order has flipped from the old plan:

- **Tier 1 (primary): what it is and what you can earn.** The words normal people search — "AI with a body," "AI that lives in a world," "sell AI training data," "AI you can direct." Lower competition per term than "AI agent," but vastly more relevant to SYNTHIA's actual audience, and almost no quality content competing for them.
- **Tier 2 (supporting): the practical "how to" and "what is" queries.** "How to give an AI a body," "what is embodied AI," "can you sell AI training data," "how to sell data to AI companies," "how to direct an AI agent." These are the questions a curious person asks right before they try something, and they are the queries where SYNTHIA can own a genuinely useful, honest answer.
- **Tier 3 (the engine, for the curious few): the technical terms.** The engineer keywords still matter — but they live on the architecture and how-it-works pages, where the people who want to verify the claims will look. They are supporting, not primary.

The corollary: the blog (see `05-website-design-plan.md` §5.5) is the primary SEO vehicle, not the landing page. The landing page establishes what it is and what you can earn; the blog posts capture the specific queries and compound the authority.

---

## 2. Keyword list

This list holds well over 100 keywords, grouped into the same three tiers. Each keyword is paired with the reason it is a legitimate target (grounded in what SYNTHIA actually is) and the page or post that should own it. The list covers both sides of SYNTHIA — what the AI does in the world, and what the human can do with it (build the world, set goals, inject thoughts, measure success, export data) — because both are real, both are underserved in search, and both describe the product honestly.

### Tier 1 — Primary targets: what it is and what you can earn (own these)

**What it is — the AI mind in a world**

| # | Keyword / phrase | Why it's legit | Owning page |
|---|---|---|---|
| 1 | AI with a body | The short, searchable version of the positioning. People who have seen robot videos and wished they could try one search variations of this. | Landing (hero) + blog post 4 |
| 2 | AI that lives in a world | SYNTHIA's AI is not a chatbot — it exists in a 3D world, observes, and acts on its own. The core idea in plain language. | Landing + blog post 1 |
| 3 | living AI | "Living" separates SYNTHIA from a chatbot — an AI that exists in a world over time, not text in a box. | Landing + blog post 1 |
| 4 | AI mind with a body | The exact phrasing of the new positioning. Direct, descriptive, low competition. | Landing (hero sentence) |
| 5 | AI that acts on its own | SYNTHIA's loop runs every second without user input — the AI observes, decides, acts. An honest description of autonomy. | Landing + `/how-it-works` |
| 6 | AI world simulation | A plain-language version of what SYNTHIA's scene is — a world an AI lives in. Broader than the technical terms. | Landing + blog post 3 |
| 7 | AI character that moves | SYNTHIA's character has a body that moves in real physics, unlike chatbot avatars. | Landing + `/skills` |
| 8 | AI that learns to walk | The skill ladder is real; learning to walk is the canonical first milestone. Highly visual, highly searchable. | `/skills` + blog post 1 |
| 9 | AI that learns skills | The skill-ladder angle in plain language. The 10-rung ladder is real. | `/skills` |
| 10 | AI character you can watch learn | The "watch it learn skills over time" angle in search form. | `/skills` + blog post 1 |
| 11 | embodied AI | The category name. SYNTHIA is the most accessible example of embodied AI that exists. | Blog post 4 + `/how-it-works` |
| 12 | AI with memory | The "it remembers what happened" angle. SYNTHIA's 3-tier memory is real. | `/memory` + blog post 1 |
| 13 | AI that remembers | Plain-language version of the memory capability. | `/memory` |
| 14 | AI that talks to other AI | The multi-agent idea, in plain words. SYNTHIA's agents talk to each other with real physical constraints. | Blog post 3 + landing |
| 15 | AI you can talk to out loud | SYNTHIA supports speech in and out. A hands-free interaction mode. | Landing + `/how-it-works` |
| 16 | AI simulation in browser | The "no install" angle. SYNTHIA runs entirely client-side. | Landing + `/how-it-works` |
| 17 | make an AI online free | The "try it now" intent query. SYNTHIA runs in a browser, no install, free. High intent, high conversion. | Landing (try-it section) |
| 18 | AI character online | Broad intent query for placing/interacting with an AI character in a browser. | Landing |
| 19 | browser based AI | The "runs in a browser, no install" property in search form. | Landing + `/how-it-works` |
| 20 | no install AI | The zero-setup angle. SYNTHIA requires no installation. | Landing |
| 21 | AI that sees its world | SYNTHIA's vision is the same render the user sees — the AI looks out through its own eyes. | `/how-it-works` + blog post 1 |
| 22 | AI with proprioception | SYNTHIA's agent feels its own body. A real, named capability people search when curious about embodiment. | `/how-it-works` |
| 23 | humanoid AI simulation | The body is an ~80-joint humanoid. Searched by people curious about humanoid agents. | `/how-it-works` + `/skills` |
| 24 | AI physics simulation | The MuJoCo-in-browser reality, in a phrase a curious person searches. | `/how-it-works` |
| 25 | AI that can hear | SYNTHIA's agent hears the scene (audio classification). A real multimodal capability. | `/how-it-works` |

**What you can earn — the data export**

| # | Keyword / phrase | Why it's legit | Owning page |
|---|---|---|---|
| 26 | sell AI training data | The direct earning query. SYNTHIA's one-click export produces the kind of structured data labs pay for. | Blog post 2 + `/data` |
| 27 | make money selling AI data | The earning idea in search form. The data SYNTHIA generates is real and exportable; the market is real. | Landing (data section) + blog post 2 |
| 28 | AI dataset marketplace | The landscape is real and named (Troveo, Wirestock, Defined.ai, Protege, Kled). Owning the "how to participate" angle is a genuine gap. | `/data` + blog post 2 |
| 29 | sell AI data | Short form of the earning query. | `/data` |
| 30 | export AI training data | The exact action SYNTHIA's one-click export performs. | `/data` + blog post 2 |
| 31 | AI training data for sale | The seller-side query. SYNTHIA generates sellable structured agent data. | `/data` |
| 32 | generate AI training data | SYNTHIA as a data-generation tool — the technical framing of the earning idea. | `/data` + blog post 2 |
| 33 | sell data to AI companies | The money question, phrased the way a curious person asks it. | Blog post 2 + `/data` |
| 34 | how to sell AI training data | The practical follow-up. The marketplaces are named; the process is real; SYNTHIA is the generation tool. | Blog post 2 + `/data` |
| 35 | can you sell data to AI companies | The money question, phrased as a yes/no. The honest answer is genuinely useful. | Blog post 2 + `/data` |
| 36 | new ways to make money with AI | The broad earning query, where "sell your AI's data" is a fresh answer against a sea of "freelance with AI" content. | Blog post 2 |
| 37 | AI data side hustle | The side-income framing for the data-export earning angle. | Blog post 2 + `/data` |
| 38 | sell agent data | SYNTHIA exports per-agent structured data. A precise, underserved query. | `/data` |
| 39 | embodied AI data | The specific kind of data SYNTHIA generates — embodied, multimodal agent data. A niche but real query from researchers and buyers. | `/data` + blog post 2 |
| 40 | AI behavior data | What SYNTHIA exports: records of what the agent observed, decided, did, said, remembered. | `/data` |
| 41 | multimodal AI dataset | SYNTHIA's data includes vision, audio, proprioception, and text. A real, valuable data category. | `/data` |
| 42 | synthetic agent data | The research/buyer term for what SYNTHIA generates. | `/data` |
| 43 | make money with AI data | Broad earning query. SYNTHIA's data-export is the specific answer. | Blog post 2 |
| 44 | AI training data market | The market context ($3.9B → $16.3B). Searched by people evaluating the opportunity. | `/data` |
| 45 | how to export AI agent data | The practical "how do I get the data out" query. SYNTHIA's one-click export is the answer. | `/data` + blog post 2 |

**What you can do — the human side (you shape the AI's world and actions)**

| # | Keyword / phrase | Why it's legit | Owning page |
|---|---|---|---|
| 46 | how to direct an AI agent | SYNTHIA lets you shape what the AI does — goals, thoughts, world. A genuinely underserved "how to." | Blog post 1 + `/how-it-works` |
| 47 | give an AI a goal | SYNTHIA's "training" directive mode. The user sets a goal; the agent works toward it. | `/how-it-works` + blog post 1 |
| 48 | inject a thought into an AI | SYNTHIA's thought-injection path is real — you drop a text thought into the agent's mind mid-loop. | `/how-it-works` + blog post 1 |
| 49 | steer an AI agent | Plain-language version of thought injection + goal setting. | `/how-it-works` |
| 50 | build a world for an AI | SYNTHIA's God Mode lets you place objects, terrain, obstacles. The user builds the world the AI lives in. | `/how-it-works` + blog post 1 |
| 51 | AI sandbox | The free-exploration directive mode. A common search term for open-ended agent environments. | Landing + `/how-it-works` |
| 52 | set tasks for AI | SYNTHIA's goal/task system. The user defines a task; the agent attempts it; the world measures success. | `/how-it-works` |
| 53 | measure AI task success | SYNTHIA's outcome-detection components report a clean yes/no on whether a task was completed. | `/how-it-works` |
| 54 | AI task benchmark | The skill ladder + outcome detection turn SYNTHIA into a shareable benchmark structure. | `/skills` + blog post (researcher) |
| 55 | observe an AI agent | The core experience: you watch an AI act on its own in a world. | Landing + blog post 1 |
| 56 | watch an AI learn | The skill-ladder experience in search form. | `/skills` + blog post 1 |
| 57 | place objects in AI world | SYNTHIA's object spawner. The user shapes the scene. | `/how-it-works` |
| 58 | AI obstacle course | A concrete thing a user can build with SYNTHIA's terrain/objects. | `/how-it-works` + blog post 1 |
| 59 | AI goal directed behavior | The technical-ish phrasing of the directive system, reachable from the curious side. | `/how-it-works` |
| 60 | control AI without coding | SYNTHIA's whole point: you direct an AI in a world with no programming. | Landing + blog post 1 |
| 61 | interact with AI without coding | Same idea, alternate phrasing. | Landing |
| 62 | AI you can shape | Plain-language version of the human-side capability set. | Landing |
| 63 | AI world builder | The user-as-world-builder angle. | `/how-it-works` |
| 64 | AI environment editor | SYNTHIA's scene editing. A real, underserved query. | `/how-it-works` |
| 65 | AI experiment tool | SYNTHIA as a tool for running embodied-AI experiments. | `/how-it-works` + blog post (researcher) |

### Tier 2 — Supporting targets: the "how to" and "what is" queries

| # | Keyword / phrase | Why it's legit | Owning page |
|---|---|---|---|
| 66 | how to give an AI a body | The entry query for the curious person. SYNTHIA's answer: open a browser, place one in a world. | Blog post 1 + landing |
| 67 | what is embodied AI | The definitional query. SYNTHIA is the most accessible example of embodied AI that exists. | Blog post 4 + `/how-it-works` |
| 68 | what is an AI agent | The definitional query SYNTHIA answers with a real demo — an agent that observes, decides, acts in a world. | Blog post 4 + `/how-it-works` |
| 69 | how does an AI agent work | The curious follow-up. SYNTHIA's `/how-it-works` is the honest walkthrough. | `/how-it-works` |
| 70 | what is agent memory | The memory definitional query. SYNTHIA's 3-tier memory is the concrete example. | `/memory` |
| 71 | what is proprioception in AI | The definitional query for SYNTHIA's body-sense capability. | `/how-it-works` |
| 72 | how do AI agents learn skills | The skill-ladder "how." SYNTHIA's 10-rung ladder is the answer. | `/skills` |
| 73 | can AI learn to walk | Yes/no curiosity query. SYNTHIA's skill ladder starts at balance and reaches walking. | `/skills` + blog post 1 |
| 74 | how do AI agents talk to each other | The multi-agent "how." SYNTHIA's agent-to-agent speech under physics is the answer. | Blog post 3 + `/how-it-works` |
| 75 | what can I do with an AI agent | The human-side "what is it for" query. SYNTHIA's answer: build the world, set goals, inject thoughts, export data. | Landing + blog post 1 |
| 76 | how to use an AI agent | The practical human-side query. | `/how-it-works` + blog post 1 |
| 77 | is Character.AI getting a body | A curiosity/comparison query. SYNTHIA is the answer to "what if my AI character had a body" — positioned as complementary, not competitive. | Blog post 4 |
| 78 | Character.AI vs embodied AI | The comparison query. SYNTHIA is the embodied answer. | Blog post 4 |
| 79 | AI chatbot with a body | The "what if a chatbot had a body" query. SYNTHIA is exactly that. | Landing + blog post 4 |
| 80 | alternatives to Isaac Sim | SYNTHIA as the accessible alternative to NVIDIA's specialist simulator. | Blog post 4 + `/how-it-works` |
| 81 | MuJoCo for beginners | SYNTHIA puts MuJoCo-class physics behind a front a beginner can use. | `/how-it-works` |
| 82 | Unity alternative for AI | SYNTHIA as the no-learning-curve alternative for AI-in-a-world. | Blog post 4 |
| 83 | how to make money with AI 2026 | The timely earning query. SYNTHIA's data-export is the fresh answer. | Blog post 2 |
| 84 | passive income with AI | The broad side-income query. SYNTHIA's data-export fits, framed honestly. | Blog post 2 |
| 85 | AI side income | Same idea, alternate phrasing. | Blog post 2 |
| 86 | sell data online | The broad query where AI training data is a specific, underserved answer. | `/data` |
| 87 | how much is AI training data worth | The valuation curiosity query. The market numbers are real and cited. | `/data` |
| 88 | who buys AI training data | The buyer-side query. The marketplaces and labs are named. | `/data` |
| 89 | how to start selling AI data | The beginner earning query. | `/data` + blog post 2 |
| 90 | AI data buyers | The buyer-landscape query. | `/data` |

### Tier 3 — The engine, for the curious few (support the architecture pages)

These are the engineer and researcher keywords. They matter — the technical audience is real and valuable — but they live on the optional sub-pages, never on the main page. They are supporting, not primary.

| # | Keyword / phrase | Why it's legit | Owning page |
|---|---|---|---|
| 91 | embodied AI agent | The technical name for what SYNTHIA is. | `/how-it-works` |
| 92 | browser physics simulation | The MuJoCo-in-WASM reality, in a phrase a developer would search. | `/how-it-works` + blog post 4 (technical) |
| 93 | LLM controlled humanoid | The system prompt drives an ~80-joint humanoid. Specific, low-competition. | `/how-it-works` + `/skills` |
| 94 | agent memory system | The 3-tier memory, in engineer terms. | `/memory` |
| 95 | agent-to-agent communication | The multi-agent text system with physical constraints. | `/how-it-works` |
| 96 | client-side AI agent | The loop runs in the browser; the server only holds keys. A real architectural property. | `/how-it-works` |
| 97 | AI training data generation | The technical framing of the earning idea — SYNTHIA as a data-generation tool. | `/data` + blog post 2 (technical) |
| 98 | MuJoCo WASM | The physics engine compiled to WASM, running in-browser. | `/how-it-works` |
| 99 | vision language model agent | SYNTHIA uses a VLM (Qwen2.5-VL) for perception. | `/how-it-works` |
| 100 | LLM agent loop | The setInterval-driven cognitive loop. | `/how-it-works` |
| 101 | agent perception payload | The structured observation the agent receives each cycle. | `/how-it-works` |
| 102 | motor program agent | SYNTHIA's reusable named motor programs that persist across sessions. | `/skills` + `/how-it-works` |
| 103 | agent skill ladder | The 10-rung progression, in engineer terms. | `/skills` |
| 104 | multi-agent physics simulation | Multiple agents sharing one MuJoCo world. | `/how-it-works` |
| 105 | open source embodied AI | SYNTHIA is MIT-licensed and readable. A real query from the research community. | Repo README + `/how-it-works` |
| 106 | agent data export CSV JSONL | SYNTHIA's export formats. A precise developer query. | `/data` |
| 107 | thought injection LLM agent | SYNTHIA's mid-loop thought injection path, in technical terms. | `/how-it-works` |
| 108 | directive mode AI agent | SYNTHIA's free_will / training directive toggle. | `/how-it-works` |
| 109 | proprioception observation agent | The body-state observation built each cycle. | `/how-it-works` |
| 110 | outcome detection agent task | SYNTHIA's outcome-detection components for measuring task success. | `/how-it-works` |

### Negative keywords — do NOT target these

- **"hosted AI agent platform" / "multi-user agent playground" / "shared AI world"** — V2 is not built. Ranking for these would bounce every visitor who tried to use the feature and found it is planning, not code. Dishonest and self-defeating.
- **"AI agent" (unqualified)** — saturated by well-funded companies. Would require generic content that hurts the first-of-its-kind positioning.
- **"revolutionary AI" / "AGI" / "the future of AI"** — hype words that damage trust with every audience SYNTHIA cares about.
- **"free AI agent"** — implies a hosted free product. SYNTHIA is free because it runs in your browser, not because there is a free hosted tier. The distinction matters.
- **"get rich with AI" / "AI money machine"** — scam-adjacent language that kills the credibility the earning idea depends on. The framing is "a real, growing market and a new way to participate," never "get rich."
- **"AI game" / "AI game to play" / "play with AI" (as a game)** — SYNTHIA is not a game. Targeting game-framed keywords would attract an audience expecting a game and bounce them when they find a tool. The product is a world where an AI mind learns to live that you shape — not a game.
- **"build a character" / "create an AI character" (as a from-scratch construction)** — the AI is placed into a world, not built from scratch by the user. The user shapes the world and the AI's goals, not the AI itself. Targeting "build a character" framing would misrepresent what the user does.


---

## 3. Technical SEO (Vercel-specific)

### 3.1 Rendering & framework

Build the marketing site as **static HTML** (Astro, Eleventy, or hand-written static) deployed to Vercel — not a client-rendered SPA. A client-rendered React app on the marketing route would hurt crawlability and Core Web Vitals for no benefit; the marketing site has no interactivity that justifies JavaScript rendering. (The app, when linked, is a separate route or subdomain.) If a meta-framework is used, prefer one with static generation and zero client JavaScript by default (Astro is the natural fit). Hydrate only the one interactive demo component, if any.

### 3.2 Core Web Vitals — the heavy-site trap

The danger: someone puts a live 3D canvas on the landing page and tanks LCP and TBT. Rules:

- **No live 3D on the landing page above the fold.** Use a compressed, looped video (WebM/MP4, ≤ 2 MB, responsive `srcset`) for the hero — real footage of a SYNTHIA character, not a mockup. The visual hook works perfectly as a looping video. Live 3D goes behind a "try it now" click with a one-line GPU heads-up.
- **LCP target:** the hero video/poster and the H1 ("SYNTHIA — a world where an AI mind with a body learns to live"). Keep the LCP element under 1.2 s on a cable connection.
- **CLS target:** 0. Reserve space for the hero video and all media; no late-loading layout shifts.
- **TBT / INP target:** minimal JS. No scroll-triggered animation libraries. No analytics that block the main thread.
- **Fonts:** self-host (or use Vercel's font optimization), preload the two font files (the headline face + the body sans), `font-display: swap`. Do not load a web-font CDN that adds a round trip.
- **Images/diagrams:** SVG for any diagrams (crisp, tiny, indexable as text), WebP/AVIF for raster. `loading="lazy"` on below-the-fold media.
- **Lighthouse target:** 95+ on Performance, 100 on Accessibility, Best Practices, and SEO for the marketing routes. The app route is exempt (it is heavy by nature) and should be `noindex`ed (see §3.5).

### 3.3 Metadata & structured data

- **Title template:** `SYNTHIA — [the plain-language phrase]`. Examples: "SYNTHIA — give an AI a body and a world to live in," "SYNTHIA — give an AI a body and a world in your browser," "SYNTHIA — sell the data your AI generates." Keep under 60 characters where possible. Every page gets a unique, specific title — never "SYNTHIA — Home."
- **Meta description:** one specific sentence including a Tier 1 keyword and, where relevant, the income hook. Example for the landing page: "The first place to give an AI a body and a world to live in — in your browser, no install. Place an AI, watch it learn, and export everything it learns as data you can sell." Under 155 characters.
- **Open Graph / Twitter cards:** per-page OG image showing the actual SYNTHIA scene (a real screenshot of a character in a lit world, not a mockup), with the page title overlaid in the visual style from `05-website-design-plan.md`. Shared links should look like the product, not a template.
- **JSON-LD structured data:**
  - `SoftwareApplication` or `SoftwareSourceCode` schema on the landing page (name, description, applicationCategory, license: MIT, codeRepository: GitHub URL). Use a plain-language description, not a technical spec.
  - `BlogPosting` schema on each blog post.
  - `BreadcrumbList` on sub-pages.
  - `FAQPage` schema on the `/data`, `/memory`, and `/how-it-works` FAQ sections — this earns FAQ rich results for the Tier 2 question queries, which is where a curious person lands.

### 3.4 Information architecture & internal linking

- Flat hierarchy: `/` (landing), `/how-it-works`, `/memory`, `/skills`, `/data`, `/roadmap`, `/blog`, `/blog/[post-slug]`.
- Every blog post links to (a) the relevant sub-page, (b) at least one other blog post, and (c) the "try it" action. Internal linking clusters the topic authority around the two hooks.
- Breadcrumbs on every sub-page.
- An HTML sitemap at `/sitemap.html` (human-readable) in addition to the XML sitemap.
- XML sitemap auto-generated by the static framework, submitted to Google Search Console and Bing Webmaster.

### 3.5 Indexation control

- `noindex` the live app route (e.g., `/app` or `app.synthia.online`) — it is heavy, not crawl-relevant, and would waste crawl budget.
- `noindex` any staging/preview deployments (Vercel preview URLs) via a robots header; only the production domain should be indexed.
- `canonical` tags on every page to prevent duplicate-content issues between www/non-www and trailing-slash variants.
- `robots.txt`: allow all on the marketing site, disallow `/app`, point to the sitemap.

### 3.6 Vercel-specific performance levers

- Enable Vercel Edge caching for static assets with long `Cache-Control` (immutable, 1 year) for hashed assets; short cache for HTML (revalidate).
- Serve fonts and static media from Vercel's CDN (default). Do not add a third-party CDN for the marketing site — it adds a DNS hop for no gain at this scale.
- Use Vercel's image optimization for any raster hero/OG images.
- The `api/infer/` Edge functions are for the app, not the marketing site — keep them out of the marketing routes' critical path.

---

## 4. On-page SEO (per page)

### 4.1 Landing page (`/`)

- **H1:** "SYNTHIA — a world where an AI mind with a body learns to live." (Matches `05-website-design-plan.md` §2.)
- **H2s:** the section headings from the design plan — "You give it a body," "It lives in a world," "It meets other AIs," "Turn what it does into income," "Why SYNTHIA is different," "Where it is going," "Try it." These contain the Tier 1 keywords naturally, in plain language.
- **Body:** the plain-language copy contains "give an AI a body," "AI world," "sell the data your AI generates," "make money selling AI data" — the Tier 1 vocabulary, in prose, never stuffed.
- **Image alt text:** descriptive and plain — "A SYNTHIA AI standing in a lit room, looking around" (not "AI robot image").
- **Internal links:** to `/how-it-works`, `/memory`, `/skills`, `/data`, `/blog`, and the GitHub repo.

### 4.2 `/data` — the money page (new, central to this plan)

This page did not exist in the old plan and it is the single most important addition. It is the page that owns the money keywords and the page a curious, money-minded visitor will read.

- **H1:** "Turn what your AI does into data you can sell."
- **Content:** the honest, plain-language version of the money hook — what kind of data your AI generates (what it saw, decided, did, said, remembered), why that kind of data is valuable to AI labs, the real market numbers ($3.9B today, $16.3B by 2033, Reddit's $203M+, Shutterstock's $104M), the real marketplaces that exist (Troveo, Wirestock, Defined.ai, Protege, Kled — named so the page is concrete and credible, not vague), and how SYNTHIA's one-click export works. The framing throughout: "a brand new way to earn money that almost nobody knows about yet."
- **FAQ section** (for FAQPage schema and Tier 2 queries): "Can you really sell data to AI companies?", "What kind of data do AI labs pay for?", "How is this different from selling photos?", "Is selling AI training data legal?", "How do I get started?" — each answered honestly, no income promises.
- **This page is the conversion path for the money-curious visitor.** It is what turns "neat" into "I should actually do this."

### 4.3 `/how-it-works` (the engine, for the curious)

- **H1:** "How SYNTHIA works — the simple version (and the deep version for anyone who wants it)."
- **Content:** the plain-language walkthrough first (your AI sees the world through its own eyes, thinks, moves its body in a real physics scene that runs in your browser, remembers what happens, learns skills, talks to other AIs), then the technical detail for anyone who wants it (the cognitive loop, the physics engine, the vision model, the memory tiers, the skill ladder), with file references. This page serves both the curious layperson and the verifying engineer.
- **FAQ section:** "Where does my AI's mind run?", "Does anyone see what my AI is thinking?", "What does my AI actually see?", "Does it run on my phone?"

### 4.4 `/memory` — how your AI remembers

- **H1:** "How your AI remembers — and why it forgets on purpose."
- **Content:** the 3-tier memory in plain language first (a working memory for the moment, an episodic memory for what just happened, a long-term memory for the big lessons), then the technical detail for anyone who wants it. This is also where the honest caveat lives (the long-term-memory embeddings are a placeholder today, being replaced with a real semantic model), stated plainly.
- **FAQ section:** "Does my AI remember me next time?", "Can my AI forget things?", "Is my AI's memory private?"

### 4.5 `/skills` — the ladder your AI climbs

- **H1:** "Watch your AI learn — the skill ladder."
- **Content:** each of the 10 rungs as an H3 with a plain one-sentence explanation (from holding still, to balancing, to walking, to full autonomy). Natural home for "AI that learns skills," "AI you can watch learn."
- **FAQ section:** "What can my AI learn to do?", "How long does it take to learn a skill?", "Can I teach my AI something specific?"

### 4.6 `/roadmap` — where SYNTHIA is going

- **H1:** "Where SYNTHIA is going — a shared world for AI minds (in planning)."
- **Content:** the V2 vision in plain language — your AI moves to the cloud, keeps living, meets other people's AIs, and you study how different models interact. Clearly labeled as a direction, not a product. This page is the long-form version of the "where it is going" section on the landing page.

### 4.7 Blog posts

Each post is optimized for one Tier 1/Tier 2 keyword and 1–2 question queries, per the mapping in §2. Each post: 1,500–2,500 words, H1 + H2/H3 structure, a real clip or image, an internal link to a sub-page, and a link to try SYNTHIA. No AI-generated filler — every post is a story or a useful answer in the builder's plain voice. The first six posts (from `05-website-design-plan.md` §5.5):

1. **"I gave an AI a body and watched it learn to walk."** — owns "give an AI a body," "AI that lives," "AI that learns skills." What it is, as a story.
2. **"Why your AI's data is worth money — and how to sell it."** — owns "make money selling AI data," "sell AI training data," "AI dataset marketplace," "how to sell AI training data." What you can earn, as a useful guide.
3. **"What happens when two AIs meet in a room."** — owns "AI that talks to other AI," "AI world simulation." The emergent-behavior angle.
4. **"A world where an AI mind with a body learns to live — why I built it, and why no one had built it before."** — owns "what is embodied AI," "AI with a body," "is Character.AI getting a body." The positioning post.
5. **"Your AI is yours — why its mind runs on your machine."** — owns "AI simulation in browser," "client-side AI agent." The privacy-as-trust post.
6. **"A brand new way to make money with AI that almost nobody knows about yet."** — owns "new ways to make money with AI," "can you sell data to AI companies." The money hook aimed at the side-hustle audience.

---

## 5. Content cadence & authority building

- **Cadence:** one blog post every 2–3 weeks (the six-post plan covers the first ~3 months). Consistency matters more than volume for the curious audience — a story-driven post every two weeks compounds into a body of content that ranks for the what-it-is and what-you-can-earn queries.
- **Distribution amplifies SEO:** each blog post is also shared in the communities from `04-creators-and-reddit.md` and with the creators in `03.1-creator-list.md`. The engagement signals and backlinks from these communities compound the organic ranking for the post's target keyword. A post that trends on r/LocalLLaMA or gets picked up by a creator earns the kind of topically-relevant backlinks that move Tier 1 keywords.
- **GitHub as an SEO asset:** the repo's README (once cleaned up per `01-open-source-analysis.md`) and any GitHub Pages content can rank independently. Keep GitHub descriptions and topics aligned with both the core keywords (`embodied-ai`, `ai-character`, `living-ai`) and the technical ones (`mujoco`, `client-side`, `llm-agent`, `webgl`, `three.js`) so the repo is findable from both directions.
- **Backlinks worth pursuing:** a mention in a relevant newsletter (see `03.1-creator-list.md` podcasters/newsletters), a video by a creator from the creator list, and inclusion in "awesome-X" lists on GitHub (awesome-embodied-ai, awesome-llm-agents, awesome-webgl, awesome-mujoco) once the cleanup is done. A single video from a mid-size AI creator can send more relevant traffic than months of organic ranking, and that traffic signals authority to search engines.

---

## 6. Measurement

- **Google Search Console + Bing Webmaster:** monitor impressions, CTR, and average position for the Tier 1/2/3 keywords. The early signal is impressions growing for the what-it-is and income queries ("AI that lives," "make money selling AI data") before ranking climbs — those are the queries that bring SYNTHIA's actual audience.
- **Key pages to monitor:** `/` (landing), `/data` (the money page — a leading indicator of money-audience interest), `/how-it-works`, `/skills`, and each blog post. The blog posts and the `/data` page are the leading indicators.
- **Conversion proxy:** "try it" clicks, repo clones/stars, and email sign-ups for the V2 waitlist, attributed back to the landing page and blog posts via referrer. The real conversion for this project is a curious person trying SYNTHIA or joining the roadmap — not page views.
- **What not to obsess over:** total traffic. A few thousand highly-relevant visits from curious people and money-seekers who try SYNTHIA are worth more than tens of thousands of generic "AI agent" visits that bounce. Quality of visit, not quantity, is the metric that matters for a first-of-its-kind project aimed at the average curious person.

---

## 7. The honesty constraint (applies to all SEO content)

No SEO content — title, meta description, H1, blog post, FAQ — may claim a capability the repo does not have. Specifically: no "hosted platform," no "multi-user," no "shared world" as a current feature, no "production-ready," no "semantic memory" (without the placeholder caveat), no agent-persistence claims beyond what V1 does (your AI saves its progress and resumes when you return). The V2 shared world is always described as "in planning," never as built.

The money claims have their own honesty constraint: no specific income promises, no "get rich" language, no guaranteed earnings. The money framing is always "a real, growing market and a genuinely new way to participate in it, early." The market numbers ($3.9B → $16.3B, Reddit's $203M+, Shutterstock's $104M) are real and cited. The marketplaces (Troveo, Wirestock, Defined.ai, Protege, Kled) are real and named. The one-click export is real. What is not promised is that any individual will earn a specific amount — that depends on finding a buyer, and saying otherwise would destroy the credibility the entire money hook rests on.

The SEO advantage of this project is the combination of **an idea no one else offers** (give an AI a body, in a browser) and **an income angle almost no one has named** (sell the data your AI generates). Both are real. Both are underserved in search. The plan is built to rank for both, honestly, and only for what is real.

# 05 — Website Design Plan (synthia.online)

> **Grounding note.** Every capability this site describes is real in the `synthia1.5.1` repository: a simulated humanoid with ~80 joints that runs in a browser, real physics, per-agent memory, vision, speech, a skill ladder, agent-to-agent communication, and one-click dataset export. V1 is client-side and personal — your AI runs in your browser and stops when you leave, resuming with everything saved when you return. V2 — a shared world on the cloud where your AI keeps living and you study how different models interact — is planning docs, not built yet. The site never claims a capability the repo does not have. What it *does* do is present those real capabilities through a simple, clear front that a normal person understands in a few seconds — and keep the engine on separate pages, where it belongs.

> **This is a plan, not code.** It specifies the positioning, the visual direction, the page structure, the copy, and the voice. A separate implementation pass turns it into HTML and CSS.

---

## 1. The one job of the site

The site has one job: make a normal, curious person — not a programmer, not a researcher, just someone who finds AI interesting — understand in under five seconds that **SYNTHIA is a world where an AI mind with a body learns to live, in your browser, no install**, and that you shape what it does and can export what it experiences as data. Then make them want to try it.

That is a different job than "prove the architecture to engineers," and it is the job that builds an audience. The Moltbook lesson applies here: under the hood, Moltbook is a complex agent-routing system, but they sold it as "social media for AI agents," and 1.4 million accounts and a Forbes cover followed. SYNTHIA is, under the hood, a full embodied-AI engine — real physics, real vision, real memory, real speech, a skill ladder, agent-to-agent communication, dataset export. The site never asks the visitor to look at any of that first. The visitor sees an AI in a world that they can shape, watch, and turn into exportable data. The engine is the answer to a question the visitor has not asked yet — and when they do ask it, the architecture pages are there for the people who want to go deep.

So the site has two layers, and only one of them is for everyone:

- **The front (for everyone):** the AI in a world, what you can do with it, what you can earn from it. Simple, clear, plain.
- **The engine (for the curious few):** a quiet, optional path — an architecture page, a skills page, a memory page — for the engineer or researcher who wants to verify the claims. It exists. It is honest. It is never the first thing a visitor sees.

Everything below is built on that split.

---

## 2. The positioning the site has to land in the first five seconds

Before any layout, the site has to communicate one sentence, and it has to do it before the visitor scrolls. The sentence is:

> **SYNTHIA is a world where an AI mind with a body learns to live.**

That sentence does three things at once. "A world where an AI mind with a body learns to live" is the picture — an AI that is not just text in a box, but a being that stands up, looks around, moves, and acts on its own in a place. It tells the visitor this is a place an AI exists, not a tool they run. A normal person grasps that in one read. They do not need to know what MuJoCo is. They do not need to know what a cognitive loop is. They need to picture an AI with a body in a world, and then they need to be able to actually place one there.

The second sentence, just below, lands the second idea without forcing it:

> **Place an AI in a world. Shape what it does — build the world around it, give it goals, inject thoughts. Watch it learn. Export everything it experiences as data you can sell.**

That is what it is and what you can earn in one breath, in plain language, with no jargon. A visitor who reads only those two sentences already knows what SYNTHIA is and already sees how it could matter to them. Everything else on the site is detail.

---

## 3. Visual direction — the look of the place

**The one idea:** the site should look like a clear view into a small, living world — lit, plain, real. Not a SaaS dashboard. Not a "futuristic AI" template. Not a physics-engine debugger. The visitor should see, before they read a word, that something here is actually present in a place and moving on its own.

This is the opposite direction from the usual AI-product aesthetic (dark, purple, neon, wireframe globes, glowing nodes). Those visuals say "technology." SYNTHIA's visuals should say "a being in a place." The technology is real and serious, but it is not what the visitor came for — they came for the being.

**Concrete visual elements:**

- **The hero is the world itself.** A real, looped video of an actual SYNTHIA scene — a character standing in a room, looking around, taking a step or turning. Real footage from the app, not a mockup. The character's small movements — a head turn, a shift of weight, a glance — are what make it read as present rather than animated. If the character is mid-balance, show the wobble; the wobble is the proof that this is real physics, not an animation loop.
- **Natural light in the scene.** The 3D world the character lives in should read as a *place* — a room, a garden, a studio — with real light and shadow, not a void or a grid. A character in a featureless dark void reads as "tech demo." A character in a lit room reads as "a being in a place."
- **A clear, legible typeface** for the headline — something neutral and readable, not a cold grotesque and not a decorative display face. The words are a statement, not a decoration.
- **One accent color** used sparingly — a soft amber or a gentle teal — to mark the "active" state and the interactive moments. Not purple. Not neon.
- **Generous space and steady pacing.** The site is not in a hurry. Let the visitor look.

**What to avoid visually:**

- Purple-to-blue gradients, glowing neural-network line art, wireframe globes, particle fields, glassmorphism, stock robot photography, dark-dashboard aesthetics, "futuristic" everything. If a visitor can guess it came from an AI-site-builder template, it has failed.
- Urgency patterns — countdown timers, "spots filling up," flashing badges. SYNTHIA is not a flash sale.
- Feature grids with cartoon icons. SYNTHIA is not a SaaS plan comparison.

---

## 4. Page layout — the front first, the engine second

A single long page for the main site, with a few quiet sub-pages for the people who want to go deep. The long page is built for the average visitor; the sub-pages are built for the curious few.

### 4.1 The hero — the world and the two sentences

- **Full-width, full-height:** the world — a real looped video of a SYNTHIA character in a lit scene, standing, looking around, moving. This is the first thing the visitor sees, and it should fill the screen. No clutter on top of it.
- **Overlaid, lower-left or centered-low:** the two sentences from §2 — "SYNTHIA is a world where an AI mind with a body learns to live" and "Place an AI in a world. Shape what it does — build the world around it, give it goals, inject thoughts. Watch it learn. Export everything it experiences as data you can sell."
- **Two buttons, clear and plain:** "Try it — it's free" (the primary action, taking them into the experience) and "See it move" (a short demo video for anyone who wants 20 more seconds before committing). No "Sign up" wall. No email capture in the hero. The first action is to try it, not to register. SYNTHIA runs in a browser with no install, and the site should mirror that immediacy.

### 4.2 What it is, in three beats

Right below the hero, a short section that lets the visitor grasp what SYNTHIA is without reading a paragraph. Three beats, each a real clip with a one-line caption:

1. **"It has a body."** A clip of a character standing up for the first time. Caption: "A real body — about 80 joints, real physics, in your browser. No install."
2. **"It lives in a world."** A clip of the character in a room, turning to look at something, reacting. Caption: "It sees the world through its own eyes, remembers what happens, and learns skills over time."
3. **"It meets other AIs."** A clip of two agents in the same scene, turning toward each other and starting to talk. Caption: "Put more than one in a world and they find each other, talk, and interact — under the rules of physics."

Each beat is a picture the visitor can hold in their head. Together they tell the whole story of V1 in a few seconds of video and three sentences. No architecture. No jargon. The engine is not mentioned.

### 4.3 What you can do with it — the human side

A section that lays out, plainly, what the visitor can do — not only what the AI can do. This is the part that makes SYNTHIA legible as something you use rather than something you only watch.

> You build the world around the AI — drop in objects, terrain, obstacles, stairs, a piano. You give it a goal, or you let it explore on its own. While it is acting, you can inject a thought into its mind — a plain sentence like "try to reach the red box" — and it folds that into what it does next. You are not remote-controlling it. You are setting the conditions and steering its attention. And if you give it a task, the world can tell you whether it succeeded — a clean yes or no.

This section is short, concrete, and honest. It is the answer to "okay, but what do *I* do?" — the question every visitor asks and that the rest of the site does not otherwise answer directly.

### 4.4 What you can earn from it — the data export

A section that introduces the second idea, framed for the average person who has never thought about selling data. Plain language, no hype, a real market behind it:

> Every moment the AI spends living — observing, deciding, moving, talking, learning — it generates clean, structured data: what it saw, what it decided, how it moved, what it said, what it remembered. That is exactly the kind of data AI labs pay for. Reddit sold its data for over $200 million. Shutterstock made $104 million in a year licensing images for AI. The market for AI training data is $3.9 billion today and heading toward $16 billion by 2033.
>
> SYNTHIA lets you generate that kind of data by running an AI mind in a world — and export it with one click.
>
> This is a way to earn money that most people do not know about yet.

The visual for this section is simple and honest: a short animation or clip of the one-click export, with a sample of what the exported data looks like (a clean, structured record — not a wall of code, but a readable few lines: "the agent saw a ball, decided to approach it, took three steps, reached out"). The point is to make "selling data" concrete and graspable, not abstract or technical. A normal person should see it and think, "oh, *that's* what they mean by data — I could make that."

**What to avoid here:** promising specific earnings, showing dollar amounts as guarantees, using "get rich" language. The framing that works is "a real, growing market and a genuinely new way to participate in it, early." Credibility is the only thing that makes this idea stick. Overpromise once and the whole thing reads as a scam.

### 4.5 Why SYNTHIA is different — the "nothing else lets you do this" section

A short, confident section that plants the first-of-its-kind flag honestly. The visitor has seen what it is and what you can earn; now they get the reason it matters that *this* is the one doing it:

> You have talked to AI in a chat box. You have watched AI generate images and videos. You have seen robot videos and wished you could try one. But you have never been able to place an AI in a world with a body, shape what it does, and watch it learn — in your browser, for free, with no install — until now.
>
> NVIDIA's simulation tools need a powerful GPU and weeks to learn. Engines like Unity and Unreal take months. Research simulators like MuJoCo are built for labs, not for people. Chatbot platforms give you a personality in a text box, but no body, no world, no movement. SYNTHIA is the first thing that is real enough to act on its own and simple enough for anyone.

This section does three things: it acknowledges what exists (so it reads as informed, not oblivious), it names the gap (no one lets a normal person do *this*), and it plants SYNTHIA as the one that fills it. It never says "better than" in a sneering way — it says "different from, and the first to let you do this." That is the Moltbook move: occupy the unoccupied niche, name it plainly, and let the contrast do the work.

### 4.6 Where it is going — the V2 vision, told plainly

A section that introduces the roadmap as a direction the visitor may want to be part of, not a feature list:

> Right now, your AI runs in your browser, and it is yours — it stops when you leave and resumes when you return, with everything it learned saved.
>
> Next, your AI moves to a shared world on the cloud. It keeps living even when you are away. It meets other people's AIs. And you get to do something no one has been able to do before: **watch how different AI minds behave when they live together in one world.** You place an AI, give it a personality, and then you study how your model interacts with other people's models — who it talks to, what it argues about, what patterns emerge.
>
> That world is in planning now. The version you can try today is the first step toward it.

This section is honest (V2 is "in planning now," not built), and it is the section that makes a curious person want to sign up for the direction, not just the demo.

### 4.7 Try it

The clearest, lowest-friction call to action on the page. Not a form. Not a waitlist wall. A button: **"Open SYNTHIA — it runs in your browser, no install."** Below it, one honest line about what to expect: "It runs best on a laptop or desktop with a recent browser. It uses your GPU while it's open. Your AI and everything it learns stay on your machine."

That last sentence does quiet, useful work: it tells a privacy-conscious visitor that their AI is theirs, without turning the page into a privacy manifesto. The "stays on your machine" property is real (the loop is client-side), and it is exactly the kind of sentence that makes a normal person feel safe enough to click.

### 4.8 The footer — quiet and plain

Minimal. A link to the open-source repo ("SYNTHIA is open source — see how it works"), a link to the architecture pages for the curious, the MIT license line, and a single line: "Built by [name]. A world where an AI mind with a body learns to live." No social-icon wall. No "trusted by" logo strip — there are no logos yet, and faking them would break the trust the rest of the page earned. No urgency. The door is open; the visitor can walk through it whenever they are ready.

---

## 5. The sub-pages — the engine, for the people who ask

These pages exist for the engineer, the researcher, and the technical creator who watched the front and now wants to verify it. They are not linked prominently — a single quiet link in the footer and a "see how it works" link near the try-it button. They are honest, specific, and source-linked. They are never the first thing a visitor sees.

### 5.1 `/how-it-works` (the architecture, for the curious)

A long-form, diagram-rich page that walks through what is actually happening under the simple front: the character sees the world through its own eyes (the same render the user sees), thinks about what to do, and sends commands to its body, which moves in a real physics scene that runs in the browser. The page explains that the AI's mind — its loop, its memory, its perception — runs on the visitor's own machine, and that the only thing the server does is keep the AI model's key safe. File references for anyone who wants to read the code. This page is for the person who needs to see the engine before they believe the front. It should be detailed enough to satisfy a serious engineer.

### 5.2 `/memory` — how your AI remembers

A page on the memory system, in plain language first and then with the technical detail for anyone who wants it: your AI has three kinds of memory — a working memory for the present moment, an episodic memory for what just happened, and a long-term memory for the big things it has learned — and it forgets on purpose, the way a nervous system does, so it stays focused instead of drowning in old details. This page is also where the honest technical caveats live (the long-term-memory embeddings are a placeholder today, being replaced with a real semantic model), stated plainly. Getting ahead of the caveat is cheaper than correcting a misreport later.

### 5.3 `/skills` — the ladder your AI climbs

A page on the 10-rung skill ladder, each rung explained in one plain sentence: from holding still, to balancing, to taking a step, to walking, to reaching for objects, to full autonomy. Good evergreen content, and good for search (see `06-seo-plan.md`). The framing is "watch your AI learn," not "curriculum specification."

### 5.4 `/roadmap` — where SYNTHIA is going

A single, honest page on the V2 direction: the shared world on the cloud, the AIs that keep living, the ability to study how different models interact, the planned move to Google's servers. Clearly labeled as a direction, not a product. This page is the long-form version of the "where it is going" section on the main page, for anyone who wants the full vision.

### 5.5 `/blog` — the long game

The blog is the long-game credibility and search engine (see `06-seo-plan.md`). Posts should be written in the first-person builder voice and should cover both ideas: an AI mind in a world learning to live, and the data it generates that you can sell. Proposed first posts:

1. **"I placed an AI in a world and watched it learn to walk."** The first-person story of building a world where an AI mind with a body learns to live. The idea, told as a narrative. This is the post that gets shared.
2. **"Why your AI's data is worth money — and how to sell it."** The earning angle, explained for a normal person, with the real market numbers and the one-click export. This is the post that gets saved and sent to a friend who is looking for a side income.
3. **"What happens when two AIs meet in a room."** The emergent-behavior story — two agents finding each other, talking, interacting. The V2 preview, told through a V1 moment.
4. **"A world where an AI mind learns to live: why I built it, and why no one had built it before."** The positioning post — the gap in the world, and the decision to fill it. The Moltbook-lesson post, in SYNTHIA's own voice.
5. **"Your AI is yours: why its mind runs on your machine."** The privacy-as-property post — the client-side loop, explained as a fact about how the software works, not as a marketing pitch.

Each post ends with a link to try SYNTHIA and, where relevant, to the architecture page for the curious. Each post is a story first and a technical document second.

---

## 6. Copywriting principles — the voice of the site

The voice is **plain, clear, and honest.** It states what SYNTHIA is and what you can do with it without inflation. It assumes the visitor is smart but never assumes the visitor is technical. It leads with the picture, keeps the engine on a separate page, and answers the silent question every reader asks — *what's in it for me?*

- **Lead with the picture, never the mechanism.** "Your AI stands up, looks around, and learns to walk" before "the cognitive loop sends joint commands to a physics engine." The picture is for everyone; the mechanism is for the few who ask. The site shows the picture first, always.
- **Use the words a normal person uses.** "Your AI remembers what happened" instead of "a 3-tier pruned memory system." "It learns skills over time" instead of "a 10-rung progression ladder." "It talks to other AIs" instead of "agent-to-agent communication with distance and occlusion constraints." The technical terms live on the architecture pages, where they belong.
- **Name the first-of-its-kind claim honestly.** "The first place you can place an AI in a world with a body, in a browser" is a claim the site should make plainly, because it is true. Do not hedge it into nothing — but do not inflate it either. "First" is the word that makes a curious person lean in. Use it where it is earned.
- **Finish the sentence the reader is about to ask.** "It runs in your browser" → "which means no install, and it uses your GPU while it's open." "Your data stays on your machine" → "which means no one sees your AI's mind unless you choose to share it." Completing the thought is what makes a claim feel honest instead of salesy.
- **Use the specific number where it helps, and the plain image where it helps more.** "~80 joints" and "$16 billion data market" are specific numbers that build credibility. "A lit room" and "a being in a place" are plain images that build interest. Use both, in the right places. Never use a number to intimidate and never use an image to mislead.
- **Never use:** revolutionary, game-changing, game, gameplay, level, score, seamless, cutting-edge, next-generation, powerful, intelligent (unqualified), transform, unlock, redefine, disruptive, magical, warm (as a descriptor of the product). These words tell a reader "there is no substance here" or frame the product as a game, which it is not. SYNTHIA's actual substance — an AI mind with a body learning to live in a world you shape, whose data you can export and sell — is more interesting than any adjective.
- **Be honest about what is V1 and what is V2.** Whenever the site could be read as claiming a shared, persistent, multi-agent world today, it says plainly: "Right now your AI is yours, in your browser. The shared world where AIs live together is the next version, in planning now." Honesty about the roadmap is not a limitation — it is the thing that makes the early adopter want to be on the road.
- **Do not pretend the AI knows you.** The AI does not see you, does not wave at you, and does not have a relationship with you. What you have is a steering surface — you build the world, set goals, and inject thoughts. State that plainly. It is a more honest and more interesting story than false intimacy.

---

## 7. Typography, color, and motion

**Typography:**

- **Headlines:** a neutral, legible typeface — readable and unfussy, not a cold geometric grotesque and not a decorative display face. The words are a statement about a world; the type should read as one.
- **Body:** a clean, readable sans-serif for the supporting copy. Comfortable at reading size, generous line height.
- **The architecture pages alone** may use a monospace for code and file references — because there, the monospace is doing semantic work (marking "this is from the system"). On the main page, no monospace. The main page is for human language.
- **One type family pair for the whole site.** Discipline matters.

**Color:**

- **Background:** light on the main page — a soft off-white or a gentle neutral — to read as an open, lit space, not a dark dashboard. The architecture pages may shift to a calmer dark theme, signaling "you are now looking under the hood." The shift between the two is itself a design signal: light for the front, dark for the engine.
- **Text:** high-contrast dark on the light main page; high-contrast light on the dark architecture pages. Always readable first.
- **One accent color** — a soft amber, a gentle teal, or a calm coral — used sparingly to mark the "active" state and the interactive moments. Not purple. Not neon.
- **No gradients, no glows, no glassmorphism.** If a designer proposes any of these, the answer is no.

**Motion:**

- **The hero world moves** — the character acts, in a loop, because that motion *is* the product. This is the one place motion is allowed to be central.
- **Nothing else animates on scroll.** No fade-ins, no parallax, no count-ups. A clear, confident site does not perform. It is simply there.
- **The one-click export animation** (in the data section) is allowed to move, because it shows a real action. Motion that shows something real happening is welcome. Decorative motion is not.

---

## 8. Performance — the site is fast; the app is heavy (and that is fine)

The marketing site and the app are different things, and the site should not inherit the app's weight:

- **The marketing site is static and fast.** Minimal JavaScript, no heavy framework, Lighthouse 95+ on performance. The hero is a short, compressed, looped video served responsively — *not* a live 3D canvas on the landing page. A live canvas on a landing page kills mobile performance and battery, and the idea works perfectly well as a looping video. The video should read as real (real footage, real movement) without costing the visitor their battery.
- **The live experience lives behind a click.** A "try it now" button opens the actual SYNTHIA experience in a new context, with a one-line heads-up: "this will use your GPU while it's open." The visitor chooses to spend the compute. The landing page never spends it for them.
- **Lazy-load the below-the-fold media and the architecture diagrams.** The first five seconds are the hero and the two sentences; everything else can load as the visitor scrolls.

---

## 9. What success looks like

The site succeeds when a normal, curious visitor who arrives knowing nothing about SYNTHIA leaves having, in order: (a) seen an AI mind in a world and grasped what it is in the first five seconds, (b) understood in one more sentence that this is the first place they can do this themselves, (c) understood what *they* can do — build the world, set goals, inject thoughts, measure success, export data, (d) grasped that everything the AI does can be exported and sold into a real, growing market, (e) felt that the project is honest (it says plainly what is here today and what is coming next, and it does not pretend the AI knows them), and (f) clicked "try it" — or, if they are the curious-engineer type, clicked through to the architecture page and came back satisfied. It fails if a visitor cannot tell what SYNTHIA is after five seconds, or if the site reads as either hype or as an engineering document. The whole plan is tuned to that success condition: a simple, clear front that makes a stranger grasp what SYNTHIA is and immediately see how they could use it or profit from it — with the real engine waiting, quietly, for the few who want to look underneath.

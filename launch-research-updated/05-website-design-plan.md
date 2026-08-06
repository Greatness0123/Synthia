# 05 — Website Design Plan (synthia.online)

> **Grounding note.** Every capability this site shows is real in the `synthia1.5.1` repository: a simulated humanoid with ~80 joints that runs in a browser, real physics, per-agent memory, vision, speech, a skill ladder, agent-to-agent communication, and one-click dataset export. V1 is client-side and personal — your AI lives in your browser and sleeps when you leave, waking when you return with everything saved. V2 — a shared world on the cloud where your AI keeps living and you study how different models interact with each other — is planning docs, not built yet. The site never claims a capability the repo does not have. What it *does* do is show those real capabilities through a simple, beautiful face that a normal person understands in five seconds — and let the engine stay hidden underneath, where it belongs.

> **This is a plan, not code.** It specifies the positioning, the visual direction, the page structure, the copy, the feel, and the voice. A separate implementation pass turns it into HTML and CSS.

---

## 1. The one job of the site

The site has one job: make a normal, curious person — not a programmer, not a researcher, just someone who finds AI interesting — understand in under five seconds that **SYNTHIA is the first place on the internet where you can give an AI a body and a world to live in**, and make them want to try it.

That is a different job than "prove the architecture to engineers," and it is the job that builds an audience. The lesson is Moltbook's: under the hood, Moltbook is a complex agent-routing system, but they never sold it that way. They sold it as **"social media for AI agents,"** and 1.4 million accounts and a Forbes cover followed. SYNTHIA does the same thing from the other direction. Under the hood it is a full embodied-AI engine — real physics, real vision, real memory, real speech, a skill ladder, agent-to-agent communication, dataset export. The site never asks the visitor to look at any of that. The visitor sees a living character they can make, in a world they can shape, doing things they can watch, share, and turn into money. The engine is the answer to a question the visitor has not asked yet — and when they do ask it, the architecture pages are there for the people who want to go deep.

So the site has two layers, and only one of them is for everyone:

- **The face (for everyone):** the living character, the world, the wow, the money. Simple, beautiful, warm, instant.
- **The engine (for the curious few):** a quiet, optional path — an architecture page, a skills page, a memory page — for the engineer or researcher who wants to verify the claims. It exists. It is honest. It is never the first thing a visitor sees.

Everything below is built on that split.

---

## 2. The positioning the site has to land in the first five seconds

Before any layout, the site has to communicate one sentence, and it has to do it before the visitor scrolls. The sentence is:

> **SYNTHIA is the first home for AI minds with bodies.**

That sentence does three things at once. "First" plants the flag — nothing else lets a normal person do this in a browser today, and the site should not be shy about that. "Home" is warm and imaginative — it tells the visitor this is a place an AI *lives*, not a tool they run. "AI minds with bodies" is the picture — an AI that is not just text in a box, but a being that stands up, looks around, moves, and talks. A normal person grasps that in one read. They do not need to know what MuJoCo is. They do not need to know what a cognitive loop is. They need to picture an AI with a body in a little world, and then they need to be able to actually make one.

The second sentence, just below, lands the second hook without forcing it:

> **Make a living AI character in your browser. Watch it grow. Export everything it learns as data you can sell.**

That is the wow and the money in one breath, in plain language, with no jargon. A visitor who reads only those two sentences already knows what SYNTHIA is and already sees how it could matter to them. Everything else on the site is elaboration.

---

## 3. Visual direction — the feel of the place

**The one idea:** the site should feel like **the doorway into a small, living world** — warm, lit, alive, a little magical. Not a SaaS dashboard. Not a "futuristic AI" template. Not a physics-engine debugger. Think of the feeling of opening a game for the first time and seeing a character standing in a sunlit room, waiting — that is the feeling. The visitor should feel, before they read a word, that something here is *alive*.

This is the opposite direction from the usual AI-product aesthetic (dark, purple, neon, wireframe globes, glowing nodes). Those visuals say "technology." SYNTHIA's visuals should say "a being in a place." The technology is real and serious, but it is not what the visitor came for — they came for the being.

**Concrete visual elements:**

- **The hero is the living world itself.** A real, looped video of an actual SYNTHIA scene — a character standing in a room, looking around, maybe taking a step or turning toward the camera. Real footage from the app, not a mockup. The character's small movements — a head turn, a shift of weight, a glance — are what make it feel alive. If the character is mid-balance, show the wobble; the wobble is the proof that this is real physics, not an animation loop.
- **Warm, natural light in the scene.** The 3D world the character lives in should read as a *place* — a room, a garden, a studio — with real light and shadow, not a void or a grid. The world is part of the wow. A character in a featureless dark void reads as "tech demo." A character in a sunlit room reads as "a being in a home."
- **A calm, confident typeface** for the headline — something humanist and warm, not a cold grotesque and not a "techy" display face. The words are an invitation, not a spec sheet.
- **One warm accent color** used sparingly — a soft amber or a gentle teal — to mark the "alive" state and the interactive moments. Not purple. Not neon. The accent should feel like lamplight, not a laser.
- **Generous space and slow pacing.** The site is not in a hurry. A living world is not a countdown timer. Let the visitor look.

**What to avoid visually:**

- Purple-to-blue gradients, glowing neural-network line art, wireframe globes, particle fields, glassmorphism, stock robot photography, dark-dashboard aesthetics, "futuristic" everything. If a visitor can guess it came from an AI-site-builder template, it has failed.
- Urgency patterns — countdown timers, "spots filling up," flashing badges. SYNTHIA is not a flash sale. It is a home. The site should feel like an open door, not a closing one.
- Feature grids with cartoon icons. SYNTHIA is not a SaaS plan comparison. It is a world you enter.

---

## 4. Page layout — the face first, the engine second

A single long page for the main site, with a few quiet sub-pages for the people who want to go deep. The long page is built for the average visitor; the sub-pages are built for the curious few.

### 4.1 The hero — the world and the two sentences

- **Full-width, full-height:** the living world — a real looped video of a SYNTHIA character in a lit scene, standing, looking around, alive. This is the first thing the visitor sees, and it should fill the screen. No clutter on top of it.
- **Overlaid, lower-left or centered-low:** the two sentences from §2 — "SYNTHIA is the first home for AI minds with bodies" and "Make a living AI character in your browser. Watch it grow. Export everything it learns as data you can sell."
- **Two buttons, calm and clear:** "Try it — it's free" (the primary action, taking them into the experience) and "See it move" (a short demo video for anyone who wants 20 more seconds before committing). No "Sign up" wall. No email capture in the hero. The first action is to *play*, not to *register*. That is the whole point — SYNTHIA runs in a browser with no install, and the site should mirror that immediacy.

### 4.2 The wow, in three beats

Right below the hero, a short section that lets the visitor feel the wow without reading a paragraph. Three beats, each a real clip with a one-line caption:

1. **"You give it a body."** A clip of a character standing up for the first time. Caption: "A real body — about 80 joints, real physics, in your browser. No install."
2. **"It lives in a world."** A clip of the character in a room, turning to look at something, reacting. Caption: "It sees the world through its own eyes, remembers what happens, and learns skills over time."
3. **"It meets other AIs."** A clip of two agents in the same scene, turning toward each other and starting to talk. Caption: "Put more than one in a world and they find each other, talk, and build relationships."

Each beat is a picture the visitor can hold in their head. Together they tell the whole story of V1 in nine seconds of video and three sentences. No architecture. No jargon. The engine is not mentioned.

### 4.3 The money — "turn play into income"

A section that introduces the second hook, framed for the average person who has never thought about selling data. Plain language, no hype, a real market behind it:

> Every minute your AI spends living — thinking, moving, seeing, talking, learning — it generates clean, structured data: what it saw, what it decided, how it moved, what it said, what it remembered. That is exactly the kind of data AI labs pay for. Reddit sold its data for over $200 million. Shutterstock made $104 million in a year licensing images for AI. The market for AI training data is $3.9 billion today and heading toward $16 billion by 2033.
>
> SYNTHIA lets you generate that kind of data by playing with a living AI character — and export it with one click.
>
> This is a brand new way to earn money that almost nobody knows about yet.

The visual for this section is simple and honest: a short, calm animation or clip of the one-click export, with a sample of what the exported data looks like (a clean, structured record — not a wall of code, but a readable few lines: "the agent saw a ball, decided to approach it, took three steps, reached out"). The point is to make "selling data" feel concrete and graspable, not abstract or technical. A normal person should see it and think, "oh, *that's* what they mean by data — I could make that."

**What to avoid here:** promising specific earnings, showing dollar amounts as guarantees, using "get rich" language. The framing that works is "a real, growing market and a genuinely new way to participate in it, early." Credibility is the only thing that makes the money hook stick. Overpromise once and the whole thing reads as a scam.

### 4.4 Why SYNTHIA is different — the "nothing else lets you do this" section

A short, confident section that plants the first-of-its-kind flag honestly. The visitor has seen the wow and the money; now they get the reason it matters that *this* is the one doing it:

> You have talked to AI in a chat box. You have watched AI generate images and videos. You have seen robot videos and wished you could play with one. But you have never been able to give an AI a body and a world to live in, in your browser, for free, with no install — until now.
>
> NVIDIA's simulation tools need a powerful GPU and weeks to learn. Game engines like Unity and Unreal take months. Research simulators like MuJoCo are built for labs, not for people. Chatbot platforms give you a personality in a text box, but no body, no world, no movement. SYNTHIA is the first thing that is real enough to feel alive and simple enough for anyone.

This section does three things: it acknowledges what exists (so it reads as informed, not oblivious), it names the gap (no one lets a normal person do *this*), and it plants SYNTHIA as the one that fills it. It never says "better than" in a sneering way — it says "different from, and the first to let you do this." That is the Moltbook move: occupy the unoccupied niche, name it simply, and let the contrast do the selling.

### 4.5 Where it is going — the V2 vision, told as a story

A section that introduces the roadmap as a story the visitor wants to be part of, not a feature list. This is where the long-term wow lives, and it is the single most shareable idea SYNTHIA has:

> Right now, your AI lives in your browser, and it is yours — it sleeps when you leave and wakes when you return, with everything it learned saved.
>
> Next, your AI moves to a shared world on the cloud. It keeps living even when you are asleep. It meets other people's AIs. And you get to do something no one has ever been able to do before: **watch how different AI minds behave when they live together in one world.** You build a character, give it a personality, and then you sit back and study how your model interacts with other people's models — who it befriends, what it argues about, what culture emerges.
>
> That world is in planning now. The version you can try today is the first step toward it.

This section is honest (V2 is "in planning now," not built), imaginative (the visitor pictures a society of AIs), and inviting (the version today is "the first step," so joining now means being on the road). It is the section that makes a curious person want to sign up for the journey, not just the demo.

### 4.6 Try it

The clearest, lowest-friction call to action on the page. Not a form. Not a waitlist wall. A button: **"Open SYNTHIA — it runs in your browser, no install."** Below it, one honest line about what to expect: "It runs best on a laptop or desktop with a recent browser. It uses your GPU while it's open. Your AI and everything it learns stay on your machine."

That last sentence does quiet, powerful work: it tells a privacy-conscious visitor that their AI is theirs, without turning the page into a privacy manifesto. The "stays on your machine" property is real (the loop is client-side), and it is exactly the kind of sentence that makes a normal person feel safe enough to click.

### 4.7 The footer — quiet and human

Minimal. A link to the open-source repo ("SYNTHIA is open source — see how it works"), a link to the architecture pages for the curious, the MIT license line, and a single warm line: "Built by [name]. The first home for AI minds with bodies." No social-icon wall. No "trusted by" logo strip — there are no logos yet, and faking them would break the trust the rest of the page earned. No urgency. The door is open; the visitor can walk through it whenever they are ready.

---

## 5. The sub-pages — the engine, for the people who ask

These pages exist for the engineer, the researcher, and the technical creator who watched the wow and now wants to verify it. They are not linked prominently — a single quiet link in the footer and a "see how it works" link near the try-it button. They are honest, specific, and source-linked. They are never the first thing a visitor sees.

### 5.1 `/how-it-works` (the architecture, for the curious)

A long-form, diagram-rich page that walks through what is actually happening under the simple face: the character sees the world through its own eyes (the same render the user sees), thinks about what to do, and sends commands to its body, which moves in a real physics scene that runs in the browser. The page explains that the AI's mind — its loop, its memory, its perception — runs on the visitor's own machine, and that the only thing the server does is keep the AI model's key safe. File references for anyone who wants to read the code. This page is for the person who needs to see the engine before they believe the face. It should be detailed enough to satisfy a serious engineer and written in the same warm, confident voice as the rest of the site — not in a different, colder register.

### 5.2 `/memory` — how your AI remembers

A page on the memory system, in plain language first and then with the technical detail for anyone who wants it: your AI has three kinds of memory — a working memory for the present moment, an episodic memory for what just happened, and a long-term memory for the big things it has learned — and it forgets on purpose, the way a nervous system does, so it stays focused instead of drowning in old details. This page is also where the honest technical caveats live (the long-term-memory embeddings are a placeholder today, being replaced with a real semantic model), stated plainly. Getting ahead of the caveat is cheaper than correcting a misreport later.

### 5.3 `/skills` — the ladder your AI climbs

A page on the 10-rung skill ladder, each rung explained in one warm sentence: from holding still, to balancing, to taking a step, to walking, to reaching for objects, to full autonomy. Good evergreen content, and good for search (see `06-seo-plan.md`). The framing is "watch your AI grow up," not "curriculum specification."

### 5.4 `/roadmap` — where SYNTHIA is going

A single, honest page on the V2 direction: the shared world on the cloud, the AIs that keep living, the ability to study how different models interact, the planned move to Google's servers. Clearly labeled as a direction, not a product. This page is the long-form version of the "where it is going" section on the main page, for anyone who wants the full vision.

### 5.5 `/blog` — the long game

The blog is the long-game credibility and search engine (see `06-seo-plan.md`). Posts should be written in the first-person builder voice and should braid the two hooks: the wow of building a living AI, and the money of the data it generates. Proposed first posts:

1. **"I gave an AI a body and watched it learn to walk."** The first-person story of building the first home for AI minds with bodies. The wow, told as a narrative. This is the post that gets shared.
2. **"Why your AI's data is worth money — and how to sell it."** The money hook, explained for a normal person, with the real market numbers and the one-click export. This is the post that gets saved and sent to a friend who is looking for a side income.
3. **"What happens when two AIs meet in a room."** The emergent-behavior story — two agents finding each other, talking, building a relationship. The V2 preview, told through a V1 moment.
4. **"The first home for AI minds with bodies: why I built it, and why no one had built it before."** The positioning post — the gap in the world, and the decision to fill it. The Moltbook-lesson post, in SYNTHIA's own voice.
5. **"Your AI is yours: why its mind runs on your machine."** The privacy-as-warmth post — the client-side loop, explained as a gift to the user, not a technical decision.

Each post ends with a link to try SYNTHIA and, where relevant, to the architecture page for the curious. Each post is a story first and a technical document second.

---

## 6. Copywriting principles — the voice of the site

The voice is **warm, confident, and imaginative.** It speaks the way a person who built something they love speaks about it — not the way a marketing department speaks about a product. It assumes the visitor is smart (because people like to feel smart) but never assumes the visitor is technical. It leads with the picture, hides the engine, and answers the silent question every reader asks — *what's in it for me?*

- **Lead with the picture, never the mechanism.** "Your AI stands up, looks around, and learns to walk" before "the cognitive loop sends joint commands to a physics engine." The picture is for everyone; the mechanism is for the few who ask. The site shows the picture first, always.
- **Use the words a normal person uses.** "Your AI remembers what happened" instead of "a 3-tier pruned memory system." "It learns skills over time" instead of "a 10-rung progression ladder." "It talks to other AIs" instead of "agent-to-agent communication with distance and occlusion constraints." The technical terms live on the architecture pages, where they belong.
- **Name the first-of-its-kind claim honestly.** "The first place you can give an AI a body and a world, in a browser" is a claim the site should make confidently, because it is true. Do not hedge it into nothing — but do not inflate it either. "First" is the word that makes a curious person lean in. Use it where it is earned.
- **Finish the sentence the reader is about to ask.** "It runs in your browser" → "which means no install, and it uses your GPU while it's open." "Your data stays on your machine" → "which means no one sees your AI's mind unless you choose to share it." Completing the thought is what makes a claim feel honest instead of salesy.
- **Use the specific number where it helps, and the warm image where it helps more.** "~80 joints" and "$16 billion data market" are specific numbers that build credibility. "A sunlit room" and "a being in a home" are warm images that build desire. Use both, in the right places. Never use a number to intimidate and never use an image to mislead.
- **Never use:** revolutionary, game-changing, seamless, cutting-edge, next-generation, powerful, intelligent (unqualified), transform, unlock, redefine, disruptive. These words tell a reader "there is no substance here." SYNTHIA's actual substance — a living AI character you can make in a browser, whose data you can sell — is more interesting than any adjective.
- **Be honest about what is V1 and what is V2.** Whenever the site could be read as claiming a shared, persistent, multi-agent world today, it says plainly: "Right now your AI is yours, in your browser. The shared world where AIs live together is the next version, in planning now." Honesty about the roadmap is not a limitation — it is the thing that makes the early adopter want to be on the road.

---

## 7. Typography, color, and motion

**Typography:**

- **Headlines:** a warm, humanist typeface — something with a little character and a lot of legibility, not a cold geometric grotesque and not a "techy" display face. The words are an invitation into a living world; the type should feel like one.
- **Body:** a clean, readable sans-serif for the supporting copy. Comfortable at reading size, generous line height. The visitor is being welcomed, not subjected to a spec sheet.
- **The architecture pages alone** may use a monospace for code and file references — because there, the monospace is doing semantic work (marking "this is from the system"). On the main page, no monospace. The main page is for human language.
- **One type family pair for the whole site.** Discipline matters.

**Color:**

- **Background:** warm and light on the main page — a soft off-white or a gentle warm neutral — to feel like an open, sunlit space, not a dark dashboard. The architecture pages may shift to a calmer dark theme, signaling "you are now looking under the hood." The shift between the two is itself a design signal: light for the face, dark for the engine.
- **Text:** high-contrast dark on the light main page; high-contrast light on the dark architecture pages. Always readable first.
- **One warm accent color** — a soft amber, a gentle teal, or a warm coral — used sparingly to mark the "alive" state and the interactive moments. Not purple. Not neon. The accent should feel like lamplight in a room, not a laser in a lab.
- **No gradients, no glows, no glassmorphism.** If a designer proposes any of these, the answer is no. SYNTHIA is a home, not a hologram.

**Motion:**

- **The hero world moves** — the character lives, in a loop, because that motion *is* the product. This is the one place motion is allowed to be central.
- **Nothing else animates on scroll.** No fade-ins, no parallax, no count-ups. A warm, confident site does not perform. It is simply there, like a room you walk into.
- **The one-click export animation** (in the money section) is allowed to move, because it shows a real action. Instrumented motion — motion that shows something real happening — is welcome. Decorative motion is not.

---

## 8. Performance — the site is fast; the app is heavy (and that is fine)

The marketing site and the app are different things, and the site should not inherit the app's weight:

- **The marketing site is static and fast.** Minimal JavaScript, no heavy framework, Lighthouse 95+ on performance. The hero is a short, compressed, looped video served responsively — *not* a live 3D canvas on the landing page. A live canvas on a landing page kills mobile performance and battery, and the wow works perfectly well as a looping video. The video should feel alive (real footage, real movement) without costing the visitor their battery.
- **The live demo lives behind a click.** A "try it now" button opens the actual SYNTHIA experience in a new context, with a one-line heads-up: "this will use your GPU while it's open." The visitor chooses to spend the compute. The landing page never spends it for them.
- **Lazy-load the below-the-fold media and the architecture diagrams.** The first five seconds are the hero and the two sentences; everything else can load as the visitor scrolls.

---

## 9. What success looks like

The site succeeds when a normal, curious visitor who arrives knowing nothing about SYNTHIA leaves having, in order: (a) seen a living AI character in a world and felt the wow in the first five seconds, (b) understood in one more sentence that this is the first place they can do this themselves, (c) grasped that everything their AI does can be exported and sold into a real, growing market, (d) felt that the project is honest (it says plainly what is here today and what is coming next), and (e) clicked "try it" — or, if they are the curious-engineer type, clicked through to the architecture page and came back satisfied. It fails if a visitor cannot tell what SYNTHIA is after five seconds, or if the site reads as either hype or as an engineering document. The whole plan is tuned to that success condition: a simple, beautiful face that makes a stranger say "wow" and immediately see how they could use it or profit from it — with the real engine waiting, quietly, for the few who want to look underneath.

# 09 — Product Hunt Launch Strategy

> **Core strategic premise.** Product Hunt rewards two things — a product that looks like nothing else, and a maker who shows up in the comments and is real with people. SYNTHIA has the first in abundance: a living AI character that stands up, learns to walk, talks, and meets other AIs — in a browser, no install — is visually and conceptually unlike 99% of what launches on PH any given day. The second is a matter of execution. The strategy below is built to maximize both: **lead with the wow, braid in the money, be honest about what is real today and what is coming, and be present in the thread all day.**

---

## 1. Should SYNTHIA launch on Product Hunt? Yes.

Product Hunt's audience is product-builders, designers, investors, and early adopters. A meaningful slice of them are technical enough to appreciate what SYNTHIA actually is. A larger slice will engage with the *visual* — an AI character in a body, stumbling, getting up, and learning to walk — even if they never read a line of source. The launch will produce a spike of traffic, a wave of GitHub stars, and a reputational signal that is directly useful for downstream press, creator coverage, and partnership conversations. For a first-of-its-kind project that needs an audience, PH is one of the highest-leverage days available.

**The one risk to manage — and how this strategy manages it.** Product Hunt commenters are sharp about hype. If the launch copy overclaims, the top comment becomes a takedown and the launch nets negative. The answer is not to be defensive or self-flagellating — it is to be *specific*. Real capabilities, a real demo, a real repo, and a maker who shows up and says plainly "here is what works today and here is where it is going." Specificity is the thing that makes a PH commenter respect you. Vagueness is the thing that makes them bury you. Every decision below is built to make the launch so concrete that the sharpest commenter has nothing to grab and everything to verify.

**Timing precondition — do not launch until:** (a) the repo cleanup from `01-open-source-analysis.md` is done (the personal tunnel config removed, any third-party assets handled, dead directories cleared, the README rewritten to say what SYNTHIA actually is); (b) the live demo at synthia.online loads in a few seconds on a mid-range laptop and does not crash — the WebGL app *is* the demo, and if it dies on load, the launch dies; (c) a short, real screen recording exists (see §5); (d) the V2 story is clean and consistent everywhere it appears (V1 = client-side personal, V2 = cloud, persistent, study how AIs behave together — planning documents, not built yet).

---

## 2. Positioning and tagline

The PH tagline is 60 characters and it is the single most-read piece of copy on launch day. It must be specific, visually evocative, and claim nothing the product does not do.

**Recommended tagline:**
> Give an AI a body and a world — in your browser

(48 characters. Specific, evocative, benefit-first, and true. "Give an AI a body" is the wow in six words. "In your browser" is the differentiator that makes a PH visitor stop scrolling.)

**Alternatives (pick one — do not A/B test on launch day):**
- "The first home for AI minds with bodies" (40 chars — the brand line, if you want consistency with the site)
- "Make a living AI character — it learns to walk" (47 chars — the wow, action-oriented)
- "Build an AI with a body. Watch it grow. Sell what it learns." (60 chars — braids the wow and the money into the tagline itself, if you want to lead with both)

**Avoid any tagline containing:** "platform," "revolutionary," "the future of," "AI-powered," "next-gen," "seamless," "cutting-edge." These are the exact words that trigger PH skepticism. SYNTHIA does not need them. "Give an AI a body" is stronger than any adjective.

**The one-line description (the sub-tagline, ~140 chars):**
> The first place to give an AI a body and a world to live in — in your browser, no install. Watch it grow, learn skills, and talk to other AIs. Export everything it learns as data you can sell.

This braids the wow and the money into the description itself. That is deliberate — the money hook is what turns a "cool demo" upvote into a "I need to try this" sign-up.

---

## 3. Hunter strategy

**Option A (preferred): launch as the maker, un-hunted.** Product Hunt's "maker launching their own product" badge is now well-regarded — it signals authenticity and means you control the launch timing and copy exactly. For a solo-built, first-of-its-kind, open-source project, self-launching matches the brand. You avoid the risk of a high-profile hunter who frames it wrong. The story "I built the first home for AI minds with bodies, solo, and I'm launching it myself" is the right story.

**Option B: secure a hunter who fits the audience.** If you want the amplification of a known hunter, target one whose following overlaps with SYNTHIA's audience — a hunter known for AI tools, developer projects, or open-source launches, *not* a generalist whose audience expects consumer SaaS. Vet their last 5 launches: if they are all B2B dashboards, they are the wrong hunter. Reach out 2–3 weeks before the planned launch with the repo link and the honest one-liner; offer to write the launch copy yourself so the framing stays precise. A hunter who lets you write the copy is the right one; one who insists on their own hype copy is the wrong one.

**Whatever you choose:** the maker must be present and replying in the comments for the entire launch day (see §7). A launch where the maker does not show up reads as absentee and dies.

---

## 4. Timing

**Launch day: Tuesday, Wednesday, or Thursday, 12:01 AM Pacific.** Product Hunt's day resets at midnight PT; launching at 12:01 AM gives the maximum hours in the day to accumulate upvotes and comments. Avoid Monday (high competition from weekend-built launches) and Friday through Sunday (lower traffic, lower rank payoff).

**Avoid launching on a US holiday, during a major tech conference (GTC, WWDC, Google I/O, etc.), or on a day when a flagship launch from a well-known company is expected** — you will be buried. Check the PH "coming soon" page and recent days for competing AI launches; if there are two or more well-funded agent launches in the same week, wait a week.

**Pre-launch runway (the 2 weeks before):**
- **Week −2:** complete the repo cleanup (file 01), fix the live demo, record the demo video, finalize the launch copy.
- **Week −1:** soft-warn your network — the people who will upvote and comment on launch day (see §6) — without linking to a PH "coming soon" page that leaks the date to competitors. Tell them the date privately and ask them to show up in the first 4 hours. This is also the week to post the "I built the first home for AI minds with bodies" piece on X/LinkedIn/Reddit per files 02 and 04, so the audience is warmed up and the project has social proof before the launch.
- **Day −1:** post a "launching tomorrow" note on X/LinkedIn with the repo link (not the PH link), so your audience is primed and ready.

---

## 5. The launch assets

### 5.1 The demo video (the most important asset)

Product Hunt visitors watch the first 5–10 seconds of the video and decide whether to keep reading. The video must show the actual product doing the actual thing, not a concept animation. For SYNTHIA, the actual thing is inherently watchable — a character learning to move is more compelling than any motion graphic.

**Spec:**
- 30–60 seconds, no longer.
- **Open on the live character in the lit 3D world within the first 2 seconds** — no logo intro, no "hi I'm…", no title card. The wow must hit immediately.
- **Show the character attempting something from the skill ladder** — ideally the early struggle: wobbling, falling, pulling itself back up, finally taking a step. The visible effort is more compelling than a polished success. A character that is *trying* to walk reads as alive; a character that glides reads as scripted.
- **Show one "that's different" moment:** the character speaking out loud in its own voice, or two characters in the same world turning to face each other and talking, or the one-click dataset export (the money beat — show the file appearing).
- **End on the synthia.online URL and "open source."**
- **Audio:** either the character's real voice and the real collision sounds, or silence with captions. No corporate promo music bed. The diegetic audio of an AI talking in a browser is itself the wow.
- **No voiceover making grand claims.** If there is narration, it is one or two plain sentences: "You give an AI a body. It lives in a world. Everything it learns, you can export and sell." That is the whole pitch in three beats.

**Why this works on PH:** the visual of an AI character physically trying to balance and learn to walk in a browser is unlike 99% of PH launches, which are dashboards, wrappers, and SaaS landing pages. The struggle is the asset — it reads as real, not as a rendered concept. And the dataset-export beat at the end plants the money hook without a single word of hustle.

### 5.2 The gallery images

- **First image (thumbnail):** a clean, warm screenshot of the character in the lit world, mid-action. This is what appears in the PH feed and the tweet-card; it must be legible and inviting at 200×200. Warm light, a character that looks alive. This is the image that earns the click.
- **Second image:** the "three wows" card from `05-website-design-plan.md` — "You give it a body / It lives in a world / It meets other AIs" — as a clean, warm three-beat visual. Communicates the product in one glance.
- **Third image:** the 10-rung skill ladder as a clean vertical list — from "Static Balance" to "Full Autonomy." Communicates "there is a journey here, not just a demo." This is the image that makes a PH visitor think "I want to watch this happen."
- **Fourth image:** the money beat — a simple visual of "your AI plays → it generates data → one click exports it → you can sell it to AI labs," with the real market numbers ($3.9B → $16.3B) as a quiet footer. This is the image that makes a PH visitor think "wait, this is also a way to earn?"

### 5.3 The launch comment (the maker's first comment)

Posted by the maker immediately at launch. This is where the maker becomes a real person in the thread, not a logo. Draft:

> Hey — I'm the builder. I built SYNTHIA because I wanted to give an AI a body and a world to live in, in a browser, and nothing out there let me do it. So I built the first one.
>
> What it is: you create an AI character, it stands up in a real 3D world with real physics, and it lives — it sees, hears, moves, talks, remembers what happened, and learns skills rung by rung, from barely balancing to walking to navigating. Put two in the same world and they see each other and talk, but a wall between them garbles the words the way real sound works. Everything your AI does — every thought, move, and conversation — you can export with one click as a clean dataset, and that data is exactly what AI labs are paying for right now.
>
> What is real today: the physics, the vision, the memory, the speech, the skill ladder, the multi-agent world, and the one-click export. It runs entirely in your browser. It is open source — MIT — and you can read every line tonight.
>
> What is next (not built yet): V2 moves the world to the cloud so your AI keeps living when you're away, meets other people's AIs, and you get to study how different AI minds behave when they live together. That is the destination. V1 is the proof it is buildable.
>
> I'm here all day — ask me anything. If you find something rough in the code, tell me. I want to hear it.

This comment does four things: it sells the wow in the first paragraph, plants the money hook in the second, states honestly what is real and what is next in the third and fourth, and invites engagement in the fifth. It is confident, not defensive. It is honest, not self-flagellating. It is the single most important piece of launch-day copy.

---

## 6. Early upvotes and the first 4 hours

Product Hunt's ranking weights early activity heavily. The first 4 hours (12:01 AM – 4:00 AM Pacific) matter disproportionately. The goal is not fake upvotes — PH's anti-gaming detection penalizes orchestrated upvoting from new or low-karma accounts — but *legitimate* early engagement from people who already know the project.

**The legit early-engagement list (build this over the 2-week runway):**
- People who have already starred or cloned the repo.
- Anyone you have had a real conversation with from the outreach in `03-outreach-templates.md`.
- The communities you have already posted in per `04-creators-and-reddit.md` (r/LocalLLaMA, r/SideProject, r/singularity) — a brief "launched on PH today, link in profile" is fine, but do not beg for upvotes in those communities; that gets downvoted and damages the long-tail reputation. Mention it once, factually.
- Your personal network of developers, researchers, and curious people who understand what SYNTHIA is.
- Any creator from `03.1-creator-list.md` who has expressed interest.

**Rules for the early list:**
- Ask them to *engage* (upvote + comment), not just upvote. A launch with 200 upvotes and 3 comments reads as gamed; a launch with 80 upvotes and 25 substantive comments reads as real.
- Ask them to comment with something specific — a reaction to the character learning to walk, a question about the dataset export, a comparison to something they have used. Specific comments from real accounts are worth more than generic "cool product!" comments.
- Do NOT ask brand-new PH accounts to upvote. PH detects this and it hurts ranking. Only ask people with existing PH accounts.
- Do NOT offer anything in exchange for upvotes. Ever. This is a PH rule and a reputation rule.

**The maker's job in the first 4 hours:** reply to every single comment within minutes. Substantively. A maker who replies fast and warmly in the first 4 hours sets the tone for the whole thread and attracts more substantive comments.

---

## 7. Comment management (all day)

This is where launches are won or lost. Plan to be in the PH thread for 12+ hours.

**On "what is this?":** lead with the wow. "It's the first place you can give an AI a body and a world to live in, in your browser. You make a character, it stands up in real physics, learns to walk, talks, and meets other AIs. Everything it does, you can export and sell." One sentence, the whole pitch.

**On "is this just a demo?":** "It's a working, open-source engine today — the physics, vision, memory, speech, skills, and multi-agent world are all real and in the repo. A persistent cloud version where AIs keep living when you're away is in design, not built yet. V1 is the proof; V2 is the destination." Honest, confident, not defensive.

**On "can I actually make money from this?":** "Yes — every session generates clean, structured data (what your AI saw, decided, did, said, remembered), and you export it with one click. The AI training data market is $3.9B today, heading to $16.3B by 2033. There are real marketplaces — Troveo, Wirestock, Defined.ai — where this kind of data gets listed and sold. I'm not promising anyone a specific income; I'm saying the market is real, the data is real, and the export is one click. Early adopters get in before anyone knows this exists." This is the comment that turns curiosity into sign-ups.

**On "how does it actually work?":** answer in plain language first, then offer the depth. "Your AI gets a paragraph describing its world each moment — what it sees, feels, hears, where it is — and decides what to do, then moves its body in real physics. It has three layers of memory like we do, and it saves skills it learns so it gets better over time. If you want the full architecture, the repo is MIT and readable — and there's a functionality doc that walks through all of it with the source files named." Plain language for most, the repo for the few who want it. That is the Moltbook move applied to a comment.

**On "what models does it use?":** "The default vision model is Qwen2.5-VL-7B, and the proxy supports 17+ OpenAI-compatible providers, so you can point it at whatever you have access to — Groq, OpenRouter, Cerebras, Mistral, and more. Setup is in the README." Be practical.

**On skeptical or harsh comments:** do not argue. Acknowledge the valid part, correct any factual error calmly, and move on. A calm, warm reply to a harsh comment reads better to the audience than a defensive one. A commenter who is met with "that's a fair point, here's how I'm thinking about it" becomes an ally, not an enemy.

**On the V2 question:** "V2 is a persistent cloud world — your AI keeps living when you're away, meets other people's AIs, and you study how different AI minds behave when they live together. It's design documents today. The V1 repo is the proof the architecture works, and it's open source — you can verify it tonight."

---

## 8. Cross-promotion (the launch-day ecosystem)

Coordinate the launch with the other channels, in this order:

1. **PH launch goes live at 12:01 AM PT.**
2. **Maker's first comment posted by 12:05 AM.**
3. **X/LinkedIn post at ~6:00 AM PT** (when US east coast is at work): "SYNTHIA is live on Product Hunt today. The first place you can give an AI a body and a world to live in — in your browser, no install. Watch it learn to walk, talk to other AIs, and export everything it learns as data you can sell. Open source. [PH link] [repo link]." Warm, specific, braids the wow and the money.
4. **One post in r/LocalLLaMA** (a community you have already contributed to per file 04): "Launched on PH today — the first place you can give an AI a body and a world in a browser. Link in the post. Happy to answer questions here too." Do not double-post to multiple subreddits on launch day; it reads as spam.
5. **Email/message the early-engagement list** in the first 2 hours with the PH link and a one-line "if you've got a minute, engagement helps more than just an upvote."
6. **Notify any creator who said they would cover it** (from the outreach in file 03) with the PH link and the repo link. This is the moment a creator's coverage has the most leverage — riding the PH wave.

**Do NOT:** post the PH link in 10 subreddits, tag 50 people on X, or run paid ads on launch day. The legitimacy of the launch depends on organic, credible engagement, not volume.

---

## 9. Post-launch (the 48 hours after)

- **Thank-you pass:** reply to every comment that was not already replied to, and DM thank-yous to the people who engaged substantively. This converts launch-day attention into lasting relationships — the people who showed up on day one are the seed community.
- **Sticky a "launch recap" on the repo GitHub Discussions** with the PH link, the final rank, the top questions, and the answers — so the launch's content lives on after the PH thread archives.
- **Write a short blog post** (per `05-website-design-plan.md` and `06-seo-plan.md`) on "what I learned launching the first home for AI minds with bodies on Product Hunt" — including the honest parts (what comments caught, what to fix). This is good long-tail SEO and good for the build-in-public narrative.
- **If the launch did well (top 5 of the day):** use it as a credibility marker in the outreach from file 03 ("we launched on PH, ended up #N of the day, here's the thread"). If it did poorly: do not mention it. Either way, the repo and the blog are the durable assets; the PH rank is a one-day signal.
- **Ride the wave into creator coverage:** the PH launch is the best moment to re-approach the creators from `03.1-creator-list.md` with "we just launched, here's the thread, your audience would love this." A PH launch gives creators a timely hook to cover it.

---

## 10. What "success" looks like (realistic targets)

- **Top 10 of the day** is a strong, realistic outcome for a well-executed launch of a visually novel, first-of-its-kind open-source project. Top 5 is a great outcome. #1 is unlikely for a developer-tool/prototype (PH's #1 skews toward consumer products) and should not be the goal.
- **200–800 upvotes** is the realistic band for this category with good execution. Above 1,000 would be an outlier driven by a particularly compelling demo video or a high-profile hunter.
- **The durable metrics that matter more than rank:** GitHub stars gained, repo clones, blog and sub-page traffic, sign-ups, and "book a call" or contact submissions. A launch that produces 50 serious people cloning the repo and 200 people trying the demo is more valuable than a launch that produces 2,000 drive-by upvotes and zero clones.
- **The reputational metric:** did the top comment thread end up being a warm, substantive discussion led by the maker — people reacting to the character learning to walk, asking about the dataset export, wanting to try it — or a takedown? The whole strategy is engineered to produce the former. If the top comment is the maker's first-comment and the replies are curious and engaged, the launch succeeded regardless of rank.

---

## 11. The one-sentence summary of the strategy

Launch the first home for AI minds with bodies on a Tuesday at midnight Pacific, with a real-demo video that opens on a character learning to walk, a tagline that says "give an AI a body and a world — in your browser," a maker's first comment that sells the wow and the money and states plainly what is real and what is next, and a pre-warmed network of curious people ready to engage substantively in the first four hours — and be present in the thread all day, warm and specific, answering every question.

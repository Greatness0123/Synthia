# 01 — Should You Open-Source SYNTHIA?

This file answers the real question, not a technical one. The question is not "are there risks in the code." The question is:

**Should I open-source SYNTHIA? What happens to the economics if I later decide to turn it into a startup? What if someone wants to buy SYNTHIA? What are the economic benefits and consequences in each case? What do you advise for each condition?**

Every answer below is written for a founder thinking about money, leverage, and long-term option value — not for an engineer worried about a config file.

---

## The short version first

SYNTHIA is the **first home for AI minds with bodies** — the first thing on the internet that lets a normal person create a living AI character in a browser, watch it grow a personality and learn skills, and export its mind as data they can sell. That "first of its kind" position is your single most valuable asset. Open-sourcing is a *strategy for protecting and growing that asset*, not a giveaway. Done right, it makes you harder to compete with, easier to acquire, and richer when you eventually monetize. Done wrong, it hands your moat to someone faster than you.

Here is the decision in one line: **Open-source the engine. Keep the cloud (V2), the brand, and the dataset marketplace closed.** That split is what creates the economic upside in every scenario below.

---

## Condition 1 — You open-source and stay independent (the community play)

### What you gain

**You become the center of a new category.** There is no open-source "living AI character" project today. NVIDIA Isaac Sim exists, but it is a heavy robotics simulator that needs a GPU and an engineering degree — it is not something a normal person opens in a browser. MuJoCo standalone is a physics engine for researchers. Character.AI gives you a chat box, not a body. SYNTHIA is the only thing that gives an AI a *body and a world* and runs in a browser with no setup. If you open-source it, you do not just get users — you become *the project* that defines the category. Every tutorial, every "I made my AI learn to dance" video, every GitHub star points back to you.

**Free distribution you could never buy.** A good open-source project markets itself. People write blog posts about it. It trends on GitHub. It gets submitted to Hacker News and r/programming on its own. A closed project has to pay for every visitor. An open one earns them. For a first-of-its-kind project, the curiosity factor is enormous — "I gave an AI a body in my browser" is the kind of thing people share before they even try it.

**Contributors extend your roadmap for free.** The community will build the things you would never get to alone — new bodies, new worlds, new skill modules, integrations with other AI models. Each one makes SYNTHIA more useful and harder to fork-and-beat, because the fork starts without the community.

**It feeds the dataset story.** The more people running SYNTHIA, the more data the ecosystem generates. If you keep a central dataset marketplace (see Condition 2), every open-source user is a potential data supplier — and you take the platform cut. Open-sourcing the engine grows the supply side of your future business.

**It builds the reputation that makes everything else possible.** "The person who open-sourced the first embodied-AI platform" is a title that opens doors — to press, to investors, to hiring, to speaking, to acquisitions. You cannot buy that credibility. You earn it by giving the engine away.

### What it costs you

**You give away the code, not the business.** The code is the engine. The business is the brand (SYNTHIA, synthia.online), the cloud world (V2), and the dataset marketplace. Open-sourcing the engine does not give away any of those. This is the same model that made Vercel, Supabase, and PostHog valuable: open core, closed cloud. The open part grows the brand and the community; the closed part collects the revenue.

**You accept that forks will exist.** Someone will copy the repo, rename it, and try to compete. This is inevitable and, honestly, fine. Forks almost never beat the original, because the original has the community, the brand, and the momentum. The only fork that beats you is one that out-builds you and out-cares-for-the-community you — and if someone does that, they earned it. The defense is not a license clause; it is *keep shipping and keep the community happy.*

**You have to maintain it in public.** Open-source is a commitment. Issues, PRs, releases, communication. If you go silent, the project dies and the community leaves. This is real work, but it is the work that creates the value above. If you cannot commit to it, do not open-source — see Condition 4.

### My advice for Condition 1

**Do it, but structure it as open-core, not open-everything.** Open-source the V1 engine under MIT (which the repo already uses — Copyright (c) 2026 Greatness Okorie). Keep V2 (the cloud persistent world) and the dataset marketplace as your closed products. Build synthia.online as the brand and the hosted destination. The open engine is your marketing and your moat; the closed cloud and marketplace are your revenue. This is the single best-known pattern for turning a first-of-its-kind open project into a durable company. Before you publish, do a quick cleanup pass — remove any personal tunnel config, replace any third-party assets you do not have the right to redistribute, and write a real README (not the default Vite template). None of this changes the strategy; it just makes the first impression clean.

---

## Condition 2 — You open-source now and convert to a startup later

This is the most likely path, and it is the one where open-sourcing helps you the most.

### What you gain

**You raise money on traction, not on slides.** Investors fund momentum. An open-source SYNTHIA with 5,000 GitHub stars, a trending demo, and a community of builders is a *far* stronger fundraising story than a closed prototype and a pitch deck. The stars and the community are proof that the category is real and that you are the leader of it. You walk into a VC meeting with the market already voting.

**You have three revenue lines already designed in.** When you turn SYNTHIA into a startup, you do not have to invent a business model — the repo already implies three:

1. **The cloud world (V2).** V1 is free and personal. V2 — the persistent shared world where AIs live together on Google's servers and you study how they interact — is the paid tier. People pay to keep their AI alive in the cloud, to give it a bigger world, to host more agents. This is the "open core, closed cloud" revenue that Vercel, Supabase, and GitLab all run.
2. **The dataset marketplace.** This is the sleeper hit. Every AI in SYNTHIA generates clean, structured, exportable data — what it saw, what it did, what it said, what it learned. The AI training data market is $3.9B in 2026, growing to $16.3B by 2033 at 22.6% a year. Reddit sold its data for $203M+. Shutterstock made $104M in a year. You run the marketplace where SYNTHIA users sell their agents' data to AI labs, and you take a platform cut on every deal. Open-sourcing the engine grows the supply of data suppliers for free. This is the revenue line that makes investors' eyes go wide, because it connects SYNTHIA to the biggest spenders on earth (OpenAI, Google, Anthropic, Meta — all writing nine-figure data checks right now).
3. **Premium bodies, worlds, and skills.** A marketplace for community-made assets — new character bodies, new environments, new skill packs — with a revenue share. The open-source community builds the supply; you take a cut of the marketplace. Unity and Roblox both run this model successfully.

**Your open-source history becomes your due-diligence advantage.** When a VC or an acquirer looks at SYNTHIA, the open-source history is evidence: the code is real, the community is real, the adoption is real, and you are the obvious owner. There is no "is this actually built?" question. The repo is the proof.

*my input: the persistence for single users should exist as a paid tier so people pay so they do not have to keep their laptop on for inference 

### What it costs you

**You must decide the license before you need to, not after.** MIT (what the repo uses now) is permissive — anyone can use it commercially, including competitors. That is fine for maximizing adoption, but it gives you less leverage if you later want to close something. If you want more control later, consider a license with a "if you compete with our cloud, you need a commercial license" clause (the "Business Source License" or a custom clause). You do not have to do this now, but you should *think* about it now, because changing a license after hundreds of contributors is nearly impossible without their consent. **My recommendation: stay MIT for the V1 engine to maximize adoption, and keep V2 and the marketplace fully closed from day one.** That split gives you the adoption upside and the monetization control simultaneously.

**You set an expectation of free.** Once something is open and free, charging for the cloud version requires clear messaging — "the personal version is free forever; the living-cloud world is paid." Done well (Vercel, Supabase do this), people happily pay for convenience and scale. Done poorly, you get "why isn't the cloud free too" complaints. The fix is framing, not pricing: the free version is *yours alone*; the paid version is *your AI living in a society*. Two different products.

### My advice for Condition 2

**Open-source V1 now under MIT. Start the company when the community proves the category (target: 3,000–5,000 stars and one viral demo moment).** At that point, raise on the open-core, closed-cloud, plus-dataset-marketplace thesis. The dataset marketplace is the line that makes this a fundable company and not just a project — lead with it in every pitch. You are not selling "an AI simulation tool." You are selling "the first platform that turns AI play into AI training data, and we already have the open-source engine that generates it."

---

## Condition 3 — Someone wants to buy SYNTHIA

This is the scenario most founders do not plan for, and it is the one where your open-source decision matters most.

### What you gain by having open-sourced

**A bigger, more credible acquisition target.** Acquirers buy momentum, communities, and categories — not just code. An open-source SYNTHIA with a real community is worth *more* in an acquisition than a closed prototype, because the acquirer is buying the category leader along with the codebase and the audience. A closed project with 100 users is a hire. An open project with a community is a *platform acquisition*. The price difference is not 2x. It is 10x or more.

**A cleaner, more legible asset.** Open-source code is auditable. An acquirer's engineers can clone it, run it, and verify it in an afternoon. Closed code requires NDAs, access grants, trust-building — all of which slow down and sometimes kill deals. Open code is *due-diligence-ready by default.*

**Multiple acquirers, not one.** If SYNTHIA is closed, the only buyers are the ones you pitch directly. If it is open and trending, *every* AI lab, every platform company, every "we need an embodied-AI story" corporate development team sees it on their own and comes to you. Competition among buyers is what drives price. Open-sourcing creates that competition for free.

**You keep leverage even in a sale.** If you open-source under MIT, the code remains free forever — which means an acquirer cannot "lock it up" without angering the community. This sounds like a downside, but it is actually a *negotiating strength*: it means the acquirer is buying *you, the team, the brand, the community, and the roadmap* — not just a code grab. That is a more valuable acquisition and a higher price. The acquirer who just wants to grab code and fire you will not pay well anyway; the acquirer who wants the living project will pay a premium *because* the community comes with it.

### What it costs you

**You cannot sell exclusivity.** Because the code is open, you cannot sell someone "the only copy." You are selling the brand, the community, the team, the cloud, and the future — not a monopoly on the code. For a first-of-its-kind category leader, this is almost always the better deal anyway. The acquirer who needs a code monopoly is not your buyer; the acquirer who needs a *category* is, and they pay more.

**You must own the brand and the trademark cleanly.** This is the one thing to get right *before* any acquisition conversation: make sure "SYNTHIA," the synthia.online domain, and the brand are owned by you (or your company), not licensed out. Open-source the *code*; never open-source the *name*. The name is what the acquirer is buying along with the community. Protect it.

### My advice for Condition 3

**If acquisition is even a possibility, open-sourcing makes you more acquirable, not less — and at a higher price.** Keep the code MIT, keep the brand and cloud proprietary, and maintain a clean ownership trail for the trademark. When a buyer comes, you are selling "the leader of the embodied-AI category, with a community, a brand, a cloud roadmap, and a dataset marketplace pipeline." That is a strategic acquisition, priced like one. A closed repo with no community is an acqui-hire, priced like one.

---

## Condition 4 — You keep it closed (do not open-source)

For completeness — this is the alternative, and you should know its costs honestly.

### What you gain

**Total control.** No forks, no license decisions, no community maintenance, no expectation of free. You can pivot, rebrand, or monetize however you like with no one to answer to.

**You can charge from day one.** No "free version / paid version" conversation. Every user is a paying user or a gated user.

### What it costs you — and this is the big one

**You pay for every single user.** A closed, unknown project has no organic distribution. You buy ads, you cold-DM, you hustle for every visitor. An open, first-of-its-kind project gets Hacker News front pages, GitHub trending, YouTube tutorials by strangers, and Reddit threads — for free. For a category nobody has seen before, that free curiosity-driven distribution is worth more than any ad budget you could afford. Giving it up is the most expensive "saving" you can make.

**You forfeit the category-leader position.** If you stay closed and someone else open-sources an embodied-AI-in-a-browser project — even a worse one — *they* become the category leader, and they get the community, the press, and the acquisition leverage described above. You become "the closed alternative." In new categories, the open project usually wins the mindshare war, because curiosity is the entire marketing engine and open projects are more curious to strangers.

**You make the dataset marketplace harder to start.** The marketplace needs *suppliers* — people running SYNTHIA and generating data. Open-sourcing creates suppliers for free. A closed project has to recruit, onboard, and incentivize every supplier one by one. The marketplace is the single biggest revenue line available to you; starving its supply side to protect the code is working against your own business model.

**You shrink the acquisition price.** See Condition 3. Closed = acqui-hire money. Open + community = strategic acquisition money.

### My advice for Condition 4

**Only stay closed if you cannot commit to maintaining an open project.** If you genuinely do not have the time or the desire to run a community — answer issues, review PRs, communicate — then a closed, slow, personal project is honest and fine. But understand the trade: you are trading the category-leader position, the free distribution, the dataset supplier base, and the acquisition leverage for control and quiet. For a first-of-its-kind project, that trade is almost never worth it. The recommendation is Condition 1 or 2, not this one.

---

## The recommendation, in one place

| Condition | Open-source? | Why |
|---|---|---|
| Stay independent, build community | **Yes — open-core** | Becoming the category leader is worth more than the code you give away. Keep V2 + marketplace closed. |
| Convert to a startup later | **Yes — open V1 under MIT, keep V2 + marketplace closed** | Open source gives you traction to raise on; the closed cloud and dataset marketplace are the revenue lines. |
| Someone wants to buy it | **Yes — having open-sourced already makes you worth more** | Acquirers buy momentum and communities, not just code. Open = strategic-acquisition price; closed = acqui-hire price. |
| Cannot maintain a community | **No — stay closed** | A dead open project is worse than a quiet closed one. Only choose this if you will not maintain the project. |

**The move that wins in three of four conditions:** open-source the V1 engine under MIT, keep the V2 cloud and the dataset marketplace proprietary, and own the SYNTHIA brand and trademark cleanly. That single split protects your moat, grows your distribution for free, feeds your future revenue lines, and maximizes your acquisition price — all at the same time.

---

## Before you publish (the practical cleanup, kept short)

This is the only technical part of this file, and it is short because it is mechanical, not strategic. Before the repo goes public, spend an afternoon on these so the first impression is clean — none of them change any decision above:

- Remove the personal tunnel config file (`frpc.ini`) that leaks a private server address — it should not be in a public repo.
- Replace or remove the Mixamo/Adobe character assets (`public/models/`, `public/animations/`) — their license does not allow redistribution under MIT. Use an open-licensed body or note it as a placeholder.
- Delete the leftover `coordinator/` directory if it is unused — a dead directory in a public repo confuses contributors.
- Write a real `README.md` (the current one is the default Vite template). The real project description lives in `SYNTHIA_README.md` — promote it to the front door.
- Confirm the embedding setup is described honestly in the README if a contributor will notice it is a placeholder.

That is it. An afternoon. Then publish, and let the category-leader position do the work.

# SYNTHIA Client Refactor — Phase 1: Serverless AI Proxy Layer

## Scope Confirmation (read first)

This entire refactor is **fully client-side** — physics, multi-agent state, camera, UI, God Mode,
dataset export. There is exactly **one exception, and it's non-negotiable**: LLM provider API keys
cannot be shipped into browser JavaScript under any circumstances — they'd be extractable from the
network tab or bundle by anyone. This phase builds the smallest possible thing that keeps keys
secret without reintroducing a real backend.

**Everything removed/simplified from the old coordinator, confirmed explicitly:**
- No persistent Node process, no WebSocket server, no port 3001.
- No video export feature — dropped entirely, not deferred.
- No server-side Supabase keepalive cron — replaced by a client-side interval ping (Phase 7).
- No in-memory server state of any kind — every function call is stateless request/response.

## Objective

One stateless Vercel API route per LLM provider (Gemini, OpenAI-compatible/Groq/OpenRouter, etc.),
each doing nothing but: receive a payload from the client, attach the correct server-side API key,
forward to the provider, stream the response back. No business logic, no prompt construction, no
memory access — all of that stays client-side and is covered in Phase 2.

## Tasks

1. **`/api/infer/gemini.ts`, `/api/infer/openai-compat.ts`** (Vercel API routes). Each accepts the
   already-fully-built request payload from the client (system prompt, messages, images — built
   client-side, not here), attaches `process.env.GEMINI_API_KEY` / equivalent from Vercel
   environment variables, forwards to the provider's actual endpoint.
2. **Streaming passthrough.** Use `ReadableStream` to stream the provider's response back to the
   client as it arrives — don't buffer the full response server-side before responding; that
   defeats the purpose of streaming thought output and risks hitting Vercel's function timeout on
   longer completions.
3. **Timeout awareness.** Vercel's Hobby tier caps at 10s, Pro at up to 60s+ depending on config.
   Start streaming immediately upon receiving the first token from the provider — don't wait for
   completion before sending anything back to the client. If a provider call risks exceeding the
   timeout on a Hobby-tier deploy, surface that as a real constraint to plan around, not something
   to silently hope doesn't happen.
4. **CORS/auth minimalism.** Since this proxies to paid provider APIs using your keys, add a basic
   rate-limit or shared-secret check (e.g. a simple header token baked into the client build) so
   the endpoint can't be trivially discovered and abused by someone else hammering your API budget.
   This doesn't need real user auth — just enough friction that it's not a wide-open free relay to
   your provider account.
5. **Environment variables.** Document exactly which keys go in Vercel's environment variable
   settings (`GEMINI_API_KEY`, `OPENAI_COMPAT_API_KEY`, etc.) — never committed to the repo, never
   present in any client-side file.

## What This Phase Does NOT Do

No prompt building, no `InferPayload` assembly, no memory read/write, no action parsing/
normalization, no per-agent orchestration. All of that is genuinely client-side logic and belongs
in Phase 2 — this phase is purely "make an authenticated call to a provider without exposing the
key," nothing else.

## Test Before Calling This Phase Done

- Confirm no API key appears anywhere in client-side bundle output or network requests visible to
  the browser — inspect the built bundle, not just the source.
- Confirm streaming actually streams (tokens arrive incrementally in the client, not all at once
  after a delay matching total generation time).
- Confirm a deliberately long completion doesn't silently fail on Hobby-tier timeout without a
  clear error surfaced to the client.

## Completion Checklist

- [ ] One stateless proxy route per provider, no server-side state anywhere
- [ ] Keys confirmed absent from client bundle and network payloads
- [ ] Streaming confirmed working end-to-end
- [ ] Basic abuse-prevention (rate limit or shared secret) in place

## Before Ending This Phase

Write `PHASE_1_COMPLETE.md`: which providers were wired, the exact environment variable names used
(not the values), and confirmation the key-exposure test passed.

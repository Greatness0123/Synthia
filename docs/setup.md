# SYNTHIA: Setup Guide

This guide walks you through setting up SYNTHIA as a fully client-side application that talks directly to AI model providers and (optionally) your own Supabase instance.

---

## Table of Contents

- [Part 1: Running the App](#part-1-running-the-app)
- [Part 2: Supabase Database Setup](#part-2-supabase-database-setup)
- [Part 3: Inference Backend Setup](#part-3-inference-backend-setup)
- [Part 4: First Run and Configuration](#part-4-first-run-and-configuration)

---

## Part 1: Running the App

### Requirements

- **Node.js** 20 or newer (see `.nvmrc` in the repo)
- A modern browser with **WebGL 2.0** support
- **4GB+ RAM** recommended

### Install and Start

```bash
# 1. Clone the repository
git clone https://github.com/Greatness0123/synthia.git
cd synthia

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Part 2: Supabase Database Setup

The app can use your own Supabase instance for persistent memory. This is **optional** but recommended for long-term memory across sessions.

### 2.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up.
2. Create a new project.
3. Note your **Project URL** and **anon public key** (Settings > API).

### 2.2 Enable the Vector Extension

1. In the Supabase Dashboard, go to **Database > Extensions**.
2. Search for **vector** and enable it (required for embedding search).

### 2.3 Run the Schema

1. Go to the **SQL Editor**.
2. Open `supabase/schema.sql` from the repository.
3. Paste and run it.

This creates the `sessions`, `memories`, `skills`, `motor_programs`, `agent_identity`, and `agent_identity_log` tables, plus the `match_memories` search function.

### 2.4 Setup Storage Bucket (Older Versions)

If your version of SYNTHIA uses visual frame buffers:

1. Go to **Storage** in the Supabase Dashboard.
2. Create a bucket named `Synthia-frames`.
3. Make it **Public**.

### 2.5 Get Credentials

Go to **Project Settings > API** and copy:

- **Project URL**
- **anon public key**

### Supabase Free-Tier Pause Limitation

Free-tier Supabase projects pause after **7 days of inactivity**. SYNTHIA ships a client-side keepalive ping that fires a lightweight database query every 24 hours while the app tab is open. If your project pauses anyway, simply click **Restore Project** in the dashboard.

---

## Part 3: Inference Backend Setup

You need an AI model provider to power the cognitive loop. Choose one of these:

### Option A: Use a Hosted Provider Directly

The simplest setup. Works with any OpenAI-compatible provider:

- **Google Gemini**
- **Groq**
- **OpenRouter**
- **NVIDIA NIM**
- **Cerebras, Mistral, and more**

Enter your API key directly in the app's settings modal. The key is stored in your browser's localStorage and sent directly to the provider.

### Option B: Deploy the Serverless Proxies

The `api/infer/` directory contains Vercel Edge functions that keep provider keys server-side. Deploy these to Vercel and configure the environment variables listed in `.env.example`.

```bash
# Deploy using Vercel CLI
vercel deploy
```

### Option C: Run the Kaggle GPU Server

For high-performance vision-language inference, use the provided `kaggle_server.py`:

1. Create a Kaggle notebook and set the **Accelerator** to **GPU T4 x2**.
2. Turn **Internet** **On** in the notebook settings.
3. Paste and run `kaggle_server.py` in a cell.
4. Look for the public tunnel URL in the output (e.g., `https://xxx.trycloudflare.com/infer`).
5. Paste that URL into the app's settings modal.

---

## Part 4: First Run and Configuration

1. Launch the app at `http://localhost:5173`.
2. Click the **gear icon** in the top-center pill.
3. Under the **Inference and Database** settings:
   - Select your AI provider.
   - Enter your API key and/or endpoint URL.
   - **Optional:** Enter your Supabase URL and anon key.
4. Click **Deploy Cognition Config**.
5. The agent will initialize, retrieve connection summaries, and start its cognitive loop.

The agent will now start thinking and moving autonomously.

---

## Troubleshooting

### "World is not ready" or blank screen

- Ensure WebGL 2.0 is enabled in your browser.
- Try Chrome or Edge on a desktop with a discrete GPU.
- Check the browser console for errors.

### Agent does not move

- Verify the provider endpoint is reachable.
- Check that you entered a valid API key.
- Test the provider with a simple request (the app has a "Test Connection" button).

### Memory is not persisting

- Ensure the Supabase vector extension is enabled.
- Verify you entered the correct Project URL and anon key.
- Check the browser console for Supabase errors.

### Keepalive ping shown in console

This is expected. SYNTHIA preserves your free-tier Supabase project by pinging it every 24 hours while the app is open.

---

## Next Steps

Once the agent is running:

- Read [architecture.md](architecture.md) to understand the system.
- Read [debugging.md](debugging.md) to learn about the diagnostic tools.
- Export a dataset to explore the data your agent generates.

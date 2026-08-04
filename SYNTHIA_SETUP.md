# SYNTHIA: Client Setup & Database Initialization Guide

This guide will walk you through setting up SYNTHIA from scratch as a completely client-side application that communicates directly with Large Language Model backends (such as Kaggle, Gemini, Groq, OpenRouter, NIM) and your personal Supabase instance.

---

## PART 1 — SUPABASE DATABASE SETUP

1. **Create Account & Project**: Go to [supabase.com](https://supabase.com), sign up, and create a new project.
2. **Enable Vector Extension**:
   - In the Supabase Dashboard, go to **Database** -> **Extensions**.
   - Search for **vector** and enable it (required for semantic memory embedding search).
3. **Execute SQL Schema**:
   - Go to the **SQL Editor** in your Supabase Dashboard.
   - Click **New Query**, copy the contents of the `supabase_schema.sql` file from this repository's root, paste them, and click **Run**.
4. **Setup Storage Bucket**:
   - Go to the **Storage** section in your Supabase Dashboard.
   - Create a new bucket named **`Synthia-frames`**.
   - Make the bucket **Public** (so that uploaded visual frame buffers are publicly accessible).
5. **Get Project Credentials**:
   - Go to **Project Settings** -> **API**.
   - Copy your **Project URL** (under Project API keys) and the public **anon public key**.

### ⚠️ IMPORTANT: Free-Tier Supabase Inactivity Pause Limitation
- **Inactivity Pausing**: Supabase pauses free-tier projects automatically after **7 days (1 week) of complete inactivity**.
- **How SYNTHIA Handles This**: SYNTHIA has a smart **client-side keepalive ping** built directly into the web application. While you keep the browser tab open, it will fire a lightweight database query once every **24 hours** to prevent your project from pausing.
- **Manual Wakeup Needed**: If you do not open the SYNTHIA app for more than a week, your Supabase project will pause. This is a known, expected trade-off for a serverless single-user bootstrapped application. If your database gets paused, simply navigate to your Supabase Dashboard and click **Restore Project** to reactivate it.

---

## PART 2 — INFERENCE BACKEND SETUP (e.g. KAGGLE)

To run the full simulation loop, you need an inference backend. If you are using our custom Kaggle notebook server:
1. **Verify Kaggle Account**: Ensure your Kaggle account is phone-verified (required to access free GPUs).
2. **Create/Open Notebook**: Create a new Kaggle notebook and set the **Accelerator** option to **GPU T4x2**.
3. **Turn Internet On**: In the notebook settings on the right panel, toggle the **Internet** option to **On**.
4. **Paste and Run Server**: Copy the code from `kaggle_server.py` in this repository, paste it into a notebook cell, and run it.
5. **Get API Endpoint**: Look for the public tunnel URL (`fxtun.dev` or `ngrok` link) in the cell output. This is your **ENDPOINT_URL**.

---

## PART 3 — CLIENT APPLICATION INSTALLATION

1. **Install Node.js**: Ensure Node.js v20 or newer is installed on your computer.
2. **Clone & Install**:
   ```bash
   git clone <repo-url>
   cd synthia
   npm install
   ```
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
4. **Launch**: Open your web browser and navigate to `http://localhost:5173`.

---

## PART 4 — FIRST RUN & COGNITION CONFIGURATION

1. **Launch the Simulation**: Open `http://localhost:5173`.
2. **Configure Active Agent**:
   - Click the **Gear icon** in the top-center floating pill header (next to active agent dropdown).
   - Under the **Inference & Database Infrastructure** tab, select your LLM provider (e.g., Kaggle, Gemini, Groq, OpenRouter, etc.).
   - Enter your provider API key (if needed) and your **API Base URL / Kaggle Inference Endpoint**.
   - Enter your **Supabase URL** and **Anon Key** under the Database section.
   - Click **Deploy Cognition Config**.
3. **Wake Up**: Once deployed, the client-side `AgentLoop` will initialize, retrieve connection summaries, and trigger the "SYNTHIA is waking up..." modal. The agent will then start thinking and moving autonomously!

# SYNTHIA: AI Embodiment Platform

SYNTHIA is a high-fidelity 3D research platform for developing, visualizing, and training embodied AI agents. It bridges the gap between Large Language Models (LLMs) and physical action through a real-time client-side cognitive loop.

---

## ⚡ Key Highlights of the Unified Client-Side Architecture

- **100% Client-Side Cognition**: The entire orchestration—cognitive loops (`AgentLoop`), physical outcome routing, visual perception capture, and semantic memory querying (`MemoryManager` / `EmbeddingEngine`)—runs directly inside your browser. No separate coordinator backend process or heavy local services required!
- **Stateless Serverless Proxy**: Lightweight, serverless Edge handlers secure and proxy requests to LLM providers (Gemini, Groq, OpenRouter, NIM, Kaggle) with shared secrets and route white-listing.
- **Client-Side Supabase Integration**: Save memories, sessions, and mastered skills directly to your personal Postgres Supabase database with instant local-first fallbacks.
- **Keepalive Ping**: To prevent free-tier Supabase projects from automatically pausing (7-day pause threshold), SYNTHIA fires an automated database query once every 24 hours while the app tab is open. (Note: Project will still pause if left completely unopened for more than a week).

---

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd synthia
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run application**:
   ```bash
   npm run dev
   ```
4. **Configure & Simulate**: Open `http://localhost:5173`, click the **Gear icon** in the top-center floating pill header, and deploy your LLM backend & Supabase credentials.

---

## System Requirements
- **Hardware**: 4GB+ RAM, WebGL 2.0 compatible browser.
- **Inference**: Kaggle T4x2 GPU or equivalent LLM provider (supporting vision models such as `Qwen2.5-VL-7B-Instruct`).

---

## Configuration Reference
- `src/constants/bodyTypes.ts`: Humanoid and multi-agent joint hierarchies, limits, and skeletal constraints.
- `src/constants/objectPresets.ts`: Physical and visual attributes for spawnable interactable objects.
- `src/world/agent/AgentLoop.ts`: The autonomous client-side agent thinking-movement execution cycle.
- `src/world/agent/memoryManager.ts`: Direct Supabase client manager for read/write operations.

---

## Documentation Links
- [Phase 1: Physics Engine](PHASE1_DOCS.md)
- [Phase 2: World Engine](PHASE2_DOCS.md)
- [Phase 4: Inference Server](PHASE4_DOCS.md)
- [Phase 5: Full Integration](PHASE5_DOCS.md)
- [Phase 6: Multi-Agent & Hearing](PHASE_6_COMPLETE.md)
- [Phase 6.1: Agent-to-Agent Communication](PHASE_6.1_COMPLETE.md)
- [Detailed Setup Guide](SYNTHIA_SETUP.md)

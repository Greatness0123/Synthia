# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Standard open-source repository files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.env.example`, `.nvmrc`
- GitHub issue templates (`bug_report.md`, `feature_request.md`) and pull request template
- Continuous Integration workflow (`.github/workflows/ci.yml`)
- Documentation restructuring: `docs/setup.md`, `docs/architecture.md`, `docs/debugging.md`

### Changed
- `README.md` rewritten from the default template to a comprehensive project overview
- `package.json` updated: version `1.5.1`, license `MIT`, engines `node >= 20`, repository metadata, keywords

---

## [1.5.1] - 2026-08-26

### Added
- Multi-agent architecture: support for spawning multiple agents in a single MuJoCo world
- Agent-to-agent communication with physical acoustic constraints (15m range, occlusion degradation)
- Reaction Mass Balance System (RMBS) controller
- COM reflex controller (Road-4 capture step)
- Client-side dataset export: JSONL, CSV, Parquet, LeRobot formats
- Pure-browser Apache Parquet v1 writer (`src/utils/parquetWriter.ts`)
- Per-agent text-to-speech with distinct voices
- Three-tier persistent memory (working, episodic, long-term) with Supabase/pgvector
- Thought injection (Devil's Advocate steering)
- Serverless inference proxies (`api/infer/gemini.ts`, `api/infer/openai-compat.ts`)
- Kaggle GPU inference server (`kaggle_server.py`)
- Full client-side cognitive loop (`src/world/agent/AgentLoop.ts`)

### Changed
- Moved from coordinator-based architecture to fully client-side agent loop
- Consolidated multi-agent state management into Zustand stores
- Migrated UI to modern React component structure

### Fixed
- Joint angle clamping to prevent physical collapse
- Spawn ramp timing to prevent self-tearing actuation
- Multi-agent MJCF subtree prefixing to avoid name collisions

---

## [1.0.0] - 2026-06-01

### Added
- Initial browser-based embodied AI platform
- MuJoCo WebAssembly physics simulation
- 80-joint humanoid body with PD joint control
- Basic vision pipeline (448x448 offscreen render)
- Persistent memory with local fallback

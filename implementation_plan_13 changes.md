# Synthia 1.5.1 — Comprehensive UI & System Overhaul

A large multi-point update covering TTS behavior, UI cleanup, new features, physics fixes, and agent settings improvements.

---

## Open Questions

> [!IMPORTANT]
> **Task Tracker for Export**: You mentioned a tracker for specific tasks (in training mode) so you can export training data per-task. Should this task tracker be part of the Directive Panel (where you already set the training goal), or should it live in the Export modal? My plan is: a lightweight "active task log" that records which heartbeats belonged to which training goal, persisted in memory, and surfaced as a filter in the Export modal.

> [!IMPORTANT]
> **Vision Size (item 14)**: You want model vision to be configurable like an FPS game's FOV. The current AI perception camera FOV is `110°` (very wide already). Do you want the **resolution** (currently 448×448) to be configurable, or the **field of view** in degrees, or both? I'll make both configurable with clear labels.

> [!NOTE]  
> **LeRobot Export (item 11)**: LeRobot uses a specific Hugging Face dataset format (`data/chunk-XXX/episode_YYY.parquet`). Implementing a true LeRobot export requires the `parquetjs` package (or similar). I'll add this format properly using a JSONL-to-Parquet polyfill/workaround so it stays browser-side. This requires adding a dependency.

---

## Proposed Changes

### 1. TTS — Speak Tag Only (not all thoughts)
**Items: 1**

The agent currently speaks its entire thought. Instead, TTS should only be triggered when the agent's response contains a `<speak>...</speak>` tag. Agent-to-agent communication via `synthia:agent_spoke` spatial events should also only carry the spoken text (content of `<speak>` tags), not all thoughts.

#### [MODIFY] [agentStore.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/store/agentStore.ts)
- Extract `<speak>` tagged content from `thought.text` before calling `speakAgentThought`
- Only pass the extracted speech to TTS; if no `<speak>` tag, don't TTS at all

#### [MODIFY] [speech.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/utils/speech.ts)
- Add `extractSpeechContent(text)` helper that parses `<speak>...</speak>` tags
- Agent-to-agent spatial event should only emit extracted speech content

#### [MODIFY] [InferenceClient.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/world/agent/InferenceClient.ts)
- Update system prompt to inform the agent it may optionally use `<speak>text</speak>` to produce audible speech (not all thoughts are spoken)

---

### 2. Right Panel — Show Active Agent Name in Header
**Items: 2**

The right panel header says just "Agent". It should show the name of the agent it is displaying.

#### [MODIFY] [App.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/App.tsx)
- Change header label from `"Agent"` to `{activeAgentId}` (using `useAgentStore`)

---

### 3. Right Panel — Remove Non-Functional Sections from AgentStatus
**Items: 3 — remove: skill count, Rung 0 ladder, static balance stuff, HB counter**

#### [MODIFY] [AgentStatus.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentStatus.tsx)
- Remove: `ChartLineUp` + Rung display row
- Remove: skill count badge (`masteredSkills.length`)
- Remove: heartbeat (`HB`) display
- Keep: agent name/label + status badge (thinking/idle)
- Remove the framer-motion pulse animation (no longer needed without rung changes)

---

### 4. Settings (GodMode BodyControls) — Remove Non-Functional Items + Fix Spawn Button
**Items: 4**

#### [MODIFY] [BodyControls.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/godmode/BodyControls.tsx)
- Remove: "Full Skeleton (Experimental)" toggle
- Remove: "Joint Debug Markers" toggle (outdated, joint markers still exist in world but slider shouldn't be here)
- Remove: "Procedural Model" toggle

#### [MODIFY] [GodModePanel.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/godmode/GodModePanel.tsx)
- Move the "Spawn Objects" button to be pinned at the very bottom of the panel (outside the scrollable area, in a sticky footer), so it's always visible

---

### 5. Glitch Fix — Settings Modal + Right Panel Open Simultaneously
**Items: 5**

When both `settingsModalOpen` and `rightPanelOpen` are true, there is a z-index/layout conflict. Fix by ensuring proper z-index layering and that when the settings modal opens, it renders above the right panel.

#### [MODIFY] [App.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/App.tsx)
- The Right Panel uses `z-[60]`, the Settings modal uses `z-[100]`. The backdrop `bg-black/60 backdrop-blur-sm` on the Settings modal (a full-screen overlay) should correctly cover the right panel. We'll fix the issue by ensuring the right panel modal does not bleed outside its bounds and no pointer events are captured through the settings backdrop.

---

### 6. Thought Indicator — Only Pulse When Connected
**Items: 6**

The status badge in `AgentStatus.tsx` switches between "thinking" and "idle" even when nothing is connected, because `AgentLoop` sets status to `thinking` → `acting` → `idle` on every cycle even when inference fails silently.

#### [MODIFY] [AgentStatus.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentStatus.tsx)
- Conditionally show the pulsing animation only when `status === 'thinking'`

#### [MODIFY] [AgentLoop.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/world/agent/AgentLoop.ts)
- Before setting status to `thinking`, check if a provider endpoint/key is actually configured and skip cycling if not

---

### 7. Agent Settings — Use Phosphor Icons Consistently
**Items: 7**

The settings sidebar tabs use Phosphor icons already (`Cpu`, `Brain`, `SpeakerHigh`, `Export`). No foreign icon libraries detected. Will audit and ensure all buttons/actions use Phosphor consistently.

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Replace any plain text-only buttons with icon+text combos using Phosphor icons
- Add appropriate icons to the "Deploy Cognition Config", "Applied Successfully" states etc.

---

### 8. Agent Settings — Remove "Local Agent Active" Button When Nothing Connected
**Items: 8**

The green "Local Agent Active" status chip at line 345-351 of `AgentSettingsModal.tsx` always shows, even when no endpoint is configured and no agent is connected.

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Replace the static chip with a dynamic connection status indicator that shows:
  - 🔴 "No Provider Configured" when no endpoint/key
  - 🟡 "Not Started" when config exists but inference hasn't begun
  - 🟢 "Active" only when the agent loop is confirmed running

---

### 9. Remove Skill & Progression Ladder
**Items: 9**

The Skill & Progression Ladder in the `cognition` tab of `AgentSettingsModal` shows SKILL_RUNGS but there's no real tracking mechanism. Remove it.

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Remove the "Skill & Progression Ladder" section (lines 424-458)
- Rename "Cognition" tab to just "Memory" since it only has the memory explorer now
- Remove `ChartLineUp` icon import if unused

---

### 10. Export — Own Icon Button (not buried in settings)
**Items: 10**

Export should have its own dedicated icon button, placed below the GodMode button on the left side.

#### [MODIFY] [App.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/App.tsx)
- Add a floating Export button below the GodMode trigger button (left side)
- Uses `Export` (or `DownloadSimple`) icon from Phosphor

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Remove the "Data & Export" tab from the settings sidebar (or keep as a shortcut that redirects)

---

### 11. Export Modal — Simplify + Add LeRobot + Task Filter + Remove Min Reward
**Items: 11**

#### [MODIFY] [ExportModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/export/ExportModal.tsx)
- **Remove**: `minReward` slider/filter
- **Remove**: complex `zipPerAgent` toggle for single-agent scenarios (only show when multiple agents exist)
- **Simplify coloring**: reduce to 2-tone (neutral + 1 accent)
- **Add LeRobot format**: new `ExportFormat` option in the format picker
- **Add Task filter**: show a list of unique training goals that appear in memories (from `goal_at_time` field), allow selecting 1+ tasks to filter export data to only those heartbeats

#### [MODIFY] [clientDatasetExporter.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/utils/clientDatasetExporter.ts)
- Add `formatLeRobot(memories)` function that outputs LeRobot-compatible JSONL format
- Add `taskFilter?: string[]` to `ExportConfig` to filter by `goal_at_time`

#### [MODIFY] [export.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/types/export.ts)
- Add `'LeRobot'` to `ExportFormat` union
- Add optional `taskFilter?: string[]` to `ExportConfig`
- Remove `minReward` field

---

### 12. API Key Connectivity Test
**Items: 12**

Add a "Test Connection" button that validates the API key + endpoint by making a minimal inference request and showing a clear pass/fail result.

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Add a "Test API Key" button next to the deploy button
- On click: send a minimal test payload (e.g., "Hello, respond with OK") to the configured provider
- Display: ✅ "Connection OK" + latency, or ❌ "Failed: [error message]"
- Test image endpoint if provider is vision-capable

---

### 13 & 15. Physics — Fix Right Leg Micro-Movement on Spawn
**Items: 13, 15 (duplicate)**

The right leg sometimes drifts backward upon spawn. This is likely due to MuJoCo applying contact forces before the agent's pose is fully locked, or the capsule spawn position being slightly misaligned.

#### [MODIFY] [HumanoidPhysicsBinder.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/world/engine/HumanoidPhysicsBinder.ts)
- In `resetToBindPose()`, explicitly set hip and knee qpos AND qvel to 0 for both legs (already done for some bones but ensure `mixamorigrightupleg` roll component is also 0)
- After `resetPose()`, apply a brief "stiffness lock" (increase stiffness temporarily to 200 for first 500ms)

#### [MODIFY] [useWorld.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/world/hooks/useWorld.ts)
- After spawning and `resetPose()`, apply a brief motor stiffness override for the new agent (call `adjustMotors(200, 20)` then schedule `adjustMotors(80, 10)` after 800ms)

---

### 14. Vision — Configurable FOV and Resolution
**Items: 14**

Allow users to configure the AI perception camera's FOV and render resolution in Agent Settings.

#### [MODIFY] [worldStore.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/store/worldStore.ts)
- Add `aiVisionFov: number` (default: `110`) 
- Add `aiVisionSize: number` (default: `448`)
- Add setters

#### [MODIFY] [CameraManager.ts](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/world/engine/CameraManager.ts)
- Change `AI_VIEW_SIZE` from a static constant to a configurable value with a setter
- Add `setAIVisionFov(fov: number)` to update `aiPerceptionCamera.fov`
- Add `setAIViewSize(size: number)` to resize the `aiRenderTarget`

#### [MODIFY] [AgentSettingsModal.tsx](file:///c:/Users/Greatness/Downloads/synthia1.5.1/src/components/agent/AgentSettingsModal.tsx)
- Add "Vision Settings" section in the `infra` tab (or new "Vision" section)
- FOV slider: 60° – 180° (default 110°) with description "Higher FOV = wider view like FPS games"
- Resolution picker: 224, 336, 448, 672, 896 (default 448) with API cost warning for higher sizes

---

### 16. UI Improvements (General)
**Items: 16**

General UI improvements:
- Tighten the right panel header to show active agent name (item 2 covers this)
- Clean up the center top bar pill — make the agent selector dropdown look more premium
- Add subtle glassmorphism micro-animation on panel open
- Ensure all toggle switches are consistently styled (use the same pattern everywhere)
- The GodMode panel spawn button pinned at bottom (item 4 covers this)

---

1. as a filter in the export modal where they can select from a list of fetched tasks 
2. lets look at both ..... also configure them both such that the default is what is currently set 

## Verification Plan

### Manual Verification
1. Spawn agent → confirm no right leg drift for 3+ spawns
2. Configure Gemini API key → click "Test" → see latency + success result
3. Enable TTS, set agent goal → confirm only `<speak>` tagged text is spoken
4. Open settings modal + right panel together → confirm no visual glitch
5. Open Export modal → confirm LeRobot format available, task filter works, no min reward field
6. Confirm export icon appears below GodMode button
7. Confirm right panel header shows `agent_0` (or active agent name)
8. Confirm idle indicator does NOT pulse when no provider configured
9. Confirm "Local Agent Active" chip is removed when not configured

### Build Check
- `npm run dev` — no TypeScript errors

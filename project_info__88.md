# SYNTHIA 1.5.1 — UI Audit (Exhaustive)

**Task**: Audit the UI purely by reading the codebase — components, stores, event handlers, async call sites. Every finding cites a specific file and function/section. Severity: **Blocking** (actively broken or misleading) / **Real Problem** (works but genuine UX flaw) / **Polish** (minor).

---

## 0. Systemic finding that colors everything below

**F1 — All toasts are invisible (toast system is effectively dead UI) — BLOCKING**
- **File/function**: `src/components/ui/Toast.tsx`, `ToastProvider` (`visibleToasts={0}` on the `<Toaster>`).
- **Problem**: Sonner is configured with `visibleToasts={0}`, so *zero* toast messages ever render. Every `synthiaToast.success/error/warning/info` call in the app (spawn success, export completion, injection confirmation, "Physics engine is still loading", "Spawning failed: Object Manager is not ready", TTS errors, etc.) is written only to `console` and the invisible-until-opened Log tab (`useLogStore`). The user receives no visual feedback for the vast majority of async operations. This is the single biggest UX defect in the codebase and it amplifies every finding in section 3 below.
- **Fix**: Set `visibleToasts` to 3–4 (or remove the `0` limit), or replace sonner with a small custom toast surface. Keep the log-store write as a secondary channel.

---

## 1. Dead UI from removed systems (coordinator/WebSocket backend)

The coordinator backend was removed in a past refactor and replaced by client-side `AgentLoop`/`InferenceClient` (see `src/world/agent/AgentLoop.ts`, `src/world/agent/InferenceClient.ts`). But multiple UI surfaces still assume the WebSocket backend exists.

**F2 — StatusBar metrics are frozen/meaningless in client-side mode — REAL PROBLEM**
- **File/function**: `src/components/layout/StatusBar.tsx` (`Metric` cells for RTT, Inference, Frame, Cycle, FPS, Heartbeat); data backed by `src/store/connectionStore.ts` (`rtt`, `inferenceTime`, `fps`, `frameSize`, `cycleMs`) and `src/store/agentStore.ts` (`heartbeat`).
- **Problem**: In client-side operation, only `frameSize` is ever written — `src/world/hooks/useWorld.ts` sets `(window as any)._synthia_connection_store_metrics` and calls it with `{ frameSize }` in `captureWorldStateForAgent`. Nothing sets `rtt`, `inferenceTime`, or `fps` anymore: those were only ever written by the coordinator's `connection_status` message handler (`src/world/contexts/CoordinatorContext.tsx`). Likewise, `heartbeat` is never incremented in client mode — `AgentLoop.cycle()` maintains a *local* `this.heartbeat` and never calls `incrementHeartbeatForAgent`. The StatusBar therefore shows `—` or a permanently frozen `0` for RTT/Inference/FPS/Heartbeat in the default (serverless) configuration — misleading instrumentation.
- **Fix**: Either (a) delete the RTT/Inference/FPS/Heartbeat cells and the unused `connectionStore` metric fields, or (b) wire `AgentLoop` to call `setMetrics({ rtt, inferenceTime })` and `incrementHeartbeatForAgent` per cycle.

**F3 — `CoordinatorProvider` still runs and connects to a dead WebSocket — REAL PROBLEM**
- **File/function**: `src/main.tsx` (mounts `<CoordinatorProvider>`), `src/world/contexts/CoordinatorContext.tsx` (WS `useEffect` + `socket.onopen` … `socket.onmessage` switch), `src/store/connectionStore.ts` (`endpoint: 'ws://localhost:3001/ws'` default persisted).
- **Problem**: On app load the provider opens a WebSocket to `ws://localhost:3001/ws`, fails, then reconnects every 3 seconds forever (`socket.onclose` → `setReconnectCounter`). The `onmessage` switch still contains server-era handlers — `thought_token`, `thought_complete`, `connection_status`, `injection_queue_update`, and `export_complete`, the last of which opens `http://…/exports/<filename>` — a download path for the now-removed server-side export system (exports are fully client-side today: `src/components/export/ExportModal.tsx` → `src/utils/clientDatasetExporter.ts`). None of these branches can ever fire in the current architecture; they are dead code on a live timer. The first detection of any WS failure also toasts "Reconnecting in 3 seconds…" — invisible per F1.
- **Fix**: Remove `CoordinatorProvider` from `main.tsx` and delete the context (keeping `useCoordinator` only if something consumes it — nothing does; see F28).

**F4 — Orphaned i18n strings referencing removed features — POLISH**
- **File/function**: `src/constants/strings.ts` — `STATUS.CONNECTED/DISCONNECTED/CONNECTING/ERROR`, `TOASTS.CONNECT_SUCCESS`, `GOD_MODE.FULL_RESET`, `GOD_MODE.SET_SPAWN`, `GOD_MODE.SAVE_WORLD`, `GOD_MODE.LOAD_WORLD`, `EXPORT.PREVIEW_ROWS` (`'~2,847 rows'`), `EXPORT.PREVIEW_SIZE` (`'~340MB'`).
- **Problem**: None of these are referenced by any component (verified by reading all components). They describe WebSocket-era connection UX and a hardcoded fake preview for an export panel that now computes real estimates. Dead strings invite future misuse.
- **Fix**: Prune them (or grep-replace with real computed values).

**F5 — Rehydration startup modal is unreachable in client mode — REAL PROBLEM**
- **File/function**: `src/components/ui/RehydrationModal.tsx` (shows only when `!hasRehydrated && rehydrationSummary`); `src/world/hooks/useWorld.ts` `init()` — calls `agentStore.setHasRehydrated(true)` immediately after `setIsReady(true)`.
- **Problem**: `useWorld.init()` unconditionally sets `hasRehydrated = true` at the end of world initialization, which happens *before* any `AgentLoop.start()` streams its fake rehydration summary (`AgentLoop.start()` writes the summary via `appendRehydrationTokenForAgent` then calls `setHasRehydrated(true)` only for the active agent). By the time the summary exists, `hasRehydrated` is already `true`, so the modal never displays. The designed startup UX ("SYNTHIA is waking up…") is dead code.
- **Fix**: Gate `setHasRehydrated(true)` in `useWorld.init()` on the absence of an agent loop, or move the "rehydration complete" state to the point where the first loop finishes streaming.

**F6 — "N queued" injection badge can never show in client mode — POLISH**
- **File/function**: `src/components/agent/InjectionInput.tsx` (reads `agents[activeAgentId].injectionQueue`); `src/store/agentStore.ts`.
- **Problem**: The queue badge counts entries in `injectionQueue`, which is only populated by the coordinator's `injection_queue_update` handler (dead, see F3). The client `AgentLoop` consumes `pendingInjection` directly and never appends to `injectionQueue`, so the "N queued" badge stays at zero in the default architecture. The local counter (`incrementInjectionQueueCount`, etc.) is likewise only driven by coordinator messages.
- **Fix**: Either have `handleInject` append to the queue, or remove the badge.

---

## 2. Duplicate state sources for the same setting

**F7 — Multi-Body PD has two independent store copies that silently diverge — REAL PROBLEM**
- **File/function**: `src/store/agentStore.ts` (`useMultiBodyPD` per-agent, written by `setUseMultiBodyPDForAgent`) vs `src/store/worldStore.ts` (`useMultiBodyPD` global + `setUseMultiBodyPD`, both persisted to `synthia_world_session`). UI: `src/components/godmode/AgentBodyControls.tsx` (`handleToggleMultiBodyPD` writes only the agentStore copy).
- **Problem**: The GodMode toggle updates `agentStore.useMultiBodyPD` and dispatches `synthia:toggleMultiBodyPD`, which `useWorld.ts` applies to the current binder. But `useWorld.spawnAgent()` decides whether to activate motors for *new* agents from `worldStore.useMultiBodyPD` — a separate, persisted value that no UI ever writes (its setter is never invoked anywhere in `src/`; it only survives restores via `loadSession`). Result: the toggle appears to work for the current agent but newly spawned agents use the stale worldStore value — the same setting, two sources, silently disagreeing.
- **Fix**: Delete `worldStore.useMultiBodyPD` and have `spawnAgent` read the active agent's `agentStore.useMultiBodyPD` (or the runtime store).

**F8 — Per-agent `bodyMode` duplicated in `worldStore` and never consumed — REAL PROBLEM**
- **File/function**: `src/store/worldStore.ts` (`bodyMode: BodyMode`, `setBodyMode` — persisted) vs `src/store/agentStore.ts` (`bodyMode` per agent, written by `AgentBodyControls.handleSetBodyMode`).
- **Problem**: The GodMode rigid/ragdoll segmented control writes only the agentStore copy. `worldStore.bodyMode` has a setter and is persisted but no engine or component reads it (verified: `useWorld.ts` never reads `worldStore.bodyMode`; `BodyManager`/`HumanoidPhysicsBinder` receive mode via the `synthia:setBodyMode` event). It's a second, stale copy of the same setting that `loadSession` will happily restore to a value that contradicts the visible UI.
- **Fix**: Remove `bodyMode`/`setBodyMode` from `worldStore` and make all readers use `agentStore`.

**F9 — Hand-rolled switch duplicated 3× instead of using the `Toggle` component — POLISH**
- **File/function**: `src/components/godmode/BodyControls.tsx` ("Show All Cameras", "AI PiP View"), `src/components/godmode/PhysicsControls.tsx` ("Show Floor", "Show Grid"), `src/components/godmode/AgentBodyControls.tsx` ("Multi-Body PD Motors") — each inlines `w-8 h-4` / `w-3 h-3` / `left-[18px]` switch markup; `src/components/ui/Toggle.tsx` exists and is only used by `DirectivePanel.tsx`.
- **Problem**: The shared component bypassed; knob geometry in the three inline copies differs slightly from `Toggle` (`left-[18px]` vs `translate-x-4`), and no shared ARIA semantics (see F16). Maintenance risk of visual drift.
- **Fix**: Replace all three inline switches with `<Toggle>`.

---

## 3. Dishonest or missing feedback on async actions

**F10 — "Deploy Cognition Config" fakes success with a 600 ms timer — BLOCKING**
- **File/function**: `src/components/agent/AgentSettingsModal.tsx`, `handleConnect()`.
- **Problem**: The button validates only that an endpoint/key string exists (no network check), then `setIsSending(true); await new Promise(resolve => setTimeout(resolve, 600)); setIsSending(false); setSentOk(true); synthiaToast.success('Applied settings successfully…')`. Success is shown unconditionally on click for a *config deployment* to a provider that may be dead, wrong-keyed, or unreachable — with zero verification. The separate "Test" button (`handleTestConnection`) does a real request and shows a genuine pass/fail, so the contrast is stark and the Connect button is actively misleading.
- **Fix**: Either drop the "Applied Successfully" claim (rename to "Save Config" and confirm only that the store was updated), or call `client.testConnection()` inside `handleConnect` before showing success.

**F11 — Spawn Agent button has no in-flight or failure feedback — REAL PROBLEM**
- **File/function**: `src/App.tsx`, top-center "+ Spawn Agent" `onClick` (around line 58); `src/world/hooks/useWorld.ts` `spawnAgent()`.
- **Problem**: The handler awaits `window.synthia.spawnAgent()` but only `console.log`s on success; there is no loading state (button stays idle during the slow GLB-load + physics-rebuild spawn) and no error toast on failure (`return null`). Spawn can take seconds and can fail (e.g. STEP A load failure), with the user seeing nothing either way (and even if a toast were added, F1 would hide it).
- **Fix**: Track a `spawning` boolean in `uiStore`; disable/indicate the button; toast success/failure from actual results.

**F12 — Custom-model spawn discards the pending upload before the spawn is confirmed — REAL PROBLEM**
- **File/function**: `src/components/godmode/ObjectSpawner.tsx`, `spawnPending(saveFirst)`.
- **Problem**: It dispatches `synthia:spawnCustom` (handled asynchronously by `useWorld`'s `handleSpawnCustom`) and *immediately* clears `pendingModel`/`previewScene`. If the engine is not ready or `spawnCustomModel` throws/returns null on the other side, the user's just-uploaded model is gone from the modal with only an invisible toast (F1) as evidence.
- **Fix**: Have `handleSpawnCustom` in `useWorld` dispatch a confirmation event only after success, and keep `pendingModel` until that arrives (or add a timeout that restores it).

**F13 — Test Voice and several other error paths rely on invisible toasts — REAL PROBLEM**
- **File/function**: `src/components/agent/AgentSettingsModal.tsx` ("Test Synthesized Voice" `onClick` catch → `synthiaToast.error('Failed to play voice test.')`); `src/components/godmode/ObjectSpawner.tsx` `.gltf` external-reference rejection, V-HACD fallback warnings; `src/components/agent/InjectionInput.tsx` `synthiaToast.info(STRINGS.TOASTS.THOUGHT_INJECTED)`; `src/world/hooks/useWorld.ts` all `synthiaToast.*` calls.
- **Problem**: Every one of these feedback messages is written to the sonner system with `visibleToasts={0}` (F1), so the user sees nothing. The one *visible* success surface that exists — the inline "Connection OK — Nms" block in AgentSettingsModal — demonstrates the pattern that should be applied everywhere.
- **Fix**: Fix F1; then audit the ~40 `synthiaToast` call sites (`src/world/hooks/useWorld.ts`, ObjectSpawner, ExportModal, InjectionInput, AgentSettingsModal) and make sure each has either an inline result region or a visible toast.

**Positive note**: The client-side export flow (`ExportModal.handleExport` → `runClientSideExport`) is exemplary — progress via `setExportProgress`, success toast only *after* `runClientSideExport` resolves, and a real error toast on rejection.

---

## 4. Destructive actions without confirmation or scope safety

**F14 — Delete/Backspace silently deletes the selected object with no confirmation — REAL PROBLEM**
- **File/function**: `src/world/hooks/useWorld.ts`, global `keydown` handler (`if (e.key === 'Delete' || e.key === 'Backspace')` → dispatch `synthia:deleteObject`).
- **Problem**: Any selected object (including a custom-uploaded model that took minutes to decompose) is deleted permanently by pressing Delete — no confirmation, no undo. Because `worldStore.saveSession()` runs after `removeObject`, the deletion is also persisted immediately. Scope safety is otherwise good (it only targets `selectedEntityId`), but the action itself is irreversible and unannounced.
- **Fix**: Wrap in `window.confirm(...)` or push the deleted geometry into an undo stack.

**F15 — "Delete Object" button in StructureViewer has no confirmation — REAL PROBLEM**
- **File/function**: `src/components/agent/StructureViewer.tsx`, "Delete Object" button `onClick` (dispatch `synthia:deleteObject` with `entityData.objectId`).
- **Problem**: Same destructive effect as F14 with no confirmation. (Good scope-safety note: it correctly no-ops for humanoids — the button only renders in the non-humanoid branch, and `onRename`/`onBlur` likewise guard on `objectId`.)
- **Fix**: Add a confirm (or rely on a shared confirm helper from F14).

**F16 — Clear-logs button is unconfirmed — POLISH**
- **File/function**: `src/components/agent/LogViewer.tsx`, header `Trash` button → `clear()` on `useLogStore`.
- **Problem**: One click wipes all 200 log entries; the icon-only button has only a `title` attribute (see F19) and no confirm. Low stakes, but it's the app's only diagnostic trail.
- **Fix**: `window.confirm` or hold-to-clear.

**F17 — "Clear Goal" silently resets directive mode — POLISH**
- **File/function**: `src/components/godmode/DirectivePanel.tsx`, `handleClearGoal()` — calls `setCurrentGoal(null)` + `setDirectiveMode('free_will')`.
- **Problem**: Clearing a training goal also flips the mode back to free-will without telling the user, undoing their explicit "TRAINING MODE" toggle. Also notable: `handleSetGoal()` — the "Set Goal" button — is an **empty function body**; it renders as an active button that does nothing (the textarea's `onChange` already writes the store live, but a button that exists purely as decoration is misleading).
- **Fix**: Make `handleSetGoal` persist a "goal confirmed" state or remove the button; make `handleClearGoal` leave `directiveMode` untouched (or explain the mode switch).

**Positive note**: Reset Pose in `AgentBodyControls` correctly scopes to one agent — `useWorld`'s `synthia:resetPose` handler honors `detail.agentId` and skips other binders.

---

## 5. Accessibility

**F18 — Icon-only buttons without accessible names — REAL PROBLEM**
- **File/function**:
  - `src/App.tsx`: right-panel trigger (`TreeStructure` button) — **no `title`, no `aria-label` at all**; the gear/settings, TTS speaker, theme, and export buttons have only `title` (not reliably exposed by all AT).
  - `src/components/godmode/GodModePanel.tsx`: close X — no label.
  - `src/App.tsx` right-panel header close X — no label.
  - `src/components/godmode/ObjectSpawner.tsx`: header close X — no label.
  - `src/components/agent/LogViewer.tsx`: clear trash button — no label.
- **Problem**: Screen readers announce nothing or announce "button" with no meaning; the right-panel trigger is entirely unlabeled.
- **Fix**: Add `aria-label` to all icon-only buttons (keep `title` as a bonus).

**F19 — Custom switches lack `role="switch"` / `aria-checked` — REAL PROBLEM**
- **File/function**: `src/components/ui/Toggle.tsx` (the shared component itself), `src/components/godmode/BodyControls.tsx`, `src/components/godmode/PhysicsControls.tsx`, `src/components/godmode/AgentBodyControls.tsx`.
- **Problem**: All four toggle implementations are plain `<button>`s whose checked state is conveyed only by visual position/color. No `role="switch"`, no `aria-checked`; screen readers cannot determine on/off. (These buttons are at least native buttons so they're keyboard-reachable — the failure is state conveyance.)
- **Fix**: Add `role="switch"` and `aria-checked={enabled}` in `Toggle.tsx` and the three inline copies (or replace them with `Toggle` per F9).

**F20 — Modals: no focus trap, no focus restore, inconsistent Escape handling — REAL PROBLEM**
- **File/function**: `src/components/agent/AgentSettingsModal.tsx` (no Escape handler at all), `src/components/export/ExportModal.tsx` (Escape yes), `src/components/godmode/ObjectSpawner.tsx` (Escape yes), `src/components/godmode/GodModePanel.tsx` (no Escape handler), `src/App.tsx` right panel (no Escape handler).
- **Problem**: Keyboard users cannot close AgentSettingsModal or GodModePanel (and the right panel) with Escape, and no modal traps focus — tabbing past the modal continues into the underlying page; focus is not restored to the trigger on close.
- **Fix**: Add a shared `useModalAccessibility(open, onClose)` hook: Escape-to-close, focus first focusable on open, restore focus to the trigger (or document.body) on close.

**F21 — Draggable panels are mouse-only, unreachable by keyboard — REAL PROBLEM**
- **File/function**: `GodModePanel.tsx` (`motion.div drag`), `App.tsx` right panel (`drag`), `src/components/world/ModelInputPiP.tsx` (`drag`).
- **Problem**: The panels are draggable only via pointer and have no keyboard alternative for repositioning (and no reset button — see F22).
- **Fix**: At minimum provide a "reset position" button and `tabIndex={0}` so a keyboard user can reach the panel chrome; ideally add arrow-key nudge handlers.

**F22 — Color contrast fails in both themes for the tertiary text tier — REAL PROBLEM**
- **File/function**: `src/styles/globals.css` — dark `:root`: `--text-tertiary: #555555` on `--bg-primary: #0a0a0a`; `.light`: `--text-tertiary: #888888` on `#f5f5f5`. Tertiary is used pervasively at 9–11 px (labels, placeholders, timestamps — e.g., StatusBar labels, GodMode section headers, MemoryViewer metadata).
- **Problem**: Approximate contrast: dark ≈ 2.6:1, light ≈ 3.2:1 — both far below WCAG AA 4.5:1 for the tiny text sizes used. Some spots multiply this by opacity (`text-text-tertiary/40` in `BodyControls` disabled buttons; `opacity-30` empty states in MemoryViewer/LogViewer), which drops below ~1.5:1.
- **Fix**: Raise tertiary tokens to ≥4.5:1 on their respective surfaces (e.g., dark `#9ca3af`-ish, light `#6b7280`-ish) and remove opacity stacking on text.

**F23 — Light theme destroys hover/selected states that use white overlays — REAL PROBLEM**
- **File/function**: `src/App.tsx` (top-center pill `hover:bg-white/10`, `bg-white/10` for the active settings button), `src/components/godmode/GodModePanel.tsx` (`hover:bg-white/10`), `ObjectSpawner`/`ExportModal`/`AgentSettingsModal` (`bg-white/[0.02]`, `bg-white/5`, `hover:bg-white/5`), `globals.css` (`.light .glassmorphism` is overridden, but the component-level white overlays are not).
- **Problem**: In light mode, `bg-white/10` on a near-white surface is invisible, so hover feedback and the "selected/active" state of the gear button and tab selections effectively vanish. Only `bg-black/x` and accent backgrounds survive the light theme.
- **Fix**: Use theme tokens (`bg-bg-hover`, `bg-bg-elevated`) or `dark:bg-white/10 light:bg-black/5` variants for all overlay classes.

**F24 — Fake checkbox in ExportModal session picker — REAL PROBLEM**
- **File/function**: `src/components/export/ExportModal.tsx` — session rows: the row `<div onClick>` toggles selection, but the inner `<input type="checkbox" onChange={() => {}}>` is inert (the no-op `onChange` means the checkbox can never be toggled directly, and it's not even `readOnly`).
- **Problem**: Keyboard users cannot toggle a session (only click the row with a mouse), and assistive tech sees a checkbox that can never change state — contradiction between visual affordance and behavior.
- **Fix**: Move the toggle onto the input (`onChange={() => …}`) and make the row label-wrapped around it.

---

## 6. Layout robustness

**F25 — Dragging GodMode panel or right panel fully off-screen is unrecoverable — BLOCKING**
- **File/function**: `src/components/godmode/GodModePanel.tsx` (`motion.div` `drag dragMomentum={false} dragElastic={0}`, no `dragConstraints`; trigger hidden while open: `{!godModeOpen && …}`); `src/App.tsx` right panel (same `drag` + trigger only rendered `!rightPanelOpen`).
- **Problem**: Both panels are freely draggable to any screen position. If either is dragged such that its header/close button leaves the viewport, the user has no way to close it: the trigger button is hidden *while the panel is open* (`!godModeOpen &&`), and Escape does nothing (F20). The only escapes are reloading the page or (for the right panel) clicking the unrelated Export button which doesn't close it. The PiP (`ModelInputPiP.tsx`) has the same unbounded drag but is less catastrophic (can be hidden via the GodMode toggle).
- **Fix**: Add percentage-based `dragConstraints` (e.g., keep 10% of the panel on-screen) and/or keep the trigger button visible with the panel open, and add Escape-to-close (F20).

**F26 — Fixed-width modals overflow below ~900 px viewports — REAL PROBLEM**
- **File/function**: `AgentSettingsModal.tsx` (`w-[840px]`), `ExportModal.tsx` (`w-[820px]`), `ObjectSpawner.tsx` (`w-[520px] max-h-[80vh]`).
- **Problem**: No `max-w` relative to viewport. On 1024-laptop widths the content row is tight; at 768–900 px the modals overflow horizontally with horizontal scroll or clipped content (the body has `overflow: hidden` globally). ExportModal's `minHeight: '480px'` inline style compounds this on short screens.
- **Fix**: Add `max-w-[calc(100vw-2rem)]` and `max-h-[calc(100vh-2rem)]` to each modal shell and let the inner `flex-1 overflow-y-auto` regions scroll.

**F27 — Z-index scheme is ad-hoc but mostly functional; one collision — POLISH**
- **File/function**: `z-50` pills (logo, top-center, camera, StatusBar, triggers), `z-[60]` panels (GodMode, right panel), `z-[100]` modals (Export, AgentSettings, ObjectSpawner), `z-[200]` RehydrationModal; `ModelInputPiP.tsx` is `z-10` inside the `z-0` main.
- **Problem**: The tiers are coherent, but the PiP at `z-10` renders *beneath* every fixed `z-50` pill — at narrow widths (F26) the StatusBar (bottom-center `z-50`) and the PiP (bottom-right `z-10`) can overlap, with the PiP hidden behind the StatusBar. Also `ui/Tooltip` uses `z-50` inside `overflow-hidden` panels, so tooltips near the top edge of modal panels get clipped rather than overdrawn.
- **Fix**: Raise PiP to `z-40` (still under pills but above the world) and add `overflow: visible`/portal for Tooltip.

---

## 7. Design system consistency

**F28 — Hardcoded colors bypassing theme tokens — REAL PROBLEM**
- **File/function**:
  - `src/App.tsx` — `<option className="bg-[#111115] …">` (agent selector dropdown options) — raw hex inside the design-system layer; will render dark-on-dark/light-inconsistent in light theme.
  - `src/components/agent/StructureViewer.tsx` — Delete button `bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30` — tailwind default red instead of `accent-red`.
  - `src/components/world/ModelInputPiP.tsx` — "live" indicator `bg-green-400` / `text-green-400` (tailwind default palette) instead of `accent-green`.
  - `src/components/godmode/ModelPreview.tsx` — `new THREE.Color(0x111318)` preview background, `0x10b981`, `0xf59e0b` — the preview stays dark and emerald/amber regardless of theme.
- **Problem**: These bypass the `var(--accent-*)` / `--bg-*` tokens; they will not adapt to the light theme and don't match the established palette (e.g., `red-500` is more orange than `--accent-red #ef4444`).
- **Fix**: Replace with `accent-red`, `accent-green` classes or the CSS var values; for the Three.js preview, sample `getComputedStyle(document.documentElement)` for the tokens.

**F29 — Duplicated switch geometry (see F9) — POLISH**
- **File/function**: `BodyControls.tsx`, `PhysicsControls.tsx`, `AgentBodyControls.tsx` vs `ui/Toggle.tsx`.
- **Problem**: Three inline copies of the same control with subtly different knob offsets (`left-[18px]` vs `translate-x-4`) and no shared semantics. Consolidation risk.
- **Fix**: Use `Toggle`.

---

## 8. Information architecture / redundant paths

**F30 — Global vision settings are presented inside a per-agent modal — REAL PROBLEM**
- **File/function**: `src/components/agent/AgentSettingsModal.tsx` — Vision tab reads/writes global `worldStore.aiVisionFov` / `aiVisionSize` (singleton `CameraManager.aiViewSize`), while the modal's copy explicitly frames everything as per-agent ("Configure how this specific agent's cognition loops connect…").
- **Problem**: A user reasonably expects per-agent vision settings and will be confused when the change affects all agents. The header badge shows `activeAgentId` while the Vision tab silently edits global state.
- **Fix**: Either move the Vision controls to GodMode's world-level section, or store per-agent overrides in `agentRuntimeStore` and apply them in `captureWorldStateForAgent`/`CameraManager.setAIVisionConfig`.

**F31 — Memories shown in two places with divergent views (no drift, but confusing) — POLISH**
- **File/function**: `src/components/agent/MemoryViewer.tsx` (`memories.slice(-10).reverse()` — ten memories) vs `AgentSettingsModal` Memory tab (all memories + search + tier filter, `max-h-[220px]`).
- **Problem**: The two views read the same store (good — no drift), but the right-panel viewer shows an unlabeled "last 10 only" subset. Without a "viewing last 10 of N" badge a user may conclude only 10 memories exist.
- **Fix**: Label the slice ("Last 10 of N") and link to the full explorer.

**F32 — Agent name header lies — REAL PROBLEM**
- **File/function**: `src/components/agent/AgentStatus.tsx` — `{STRINGS.AGENT.NAME_LABEL || activeAgentId}` where `NAME_LABEL = 'SYNTHIA-01'` (always truthy).
- **Problem**: The `|| activeAgentId` fallback can never fire, so the panel always reads "SYNTHIA-01" even while the element directly above it (App.tsx right-panel header) correctly reads "Agent (agent_2)". Two labels in the same panel disagree.
- **Fix**: Display `activeAgentId` (or make the constant a real per-agent display name).

---

## 9. Orphaned code behind toggles / feature flags

**F33 — `useProcedural` and `useMuJoCo` flags are persisted but read nowhere — REAL PROBLEM**
- **File/function**: `src/store/worldStore.ts` — `useProcedural`/`setUseProcedural`, `useMuJoCo`/`setUseMuJoCo` (both call `saveSession()`); `loadSession()` restores them from localStorage.
- **Problem**: No component or engine code reads either flag (physics is unconditionally MuJoCo in `useWorld.ts`; no procedural path exists). They are dead flags surviving session restores, giving the false impression of a toggleable feature.
- **Fix**: Remove both fields + actions + session slots (or wire them to real behavior).

**F34 — `connectionStore.status` is written but never read — REAL PROBLEM**
- **File/function**: `src/store/connectionStore.ts` (`status`, `setStatus`); `src/components/layout/StatusBar.tsx` — the "Active" dot is hardcoded `bg-accent-green` and never reads `status`; `CoordinatorContext.tsx` writes `'connecting'/'connected'/'error'/'disconnected'`.
- **Problem**: The green "Active" indicator is unconditional — it displays "Active" even when the connection store says `disconnected`/`error`. Combined with F2, the StatusBar conveys state that is either hardcoded or stale. Also `useCoordinator`/`onMessage`/`sendMessage` from `coordinatorContextCore.ts` are consumed by no component.
- **Fix**: Drive the dot from `connectionStore.status` (or remove the status machinery with the coordinator, F3).

**F35 — `worldStore.showDebugJoints` has a setter and an engine consumer but no UI surface — POLISH**
- **File/function**: `src/store/worldStore.ts` (`showDebugJoints`, `setShowDebugJoints`) → `useWorld.ts` (`binder.renderDebugSpheres(worldStore.showDebugJoints)`).
- **Problem**: The flag genuinely works end-to-end, but no rendered control sets it — it's only reachable via console/localStorage edits. A feature flag with no way to flip it from the UI.
- **Fix**: Add a "Debug Joints" toggle to `BodyControls` (alongside "Show All Cameras"/"AI PiP").

**F36 — `index.html` still carries the Vite scaffold title — POLISH**
- **File/function**: `index.html` — `<title>temp-vite</title>`.
- **Problem**: Browser tab/window title is a scaffold leftover; the README and `STRINGS.APP.NAME` both call it SYNTHIA.
- **Fix**: `<title>SYNTHIA</title>` (plus a meta description).

---

## 10. Miscellaneous code-level UI defects observed

**F37 — Piano reward popups appear at random screen-center coordinates — REAL PROBLEM**
- **File/function**: `src/components/world/WorldViewport.tsx` (piano outcome polling `setInterval`): `x: window.innerWidth / 2 + (Math.random() - 0.5) * 100`, `y: window.innerHeight / 2 + (Math.random() - 0.5) * 100` — the comment itself says "Placeholder projection".
- **Problem**: When a piano note is played, the floating `+1.0` reward text spawns near the center of the screen regardless of where the piano/press actually happened — visually disconnected feedback that looks like a bug (it's a leftover placeholder).
- **Fix**: Project the note's world position to screen (`vector.project(camera)` + NDC→CSS) before setting `x/y`.

**F38 — `AgentLoop` swallows every cycle error with only a console log — REAL PROBLEM (feedback)**
- **File/function**: `src/world/agent/AgentLoop.ts` `cycle()` catch → `console.error` only; `InferenceClient.infer()` throws on `!response.ok`.
- **Problem**: When inference fails (bad key, dead endpoint, CORS), the agent silently goes `thinking → (error) → idle` and the status chip (AgentStatus/AgentSettings statusChip) never shows an error state — `setStatusForAgent(..., 'idle')` runs in `finally`, so the UI reads "idle" after every failed cycle. Nothing surfaces "inference failed: HTTP 401 …" to the user.
- **Fix**: On catch, call `runtimeStore.setLoopState(agentId, 'error')` and `synthiaToast.error(short error)` (visible per F1), and have the status chip render the `error` state (AgentStatus already maps `'error'`, but AgentLoop never sets it).

**F39 — `AgentSettingsModal` provider dropdown + model dropdown + "Custom…" state can desync from the store — POLISH**
- **File/function**: `AgentSettingsModal.tsx` infra tab — model `<select>` value `showCustomModel ? '__custom__' : config.model`; `handleProviderChange` resets `showCustomModel(false)`.
- **Problem**: If `config.model` carries a value not in the list (e.g. a model entered via Custom then provider switched back), the select value doesn't match any `<option>`, leaving the dropdown visually blank while `config.model` remains set. Minor, but a real "UI shows nothing where a value exists" state.
- **Fix**: Compute `value={PROVIDER_INFO[...].models?.includes(config.model) ? config.model : '__custom__'}` reactively instead of relying on `showCustomModel`.

---

## Categories that turned up nothing real

- **Icon/endpoint UI remnants from the coordinator era**: I found no remaining "endpoint URL" *input* in the current UI (the endpoint field exists only inside `connectionStore` + `AgentSettingsModal`'s "API Base URL", which is the live per-agent provider config — that's genuine). No "Connecting…" spinner in components. The dead weight is the `CoordinatorProvider`/WS machinery (F3) and the metrics it used to feed (F2).
- **IA boundary violation between modals**: The one true boundary violation is F30 (per-agent modal editing global vision). Memory export/injection/pause boundaries all read/write the same stores as intended.

---

## Suggested fix priority

1. F1 (toasts invisible) — unblocks honest feedback for ~40 call sites.
2. F25 (unrecoverable dragged panels) + F20 (Escape/focus) — keyboard + recovery safety.
3. F10 (fake config success), F38 (silent loop errors) — honest async feedback.
4. F7/F8/F33 (duplicated/orphaned store state) — single-source-of-truth cleanup.
5. F3/F2/F4 (coordinator-era dead UI) — removal pass.
6. F22/F23 (contrast + light-theme hover) — theme tokens.
7. Remaining Real Problems/Polish in order listed.

*Note: This audit was produced in Explore Mode, which mandates saving findings as `project_info__{no}.md` in the repo root. The content above is the complete UI audit requested as `UI_AUDIT.md`; it can be copied/renamed to `UI_AUDIT.md` if desired. All findings are from direct code reading; line references are to the named functions/sections, which are stable anchors.*

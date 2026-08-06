# Synthia UI Consistency Restoration Plan — Dropdowns, Modals, Export Text, Icons

## Summary

This plan addresses four UI problems in the Synthia 3D agent sandbox (React 18 + Vite + Tailwind + Three.js):

1. **Native `<select>` dropdowns** — unstyled OS-native popups with no custom rounded corners and unbounded list height (e.g., the 24-provider inference dropdown).
2. **Object Spawner UX** — currently opens as a stacked full-screen blurred overlay *on top of* the God Mode panel (z-[100] over z-[60]), forcing two modals to be open, blocking the view of the 3D world.
3. **Export / Agent Settings modals** — full-screen blurred overlays that only close via the X button or Escape; no click-outside-to-close.
4. **Clustered text in the Export modal** — many labels/chips at 8–9px with tight leading, and a cramped 280px preview column.
5. **Icon set** — the codebase uses `@phosphor-icons/react` everywhere; the user wants Microsoft **Fluent 2** icons (the `@fluentui/react-icons` family) used throughout.

---

## 1. Custom Dropdown Component (`src/components/ui/Dropdown.tsx` — NEW)

### Problem
Native `<select>` elements render OS-drawn popups that cannot receive custom `border-radius`, padding, or max-height. The provider dropdown in Agent Settings lists 24 providers and can extend far beyond the viewport.

Sites using native `<select>`:
| File | Select | Notes |
|------|--------|-------|
| `src/App.tsx` (line ~65) | Agent selector in the top-center pill | `bg-transparent border-0` — invisible styling |
| `src/components/agent/AgentSettingsModal.tsx` | Inference Provider | 24 options, `appearance-none` + `CaretDown` |
| `src/components/agent/AgentSettingsModal.tsx` | Model (per provider) | `__custom__` sentinel option |
| `src/components/agent/AgentSettingsModal.tsx` | Voice & TTS selector | `availableVoices` can be long |

### Implementation
Build a generic accessible dropdown/combobox in `src/components/ui/`:

- **Trigger**: styled like the current selects (`h-8`, `bg-bg-elevated`, `border-border`, `rounded-btn` = 8px) with a `CaretDown` affordance.
- **Menu**: absolutely positioned panel below the trigger with:
  - `rounded-btn` (8px) corner radius (or a new `rounded-dropdown: 10px` token in `tailwind.config.js`)
  - `max-h-[280px] overflow-y-auto custom-scrollbar` — **this is the fix for "expanding endlessly"**
  - `bg-bg-elevated` + `border border-border shadow-2xl`, `backdrop-blur-md` glass per design system
  - `z-[130]` so it layers above modal overlays
- **Behavior**: click-outside closes (document `mousedown` listener), ArrowUp/Down navigation, Enter selects, Escape closes; `value`/`onChange` props mirroring `<select>` so call sites swap cleanly.
- **Optional prop**: `searchable` for the provider list (24 items) — filter-as-you-type; not required.
- **Export from the component**: `Dropdown` + `DropdownItem` (or a `items: {value,label,icon?}[]` prop).

### Call-site changes
1. `src/App.tsx` agent selector → `<Dropdown>` styled lean (`glassmorphism`, transparent trigger) with `max-w-[180px] truncate` per item.
2. `src/components/agent/AgentSettingsModal.tsx` provider select → `<Dropdown>` with icon per provider option (optional), `max-h-[280px]`.
3. `src/components/agent/AgentSettingsModal.tsx` model select → `<Dropdown>`; keep the `Custom...` sentinel item.
4. `src/components/agent/AgentSettingsModal.tsx` voice select → `<Dropdown searchable>` because `availableVoices` is often 10+ entries.

---

## 2. Object Spawner — Separate Button + Standalone Draggable Modal

### Problem
`GodModePanel.tsx` renders `<ObjectSpawner />` at the bottom. Opening the spawner (`setObjectSpawnerOpen(true)` in the pinned footer button) keeps the entire God Mode panel open underneath, *and* `ObjectSpawner.tsx` renders its own full-screen overlay:

```tsx
<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
```

Result: two stacked modals, the world dimmed and blurred — the user can't watch their object spawn.

### Implementation
**A. Remove the spawn button from God Mode's footer** (`src/components/godmode/GodModePanel.tsx`):
- Delete the `<Button … onClick={() => setObjectSpawnerOpen(true)}>` block in the "Pinned Bottom Footer Action" section.
- Remove now-unused imports (`Cube`, `STRINGS.GOD_MODE.SPAWN_BUTTON`, `setObjectSpawnerOpen`).

**B. Add a dedicated floating circular trigger button** (`src/App.tsx`):
- Pattern already exists: gear at `top-[68px] left-4`, export at `top-[116px] left-4`. Add a new button at `top-[164px] left-4`:
  ```tsx
  <button
    onClick={() => setObjectSpawnerOpen(true)}
    className="fixed top-[164px] left-4 w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all z-50 group"
    title="Spawn Objects"
  >
    <Cube size={20} className="text-text-secondary group-hover:text-accent-blue" />
  </button>
  ```
- Import `Cube` from Fluent (`@fluentui/react-icons` — see §5) and `setObjectSpawnerOpen` from `useUIStore`.

**C. Rebuild `ObjectSpawner` as a draggable floating modal** (`src/components/godmode/ObjectSpawner.tsx`):
- Delete the `fixed inset-0 … bg-black/60 backdrop-blur-sm` overlay wrapper.
- Mirror the GodModePanel floating-window pattern:
  ```tsx
  <motion.div
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    drag dragMomentum={false} dragElastic={0}
    style={{ isolation: 'isolate' }}
    className="fixed left-[15%] top-[18vh] w-[520px] max-h-[80vh] flex flex-col glassmorphism rounded-modal z-[60] overflow-hidden cursor-grab active:cursor-grabbing"
  >
  ```
- Wrap in `<AnimatePresence>` for exit animation.
- Keep the existing header with X close + Escape handler (already present).
- `max-h-[80vh]` stays so the preset grid scrolls; the **default open position should be offset to the right edge** (`left-[40%]` or `right-[8vw]`) so the spawn point near the agent remains visible. An explicit drag handle row in the header (pseudo-`cursor-grab` already conveys it) is fine.

**D. Keep the spawn flow unchanged** — `synthia:spawn` / `synthia:spawnCustom` events, V-HACD decomposition, upload flow, ModelPreview all untouched.

---

## 3. Click-Outside-to-Close for Modals

### Problem
`ExportModal` and `AgentSettingsModal` each render `fixed inset-0 … bg-black/60 backdrop-blur-sm` and only close on the X button or the `Escape` keydown listener.

### Implementation
Add `onClick` to the overlay + `stopPropagation` on the inner panel:

**`src/components/export/ExportModal.tsx`** (~line 350):
```tsx
<div
  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
  onClick={() => setExportModalOpen(false)}
>
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={(e) => e.stopPropagation()}
    …
```

**`src/components/agent/AgentSettingsModal.tsx`** (~line 275):
Same pattern with `setSettingsModalOpen(false)`.

**`src/components/agent/AgentSettingsModal.tsx` — dropdown menus caveat:** since the settings modal will now close on outside click, ensure the new `Dropdown` component stops propagation on its own `mousedown`/click so opening a dropdown inside the modal doesn't close the modal.

**Optional consistency:** apply the same click-outside to `ObjectSpawner` only *after* the §2 rebuild — with the full-screen overlay removed, click-outside can't work on a floating window; the X/Escape close suffices there. Do **not** add backdrop-click closure to `GodModePanel` / right panel (they're draggable floating windows, not overlays).

---

## 4. Fix Clustered Text in the Export Modal

### Problem
`ExportModal.tsx` uses an 8–9px "micro-typography" scale with tight line-heights and a cramped 280px preview column. At DP1/-ish zoom this reads as clustered, overlapping text — specifically:

- Export-type cards: `text-[9px]` descriptions with `line-clamp-2` inside `text-center` flex columns of a 3-col grid of a `flex-1` left panel.
- Task-filter chips: `text-[9px] font-mono`.
- Format `tag` badge: `text-[8px]`.
- Session rows: `text-[9px]`/`text-[10px]` font-mono.
- Preview panel: `text-[9px] uppercase` labels + `text-xs` values in a `w-[280px]` column with `bg-black/10` card.

### Implementation
Raise the typographic floor and widen the preview column:

| Location | From | To |
|----------|------|----|
| Right preview column width | `w-[280px]` | `w-[300px]` |
| Right preview card padding | `space-y-3.5` | `space-y-4` |
| All `text-[8px]` (format tag) | `text-[8px]` | `text-[10px]` with `px-1.5 py-0.5` |
| Export-type card desc | `text-[9px] leading-tight line-clamp-2` | `text-[10px] leading-snug line-clamp-2` (keep line-clamp; add `mt-0.5`) |
| Task-filter chips | `text-[9px] font-mono` | `text-[10px] font-mono`, `px-2.5 py-1` |
| Session rows | `text-[9px]`/`text-[10px]` | `text-[10px]`/`text-[11px]`, row `py-1.5` → `py-2` |
| Left-panel section labels | `text-[10px]` | keep `text-[10px]` but add `mb-2` spacing consistently |
| Preview-panel labels | `text-[9px] uppercase` | `text-[10px] uppercase`, add `tracking-wider` (already present) |
| Left panel padding | `p-6 space-y-5` | `p-6 space-y-6` |

Also fix the section-divider pattern: several sections use `border-b border-border-subtle pb-3` on the *wrapping* `AnimatePresence` outer div, which produces inconsistent spacing between sections — move the divider onto a consistent `Section` wrapper (or add `pt-4` to the section after each divider). Optional but recommended for visual rhythm.

---

## 5. Replace Phosphor Icons with Fluent 2 Icons

### Problem
Every UI file imports `@phosphor-icons/react`:
`App.tsx`, `ObjectSpawner.tsx`, `ExportModal.tsx`, `AgentSettingsModal.tsx`, `GodModePanel.tsx`, `MemoryViewer.tsx`, `ThoughtBank.tsx`, `LogViewer.tsx`, `InjectionInput.tsx`, `AgentStatus.tsx`, `StructureViewer.tsx`, `ModelInputPiP.tsx`.

### Implementation
**A. Dependency**
- Add `@fluentui/react-icons` (Fluent 2 React package — MIT, tree-shakeable, sizes 16/20/24/28/32/48).
- Keep `@phosphor-icons/react` installed only if some icon has no Fluent equivalent; otherwise remove.

**B. Create a central icon map — `src/components/ui/icons.ts` (NEW)**
Core idea: **swap every `* as Icons from '@phosphor-icons/react'` block for named Fluent imports, but keep a single `icons.ts` re-export module** so components import from one place and future icon swaps are one-file edits. If a full swap is preferred per file (simpler diff review), the file-by-file approach is fine too — but a shared map avoids 12 files all needing `weight`/`size` prop adjustments.

Fluent 2 mapping reference (Phosphor → Fluent, at 16/20/24px):

| Phosphor | Fluent 2 (`@fluentui/react-icons`) |
|----------|-------------------------------------|
| `X` | `Dismiss20Regular` / `Dismiss24Regular` |
| `CaretDown` / `CaretUp` | `ChevronDown20Regular` / `ChevronUp20Regular` |
| `Cube` | `Cube20Regular` / `Cube24Regular` |
| `GearSix` / `Gear` | `Settings20Regular` / `Settings24Regular` |
| `Brain` | `BrainCircuit20Regular` |
| `Database` | `Database20Regular` |
| `ArrowsClockwise` | `ArrowClockwise20Regular` |
| `CheckCircle` | `CheckmarkCircle20Regular` |
| `WifiHigh` | `Wifi20Regular` |
| `PlugsConnected` | `PlugConnected20Regular` |
| `SpeakerHigh` | `Speaker220Regular` |
| `SpeakerSlash` | `SpeakerMute20Regular` |
| `Eye` | `Eye20Regular` |
| `WarningCircle` | `Warning20Regular` |
| `Info` | `Info20Regular` |
| `MagnifyingGlass` | `Search20Regular` |
| `Bookmark` | `Bookmark20Regular` (`BookmarkFilled` for fill variant) |
| `Pause` / `Play` | `Pause20Regular` / `Play20Regular` |
| `Export` | `ArrowExportLtr20Regular` (or `ShareIos20Regular`) |
| `DownloadSimple` | `ArrowDownload20Regular` |
| `UploadSimple` | `ArrowUpload20Regular` |
| `Spinner` | `SpinnerIos20Regular` (animate via `animate-spin` class as today) |
| `FileCloud` | `CloudArchive20Regular` |
| `FileCode` / `FileCsv` | `Code20Regular` / `Document20Regular` (closest; consider `DocumentTable` for CSV) |
| `Archive` | `Archive20Regular` |
| `Notebook` | `Book20Regular` / `Notebook20Regular` |
| `Robot` | `Bot20Regular` |
| `User` / `Users` | `Person20Regular` / `People20Regular` |
| `Camera` / `VideoCamera` | `Camera20Regular` / `Video20Regular` |
| `Monitor` | `Monitor20Regular` |
| `TreeStructure` | `Hierarchy20Regular` (or `Organization20Regular`) |
| `Sun` / `Moon` | `Sunny20Regular` / `WeatherMoon20Regular` |
| `ListChecks` | `Checklist20Regular` |
| `Syringe` | `Syringe20Regular` (exists in Fluent) |
| `Microphone` | `Mic20Regular` |
| `ArrowRight` | `ArrowRight20Regular` |
| `ArrowDown` | `ArrowDown20Regular` |
| `Trash` | `Delete20Regular` |
| `MusicNotes` | `MusicNote120Regular` |
| `DotsNine` | `Grid20Regular` |
| `Steps` | `Step20Regular` |
| `TrendUp` | `ArrowTrendingLines20Regular` (or `DataTrending20Regular`) |
| `Triangle` / `Circle` / `Cylinder` | `Triangle12Regular` / `Circle20Regular` / `Shape3D20Regular` (closest) |
| `ArrowFatLinesUp` | `ArrowUp20Regular` |

Icon `size` prop stays; Fluent uses `Regular`/`Filled` suffixes instead of Phosphor's `weight` prop — the map module normalizes this (export helpers `XIcon = Dismiss20Regular`, etc., or a `FluIcon = (props) => <Icon size={props.size ?? 16} />`).

**C. Per-file swap checklist**
1. `src/App.tsx` — replace `import { Brain, Database, Cube, ListChecks, TreeStructure, Camera, VideoCamera, Monitor, X, Sun, Moon, Gear, SpeakerHigh, SpeakerSlash, Export } from '@phosphor-icons/react'` with Fluent map imports.
2. `src/components/godmode/ObjectSpawner.tsx` — replace `import * as Icons from '@phosphor-icons/react'`; the preset-icon dynamic lookup (`Icons[preset.icon]`) must change: convert `OBJECT_PRESETS[].icon` string keys to Fluent component references (update `src/constants/objectPresets.ts` `icon` field to a map key; `icons.ts` exports `PRESET_ICONS: Record<string, IconComponent>`).
3. `src/components/export/ExportModal.tsx` — `* as Icons` → named Fluent imports.
4. `src/components/agent/AgentSettingsModal.tsx` — 22-name named import → Fluent map.
5. `src/components/godmode/GodModePanel.tsx`, `ModelInputPiP.tsx`, `ModelPreview.tsx` (none — ModelPreview imports only `three`), `DirectivePanel.tsx`, `AgentBodyControls.tsx`, `BodyControls.tsx`, `PhysicsControls.tsx` (these three use no phosphor icons today — verify with grep before editing).
6. `src/components/agent/*` — `MemoryViewer.tsx`, `ThoughtBank.tsx`, `LogViewer.tsx`, `InjectionInput.tsx`, `AgentStatus.tsx`, `StructureViewer.tsx`.
7. Remove `@phosphor-icons/react` from `package.json` **only after** all imports are converted; run `npm run build` + `npm run typecheck` to catch stragglers.

**D. ObjectSpawner preset icon lookup detail** (biggest refactor in the icon swap):
`OBJECT_PRESETS` currently stores `icon: 'Cube' | 'Circle' | …` string names. Change `ObjectPreset.icon` to a `PhosphorIconName` → replace with `icon: LucideIcon`-style component refs (e.g., `icon: CubeIcon`) OR keep the string key and register Fluent components in `icons.ts` under the same string keys:
```ts
// icons.ts
export const PRESET_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Cube: Cube20Regular,
  Circle: Circle20Regular,
  Cylinder: Shape3D20Regular,
  Triangle: Triangle12Regular,
  ArrowFatLinesUp: ArrowUp20Regular,
  Steps: Step20Regular,
  TrendUp: ArrowTrendingLines20Regular,
  MusicNotes: MusicNote120Regular,
  DotsNine: Grid20Regular,
  ArrowsClockwise: ArrowClockwise20Regular,
};
```
This keeps `objectPresets.ts` data-only and the lookup in `ObjectSpawner` becomes `PRESET_ICONS[preset.icon]`.

---

## 6. Files Touched (Summary)

| File | Change |
|------|--------|
| `src/components/ui/Dropdown.tsx` | **NEW** — custom dropdown (rounded, max-height, scroll, keyboard nav) |
| `src/components/ui/icons.ts` | **NEW** — Fluent 2 icon map + preset icon registry |
| `src/components/godmode/ObjectSpawner.tsx` | Remove blur overlay → draggable floating modal (§2C); icon swap (§5) |
| `src/components/godmode/GodModePanel.tsx` | Remove spawner footer button (§2A); icon swap |
| `src/App.tsx` | Agent selector → `Dropdown` (§1); new spawner trigger button at `top-[164px]` (§2B); icon swap |
| `src/components/agent/AgentSettingsModal.tsx` | 3 selects → `Dropdown`; click-outside-to-close (§3); icon swap |
| `src/components/export/ExportModal.tsx` | Click-outside-to-close (§3); typography/spacing pass (§4); icon swap |
| `src/components/agent/MemoryViewer.tsx` | Icon swap |
| `src/components/agent/ThoughtBank.tsx` | Icon swap |
| `src/components/agent/LogViewer.tsx` | Icon swap |
| `src/components/agent/InjectionInput.tsx` | Icon swap |
| `src/components/agent/AgentStatus.tsx` | Icon swap |
| `src/components/agent/StructureViewer.tsx` | Icon swap |
| `src/components/world/ModelInputPiP.tsx` | Icon swap |
| `src/constants/objectPresets.ts` | (Optional) icon key normalization |
| `package.json` | Add `@fluentui/react-icons`; remove `@phosphor-icons/react` at the end |
| `tailwind.config.js` | (Optional) add `rounded-dropdown` token |

**Verification steps after implementation:**
1. `npm run dev` — open three browsers widths (1280 / 1600 / 2560).
2. Open God Mode → spawner now has its own button; opening it does NOT stack modals; drag it around; spawn a cube and watch it fall in the world while the spawner is moved aside.
3. Export modal: click backdrop → closes; check text density at every panel.
4. Agent Settings: click backdrop → closes; open provider dropdown → menu is rounded, scrolls at 280px, doesn't overflow the screen.
5. Grep for `@phosphor-icons/react` — expect zero hits.

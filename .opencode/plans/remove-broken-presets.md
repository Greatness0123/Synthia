# Remove Broken Presets + Fix Remaining Primitives

## Overview
Remove 6 non-functional object presets (slope, step, ramp, piano, ball_pit, swing) that spawn as plain boxes with no actual geometry. Fix wedge missing side faces. Fix cylinder icon.

## What stays (4 presets + custom)
- cube, sphere, cylinder, wedge (all Primitives category)
- Custom upload (GLB/GLTF)

---

## File-by-file changes

### 1. `src/constants/objectPresets.ts`
- Remove `'Terrain' | 'Interactive'` from `category` union type → becomes `'Primitives'`
- Remove all 6 broken presets from `OBJECT_PRESETS` array
- Result: 4 presets (cube, sphere, cylinder, wedge)

### 2. `src/world/engine/ObjectManager.ts`
**Line 345:** Remove `if (obj.preset.id === 'piano') return;`

**Line 371:** Remove `if (obj.preset.id === 'piano') return;`

**Line 406:** Change `['cube', 'wedge', 'slope', 'ramp'].includes(obj.preset.id)` → `obj.preset.id === 'wedge'`

**Lines 512-515:** Remove entire piano spawn bypass block

**Lines 545-547:** Remove `case 'slope':` and `case 'ramp':` from wedge geometry case (keep only `case 'wedge':`)

**Line 612:** Change `['cube', 'wedge', 'slope', 'ramp', 'step', 'ball_pit', 'swing'].includes(preset.id)` → `['cube', 'wedge'].includes(preset.id)`

**Lines 899-908:** Remove entire piano deactivation block

### 3. `src/world/engine/CollisionAdapter.ts`
**Lines 29-30:** Remove `case 'slope':` and `case 'ramp':` from `objectPresetToMJCFGeom()`

### 4. `src/components/ui/icons.tsx`
**Lines 112-123:** Remove unused icon imports:
- `Upload as ArrowUpFromLine` (slope)
- `DirectionsWalk as Footprints` (step)
- `TrendingUp` (ramp)
- `MusicNote as Music2` (piano)
- `GridOn as Grid3x3` (ball_pit)
- `Refresh as RotateCw` (swing)

**Lines 127-138:** Remove 6 unused entries from PRESET_ICONS map:
- `ArrowFatLinesUp`, `Steps`, `TrendUp`, `MusicNotes`, `DotsNine`, `ArrowsClockwise`

### 5. `src/components/godmode/ObjectSpawner.tsx`
**Line 85:** Remove category tabs entirely. Change:
```typescript
const categories: Category[] = ['Primitives', 'Terrain', 'Interactive', 'Custom'];
```
to just show all presets + custom upload in one flat view. Remove the `activeCategory` state and category tab bar (lines 372-386). Show presets grid + custom upload in a single scrollable view.

### 6. `src/world/hooks/useWorld.ts`
**Line 1212:** Remove `&& presetId !== 'piano'` condition

### 7. `src/components/world/WorldViewport.tsx`
**Lines 24-31:** Remove entire piano reward display block

---

## Verification
1. `npx tsc --noEmit` — typecheck passes
2. Spawn cube, sphere, cylinder, wedge — all work with correct collision
3. Wedge has proper side faces (left/right triangle caps render correctly)
4. Cylinder shows correct icon
5. No Terrain/Interactive tabs in spawner
6. Custom upload still works

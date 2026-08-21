# SYNTHIA Humanoid — Preset Motion Actions

A library of browser console scripts that make the SYNTHIA humanoid move with
precision-engineered joint commands. Every angle is in **radians**, every bone name
matches the MuJoCo model, and every sequence respects anatomical limits.

---

## Quick Start

1. Open the SYNTHIA app in your browser (`npm run dev` or production URL).
2. Open **DevTools Console** (F12 → Console).
3. Paste **any** script from this folder, or paste `00_action_runner.js` for
   the full `window.synthiaActions` command set.

---

## Coordinate System (CRITICAL)

| Direction       | Three.js World | MuJoCo World |
|-----------------|----------------|--------------|
| **Visual Front (Forward)** | **−Z** | **−Y** |
| **Visual Back**  | +Z             | +Y           |
| **Up**           | +Y             | +Z           |
| **Right**        | +X             | +X           |

- `binder.setTargetRootVelocity(0, -speed, holdMs)` → moves **forward**.
- Hip pitch **+** = forward swing (`+20°` to `+30°`).
- Knee **+ (POSITIVE)** = normal backward knee flexion (`+30°` to `+90°`, heel toward glute).
  *(Hinge axis is calibrated to `-1 0 0` so positive angle bends the knee backward and passes anatomical validation `[0, 150°]`).*
- Ankle pitch **+** = dorsiflexion (`+14°` to `+20°`, toes UP).
- Arm roll **±** = outward clearance (Left: `-12°`, Right: `+12°`) to prevent inward rib clipping.

---

## Joint Convention

All values are **radians**. Convert degrees: `const DEG = Math.PI / 180;`

### 3-DOF joints (spine, neck, head, shoulders, arms, upper legs)
Format: `[x=pitch, y=yaw, z=roll]`
- `ctrl[0]=yaw, ctrl[1]=pitch, ctrl[2]=roll`

### 2-DOF joints (hands/wrists, feet/ankles)
Format: `[pitch, 0, roll]`

### 1-DOF joints (knees, forearms, fingers)
Format: scalar number

---

## File Inventory

| File | Purpose | Key Commands |
|------|---------|--------------|
| `00_action_runner.js` | Master controller — loads all others | `synthiaActions.help()` |
| `01_standing_and_posture.js` | Static poses | `synthiaPoseNatural()`, `synthiaPoseGuard()`, `synthiaPoseSquat()` |
| `02_walking_and_locomotion.js` | **Continuous robotic walking** | `synthiaWalk()`, `synthiaWalkBackward()`, `synthiaStopWalk()` |
| `03_jumping_and_aerial.js` | Jump sequences | `synthiaJump()`, `synthiaForwardLeap()`, `synthiaBunnyHop(3)` |
| `04_hand_and_finger_gestures.js` | Finger/hand presets | `synthiaPoint()`, `synthiaFist()`, `synthiaWave()`, `synthiaThumbsUp()` |
| `05_expressive_and_utility.js` | Expressive motions | `synthiaNodYes()`, `synthiaShakeNo()`, `synthiaShrug()`, `synthiaKick()` |

---

## Walking — How It Works

The walking system uses a **continuous robotic waddle** — NOT human heel-toe gait.

### Why Robotic Waddle?
Human walking requires dynamic balance, heel-strike, toe-off, and precise
center-of-mass management that a servo-driven MuJoCo model cannot replicate.
Instead, we use small lateral weight shifts with alternating leg swings:

1. **Stance Leg** holds slight extension (hip −0.08 rad), knee near-straight (0.05 rad).
2. **Swing Leg** flexes forward (hip +0.30 rad), knee bends (0.35 rad), ankle dorsiflexes.
3. **Spine** tilts laterally toward stance leg (roll ±0.03 rad) for weight centering.
4. **Root Velocity Drive** (`setTargetRootVelocity`) pushes the body forward at 0.08 m/s.
5. **RMBS** (Reaction Mass Balance System) keeps the body upright throughout.

### Critical Rule: NO SNAP-BACK
Each leg dispatch sets a new steady-state. We NEVER return a leg to neutral
before advancing the other. The sequence is:
- Right leg forward → Left leg forward (right stays where it was) →
  Right leg forward again (left stays) → continuous progression.

---

## Anatomical Limits (radians)

| Joint | Range |
|-------|-------|
| Knee | [0, 2.618] |
| Forearm | [0, 2.531] |
| Fingers | [0, 1.745] |
| Ankle pitch | [−0.785, 0.785] |
| Hip (per axis) | [−2.094, 2.094] |
| Spine pitch | [−0.524, 0.785] |
| Arm pitch | [−2.356, 2.356] |
| Head (per axis) | [−1.047, 1.047] |

---

## Bone Names (canonical, lowercase, no colons)

**Spine chain:** `mixamorigspine`, `mixamorigspine1`, `mixamorigspine2`,
`mixamorigneck`, `mixamorighead`

**Arms:** `mixamorigleftshoulder`, `mixamorigrightshoulder`,
`mixamorigleftarm`, `mixamorigrightarm`

**Forearms:** `mixamorigleftforearm`, `mixamorigrightforearm`

**Hands:** `mixamoriglefthand`, `mixamorigrighthand`

**Fingers:** `mixamorig{left|right}hand{thumb|index|middle|ring|pinky}{1|2|3}`

**Legs:** `mixamorigleftupleg`, `mixamorigrightupleg`

**Knees:** `mixamorigleftleg`, `mixamorigrightleg`

**Feet:** `mixamorigleftfoot`, `mixamorigrightfoot`

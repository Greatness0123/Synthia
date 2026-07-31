# Diagnostic Poses V2 — Joint Limit Audit & Complete Coordinate Listing

## Summary

This report cross-references every joint angle in `diagnostic_poses_v2.js` against the system's rig constraints (`src/constants/rigConstraints.ts`), anatomical limits (`src/constants/anatomicalLimits.ts`), and the MuJoCo physics template (`src/world/engine/MJCFHumanoidTemplate.ts`). 

**Bottom line**: The vast majority of pose coordinates are well within limits. Three poses contain angles that exceed their rig constraints and will be silently clamped at runtime. Several rig constraints themselves are noticeably tighter than human anatomical norms — particularly head rotation (30° vs 80° human) and head pitch (30° vs 45-60° human). Spine backward extension is also tighter than human norm (15° vs 30-45°).

---

## 1. How Pose Angles Flow Through Validation

Every `sendPose()` call dispatches angles that go through:

```
diagnostic_poses_v2.js  →  synthia:action event  →  useWorld.ts handleAction()
  →  HumanoidPhysicsBinder.validateAndApplyTimeline()
      →  checks SYNTHIA_RIG_CONSTRAINTS for each bone
      →  clamps values exceeding constraint.x/y/z ranges
      →  rejects segments 2/3 if tendonSynergyLink violated
  →  HumanoidPhysicsBinder.setMotorTargets()
      →  checks anatomical limits as secondary clamp
  →  MotorController.setTargets()
      →  sends to MuJoCo actuators
```

**Key**: Angles that exceed rig constraints are **silently clamped** — they don't error, they just don't reach the intended angle. The pose script author would see the clamping note in `ValidateResult.clampingNotes` but the browser console never prints those.

---

## 2. Rig Constraint Reference Table

| Bone | DOF | X (Pitch) | Y (Roll) | Z (Yaw) | Human Norm |
|------|-----|-----------|----------|---------|------------|
| `mixamorigspine` | 3 | -15° to +30° | ±30° | ±30° | Fwd: 45°, Bk: 30°, Lat: 30°, Rot: 45° |
| `mixamorigspine1` | 3 | ±30° | ±30° | ±30° | same |
| `mixamorigspine2` | 3 | ±30° | ±30° | ±30° | same |
| `mixamorigneck` | 3 | ±45° | ±70° | ±40° | Pitch: 45°, Yaw: 70°, Roll: 40° |
| `mixamorighead` | 3 | ±30° | ±50° | ±30° | Pitch: 45-60°, Yaw: 70-80°, Roll: 40° |
| `mixamorigrightarm` | 3 | ±135° | ±90° | ±90° | Fwd flex: 180°, Ext: 45-60° |
| `mixamorigrightforearm` | 1 | 0° to +145° | – | – | 0° to 145° |
| `mixamorigrighthand` | 2 | ±80° | – | ±20° | Flex/Ext: 80°, Dev: 20° |
| `mixamorigrightupleg` | 3 | ±120° | ±120° | ±120° | Flex: 120°, Ext: 20°, Abd: 45° |
| `mixamorigrightleg` | 1 | -150° to 0° | – | – | 0° to 150° |
| `mixamorigrightfoot` | 2 | ±45° | – | ±45° | Dorsi: 20°, Plantar: 45° |
| Finger segments (1-3) | 1 | 0° to +100° | – | – | MCP: 90°, PIP: 100°, DIP: 80° |

---

## 3. Complete Pose Coordinate Listing

### 3.1 Head Poses

| Pose Name | Bone | X (deg) | Y (deg) | Z (deg) | X (rad) | Constraint X | Y Constraint | Z Constraint | Status |
|-----------|------|---------|---------|---------|---------|-------------|-------------|-------------|--------|
| Nod Forward | head | +30° | 0° | 0° | 0.524 | [-30,+30] | – | – | **AT MAX** |
| Tilt Back | head | -20° | 0° | 0° | -0.349 | [-30,+30] | – | – | ✓ |
| Tilt Right | head | 0° | -20° | 0° | -0.349 | – | [-50,+50] | – | ✓ |
| Tilt Left | head | 0° | +20° | 0° | 0.349 | – | [-50,+50] | – | ✓ |
| Turn Right | head | 0° | 0° | -35° | -0.611 | – | – | [-30,+30] | **EXCEEDS (±5°)** |
| Turn Left | head | 0° | 0° | +35° | 0.611 | – | – | [-30,+30] | **EXCEEDS (±5°)** |

**Issue**: Head Z (turn/yaw) at ±35° exceeds the head rig constraint of ±30°. The head constraint at ±30° is itself very tight — humans can rotate their head 70-80°. **Recommendation**: either loosen head Z constraint to ±50° to match Y, or reduce pose targets to ±30°.

---

### 3.2 Spine Poses

| Pose Name | Bone(s) | X (deg) | Y (deg) | Z (deg) | Constraint | Status |
|-----------|---------|---------|---------|---------|-----------|--------|
| Forward Lean | spine + spine1 | +14° | 0 | 0 | [-15,+30] | ✓ (near max) |
| Forward Lean | spine2 | +10° | 0 | 0 | [-30,+30] | ✓ |
| Tilt Right | spine + spine1 | 0 | -15° | 0 | [-30,+30] | ✓ |
| Tilt Left | spine + spine1 | 0 | +15° | 0 | [-30,+30] | ✓ |
| Twist Right | spine + spine1 | 0 | 0 | -20° | [-30,+30] | ✓ |
| Twist Left | spine + spine1 | 0 | 0 | +20° | [-30,+30] | ✓ |

All spine poses are within constraints. `spine` X +14° is close to the +30° forward max but well within. Note `spine` X min is -15° (tight for backward extension — humans can do ~30-45°).

---

### 3.3 Right Arm Poses

| Pose Name | arm X | arm Z (yaw) | forearm | Constraint | Status |
|-----------|-------|-------------|---------|-----------|--------|
| At Side | +75° | 0 | – | X:[-135,+135] | ✓ |
| Overhead | -90° | 0 | – | X:[-135,+135] | ✓ |
| Swing Forward | 0 | -90° | – | Z:[-90,+90] | **AT MAX** |
| Swing Back | 0 | +45° | – | Z:[-90,+90] | ✓ |
| Left Arm Forward | 0 | +90° | – | Z:[-90,+90] | **AT MAX** |
| Left Overhead | -90° | 0 | – | X:[-135,+135] | ✓ |
| 90° Elbow Flex | +75° | 0 | 90° | F:[0,+145] | ✓ |
| 135° Elbow Flex | +75° | 0 | 135° | F:[0,+145] | ✓ |

---

### 3.4 Hip & Leg Poses

| Pose Name | upleg X | upleg Z | leg (knee) | Status |
|-----------|---------|---------|------------|--------|
| Right Forward Kick | +45° | 0 | – | ✓ X:[-120,+120] |
| Right Backward Kick | -30° | 0 | – | ✓ |
| Right Abduct Outward | 0 | +30° | – | ✓ Z:[-120,+120] |
| Right Knee 90° | – | – | -90° | ✓ [-150,0] |
| Right Knee Full Bend | +40° | 0 | -130° | ✓ |

---

### 3.5 Ankle Poses

| Pose Name | foot X | Constraint | Status |
|-----------|--------|-----------|--------|
| Dorsiflexion (toes up) | +20° | [-45,+45] | ✓ |
| Plantarflexion (toes down) | -25° | [-45,+45] | ✓ |

---

### 3.6 Composite Poses — Full Coordinate Listing

#### Guard Stance (Both Fists)

| Bone | X (deg) | Y (deg) | Z (deg) / Scalar | Constraint Range | Status |
|------|---------|---------|-------------------|-----------------|--------|
| rightarm | +20° | 0° | -55° | X:[-135,+135], Z:[-90,+90] | ✓ |
| leftarm | +20° | 0° | +55° | X:[-135,+135], Z:[-90,+90] | ✓ |
| rightforearm | 100° | – | – | [0,+145] | ✓ |
| leftforearm | 100° | – | – | [0,+145] | ✓ |
| righthand | +5° | 0° | 0° | X:[-80,+80] | ✓ |
| lefthand | +5° | 0° | 0° | X:[-80,+80] | ✓ |
| spine | +5° | 0° | 0° | X:[-15,+30] | ✓ |
| head | +5° | 0° | 0° | X:[-30,+30] | ✓ |

**Note**: The `...FIST_RIGHT` and `...FIST_LEFT` spreads are included. Fist finger angles: thumb1=75°, thumb2=80°, thumb3=55°, all others at 75°/90°/75°. All within [0°,100°] finger constraint. However, thumb3 at 55° exceeds the tendon synergy requirement — thumb2 at 80° is > 0, so thumb3 passes the synergy check ✓.

#### Point: Right Index Forward

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm | [10°, 0°, -75°] | X:[-135,+135], Z:[-90,+90] | ✓ |
| rightforearm | 30° | [0,+145] | ✓ |
| righthand | [0,0,0] | X:[-80,+80] | ✓ |
| rightindex1,2,3 | 0° | [0,+100] | ✓ (extended) |
| rightthumb1,2,3 | 15°,20°,10° | [0,+100] | ✓ |
| rightmiddle1,2,3 | 70°,85°,70° | [0,+100] | ✓ |
| rightring1,2,3 | 70°,85°,70° | [0,+100] | ✓ |
| rightpinky1,2,3 | 70°,85°,70° | [0,+100] | ✓ |

#### Peace Sign: Right

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm | [10°, 0°, -60°] | Z:[-90,+90] | ✓ |
| rightforearm | 20° | [0,+145] | ✓ |
| rightindex1,2,3 | 0° | [0,+100] | ✓ |
| rightmiddle1,2,3 | 0° | [0,+100] | ✓ |
| rightthumb1,2,3 | 25°,35°,20° | [0,+100] | ✓ |
| rightring1,2,3 | 70°,85°,70° | [0,+100] | ✓ |
| rightpinky1,2,3 | 70°,85°,70° | [0,+100] | ✓ |

#### Thumbs Up: Right

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm | [60°, 0°, -25°] | ✓ | ✓ |
| rightforearm | 25° | [0,+145] | ✓ |
| righthand | [0,0,0] | ✓ | ✓ |
| rightthumb1,2,3 | 0° | [0,+100] | ✓ (extended) |
| Other fingers | 75°,90°,75° (closed) | [0,+100] | ✓ |

#### OK Sign: Right

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm | [65°, 0°, -30°] | ✓ | ✓ |
| rightforearm | 35° | [0,+145] | ✓ |
| rightthumb1,2,3 | 50°,65°,45° | [0,+100] | ✓ |
| rightindex1,2,3 | 40°,55°,40° | [0,+100] | ✓ |
| rightmiddle,ring,pinky | 0° (extended) | [0,+100] | ✓ |

#### Finger Isolation Poses (Thumb through Pinky)

Each at 70°/85°/60° — all within [0°,100°] constraint ✓. All held by `rightarm: [75°, 0°, 0°]` and `rightforearm: 20°`.

#### T-Pose

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm, leftarm | [0,0,0] | X:[-135,+135] | ✓ (arms out) |
| Both hands | [0,0,0] | X:[-80,+80] | ✓ |
| All fingers | 0° | [0,+100] | ✓ |

#### Natural Arms-Down

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm, leftarm | [75°,0,0] | X:[-135,+135] | ✓ |
| Both hands | [5°,0,0] | X:[-80,+80] | ✓ |
| Fingers | RELAXED_RIGHT/LEFT (10-20°) | [0,+100] | ✓ |

#### Arms Overhead

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm, leftarm | [-90°,0,0] | X:[-135,+135] | ✓ |
| Both forearms | 10° | [0,+145] | ✓ |

#### Both Arms Reach Forward

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| rightarm | [10°, 0°, -80°] | Z:[-90,+90] | ✓ |
| leftarm | [10°, 0°, +80°] | Z:[-90,+90] | ✓ |
| forearms | 5° | [0,+145] | ✓ |
| spine | [8°,0,0] | X:[-15,+30] | ✓ |

#### Hands on Hips

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| both arms | [30°, 0°, ±30°] | ✓ | ✓ |
| both forearms | 75° | [0,+145] | ✓ |
| both hands | [10°,0,0] | ✓ | ✓ |
| Fingers (~50-60°) | ✓ | ✓ | ✓ |

#### Arms Crossed

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| both arms | [15°, 0°, ±30°] | ✓ | ✓ |
| both forearms | 120° | [0,+145] | ✓ (near max) |
| Fingers (~35-45°) | ✓ | ✓ | ✓ |

#### Crouch / Deep Squat

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| spine | [14°,0,0] | X:[-15,+30] | ✓ (near max) |
| spine1 | [10°,0,0] | X:[-30,+30] | ✓ |
| rightupleg | [75°,0,-10°] | X:[-120,+120] | ✓ |
| leftupleg | [75°,0,+10°] | ✓ | ✓ |
| both legs | -110° | [-150,0] | ✓ |
| both feet | [18°,0,0] | [-45,+45] | ✓ |
| both arms | [50°,0,±40°] | ✓ | ✓ |
| both forearms | 30° | [0,+145] | ✓ |

#### Galileo Thinking Pose

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| head | [10°,-10°,5°] | X:[-30,+30], Y:[-50,+50], Z:[-30,+30] | ✓ |
| spine | [8°,0,0] | X:[-15,+30] | ✓ |
| spine1 | [4°,0,0] | X:[-30,+30] | ✓ |
| rightarm | [15°,0,-50°] | ✓ | ✓ |
| rightforearm | 120° | [0,+145] | ✓ (near max) |
| Finger curl: thumb ~35-50°, index ~30-40°, middle ~45-60°, ring ~55-70°, pinky ~65-80° | All | [0,+100] | ✓ |
| leftarm | [65°,0,0] | ✓ | ✓ |

#### Boxing: Left Jab

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| leftarm | [-5°, 0°, 80°] | Z:[-90,+90] | ✓ (near max) |
| leftforearm | 10° | [0,+145] | ✓ |
| rightarm | [25°, 0°, 50°] | ✓ | ✓ |
| rightforearm | 100° | [0,+145] | ✓ |
| spine | [5°, 0°, -10°] | ✓ | ✓ |
| head | [5°, 0°, -10°] | ✓ | ✓ |
| rightupleg | [10°, 0°, -5°] | ✓ | ✓ |
| leftupleg | [-5°, 0°, 5°] | ✓ | ✓ |

#### Boxing: Right Cross — Mirror of Left Jab, all within limits ✓

#### Superhero Landing

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| spine | [14°,0,0] | X:[-15,+30] | ✓ (near max) |
| spine1 | [14°,0,0] | X:[-30,+30] | ✓ |
| head | [-20°,0,0] | X:[-30,+30] | ✓ |
| rightarm | [40°,0,-60°] | ✓ | ✓ |
| leftarm | [10°,0,-45°] | ✓ | ✓ |
| rightupleg | [80°,0,-10°] | X:[-120,+120] | ✓ |
| rightleg | -130° | [-150,0] | ✓ (near max) |
| leftupleg | [-10°,0,10°] | ✓ | ✓ |
| leftleg | -30° | [-150,0] | ✓ |

#### Sprint Start

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| spine | [14°,0,0] | X:[-15,+30] | ✓ (near max) |
| spine1 | [10°,0,0] | X:[-30,+30] | ✓ |
| head | [-10°,0,0] | X:[-30,+30] | ✓ |
| rightarm | [0,0,-55°] | ✓ | ✓ |
| rightforearm | 75° | [0,+145] | ✓ |
| leftarm | [10°,0,50°] | ✓ | ✓ |
| rightupleg | [50°,0,0] | ✓ | ✓ |
| rightleg | -40° | [-150,0] | ✓ |
| leftupleg | [-20°,0,0] | ✓ | ✓ |
| leftleg | -60° | [-150,0] | ✓ |

#### Free Fall

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| spine | [-14°,0,0] | X:[-15,+30] | ✓ (near min) |
| spine1 | [-10°,0,0] | X:[-30,+30] | ✓ |
| head | [25°,0,0] | X:[-30,+30] | ✓ |
| rightarm | [-75°,0,-40°] | ✓ | ✓ |
| rightforearm | 45° | [0,+145] | ✓ |
| leftarm | [-75°,0,+40°] | ✓ | ✓ |
| rightupleg | [20°,0,-10°] | ✓ | ✓ |
| rightleg | -20° | [-150,0] | ✓ |
| rightfoot | [-20°,0,0] | [-45,+45] | ✓ |

#### Yoga: Tree Pose

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| leftupleg | [80°, 0°, 45°] | X:[-120,+120], Z:[-120,+120] | ✓ |
| leftleg | -100° | [-150,0] | ✓ |
| rightarm | [-130°,0,0] | X:[-135,+135] | ✓ (near max) |
| leftarm | [-130°,0,0] | X:[-135,+135] | ✓ (near max) |

#### Tippy Toes

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| both feet | [-30°,0,0] | [-45,+45] | ✓ |
| both arms | [-55°,0,±18°] | X:[-135,+135] | ✓ |

#### Stumble

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| spine | [-8°,-12°,-8°] | X:[-15,+30], Y:[-30,+30], Z:[-30,+30] | ✓ |
| spine1 | [-4°,-8°,-4°] | X:[-30,+30], Y:[-30,+30] | ✓ |
| head | [18°,18°,0] | X:[-30,+30], Y:[-50,+50] | ✓ |
| rightarm | [-50°,0,-30°] | ✓ | ✓ |
| leftarm | [-30°,0,-35°] | ✓ | ✓ |
| leftupleg | [20°,0,5°] | ✓ | ✓ |
| leftleg | -30° | [-150,0] | ✓ |

#### Sneeze

| Bone | Value | Constraint | Status |
|------|-------|-----------|--------|
| **head** | **[45°,0,0]** | X:[-30,+30] | **EXCEEDS by +15°** |
| spine | [14°,0,0] | X:[-15,+30] | ✓ |
| spine1 | [14°,0,0] | X:[-30,+30] | ✓ |
| both arms | [40°,0,±40°] | ✓ | ✓ |
| both forearms | 90° | [0,+145] | ✓ |

**Issue**: Head X +45° for a sneeze pose exceeds the ±30° constraint. The angle will be clamped to 30°. Human head can flex forward 45-50°, so the rig constraint is conservative here. Sneeze forward pitch at 45° is anatomically reasonable.

---

### 3.7 Sequence Coordinates

#### Walk Cycle: 1 Full Stride (5 frames, 1000ms)

| Frame (ms) | Key Joints | Values | Status |
|------------|-----------|--------|--------|
| 0 | Neutral stance | All 0 / arms at 75° | ✓ |
| 250 | Right upleg +25°, right leg -25° | Within | ✓ |
| | Left upleg -5° | Within | ✓ |
| | Arms mild swing ±30° | Within | ✓ |
| 500 | Right upleg +5°, leg -5° | Within | ✓ |
| | Left upleg -15°, leg -25° | Within | ✓ |
| 750 | Right upleg -10°, leg -15° | Within | ✓ |
| | Left upleg +30°, leg -30° | Within | ✓ |
| | Arms swing opposite ±30° | Within | ✓ |
| 1000 | Return to neutral (frame 0) | ✓ | ✓ |

All walk cycle coordinates well within limits. Maximum knee bend -30° (very conservative for gait — could go to -60° for more natural stride).

#### Run Cycle: Full Stride + Airborne (3 frames, 400ms)

| Frame (ms) | Key Joints | Values | Status |
|------------|-----------|--------|--------|
| 0 | Right upleg -20°, leg -30° | ✓ | ✓ |
| | Left upleg +60°, leg -40° | ✓ | ✓ |
| | Arms: R [-10°,0,20°], L [0,0,-60°] | ✓ | ✓ |
| 200 | Right upleg +40°, leg -40° | ✓ | ✓ |
| | Left upleg +30°, leg -30° | ✓ | ✓ |
| 400 | Right upleg +60°, leg -40° | ✓ | ✓ |
| | Left upleg -20°, leg -30° | ✓ | ✓ |

Run cycle max knee -40° ✓, max hip +60° ✓, max arm swing -60° ✓.

#### Run → Jump Transition (3 frames, 400ms)

All coordinates within limits. Max knee -40°, max hip +30°. ✓

#### Squat → Stand (3 frames, 700ms)

| Frame (ms) | Key Joints | Values | Status |
|------------|-----------|--------|--------|
| 0 | Knees -120° | [-150,0] | ✓ (near max) |
| | Hips +75° | [-120,+120] | ✓ |
| | Feet +18° | [-45,+45] | ✓ |
| 350 | Knees -60° | ✓ | ✓ |
| 700 | All neutral (0) | ✓ | ✓ |

#### Finger Wiggle: Right Hand Sequential (7 frames, 1100ms)

Each finger at 75°/85°/60° when active, 0° when passive. All within [0°,100°]. ✓

#### Piano: C-E-G-C Scale (6 frames, 580ms)

Active finger segments at 55°/65°/45°, inactive at 12°/12°/8°. All within [0°,100°]. ✓

---

## 4. Issues Found

### 4.1 Poses Exceeding Rig Constraints (3 poses)

| Pose | Joint | Target | Constraint | Clamped To | Notes |
|------|-------|--------|-----------|------------|-------|
| Head Turn Right | head Z (index 2) | -35° | [-30°, +30°] | -30° | Loss of 5° rotation |
| Head Turn Left | head Z (index 2) | +35° | [-30°, +30°] | +30° | Loss of 5° rotation |
| Sneeze | head X (index 0) | +45° | [-30°, +30°] | +30° | Loss of 15° forward pitch |

### 4.2 Poses AT Constraint Limits (borderline, will work but no safety margin)

| Pose | Joint | Value | Max | Notes |
|------|-------|-------|-----|-------|
| Head: Nod Forward | head X | +30° | +30° | No safety margin |
| Right Arm Swing Forward | rightarm Z | -90° | -90° | No safety margin |
| Left Arm Swing Forward | leftarm Z | +90° | +90° | No safety margin |
| Spine Forward Lean | spine X | +14° | +30° (max) but +15° min for backward | Forward OK |
| Free Fall spine | spine X | -14° | -15° (min) | Only 1° safety margin |
| Superhero rightleg | rightleg | -130° | -150° (max neg) | 20° margin, OK |
| Arms Overhead | both arms | -90° | -135° (min X) | 45° margin, fine |
| Yoga arms overhead | both arms | -130° | -135° (min X) | Only 5° safety margin |
| Arms Crossed forearms | forearms | 120° | +145° (max) | 25° margin |
| Galileo forearm | rightforearm | 120° | +145° | 25° margin |

### 4.3 Rig Constraints Tighter Than Human Anatomy

These are not pose bugs but limit bugs — the constraints clamp angles that humans can naturally achieve:

| Joint | Axis | Rig Limit | Human Norm | Gap | Impact |
|-------|------|----------|------------|-----|--------|
| Head Z | Yaw/Turn | ±30° | ±70-80° | **-40°** | Severe — most head turns clamped |
| Head X | Pitch | ±30° | ±45-60° | **-15 to -30°** | Moderate — sneeze pose clamped |
| Spine X (spine) | Back ext. | -15° (min) | -30 to -45° | **-15 to -30°** | Tight for back arches |
| Neck X | Pitch | ±45° | ±45-50° | 0-5° | Nearly OK |
| Shoulder X | Abd/Add | ±135° | ±180° | -45° for overhead | Conservative but safe |

**Recommendation for head constraints**: Increase head Z from ±30° to ±45° (or ±50° to match head Y). Increase head X from ±30° to ±45°. This would make sneeze and head-turn poses fully functional.

### 4.4 Tendon Synergy Rule Compliance

All poses with finger segment 2 or 3 include segment 1 at > 0°, so no `tendon_synergy_violation` rejections will occur. ✓

The one edge case: `FIST_LEFT/RIGHT` has segment 1 at 75° for all fingers, so segments 2 and 3 pass the synergy check. Fist thumb3 at 55° passes because thumb2 at 80° > 0. ✓

### 4.5 Spinal Segment Coupling Note

Spine poses always set `spine` and `spine1` together. The `spine2` is sometimes omitted (e.g., Forward Lean). This is not a violation but means `spine2` stays at its last target or bind pose. For consistent motion, all three spine segments should be specified when the goal is a full-spine pose.

**Affected poses**:
- Spine: Tilt Right/Left — only sets spine + spine1, omits spine2
- Spine: Twist — only spine + spine1
- Most composite poses set spine + spine1 but rarely spine2

---

## 5. Recommendations

### Immediate (pose corrections)
1. **Head Turn poses**: Change Z from ±35° to ±30° to stay within head constraint, OR increase head Z constraint to ±45°
2. **Sneeze head X**: Change from 45° to 30° to stay within constraint, OR increase head X constraint to ±45°
3. **Head Nod Forward**: Already at +30° max — fine, but no headroom

### Medium-term (rig constraint adjustments)
1. Increase head Z constraint from ±30° to ±45° to support natural head rotation
2. Increase head X constraint from ±30° to ±45° to support sneezing/looking-down poses  
3. Increase spine X min constraint from -15° to -25° for better back arch support
4. Consider increasing arm X max from ±135° to ±150° for more expressive overhead poses

### Hygiene
1. Add spine2 to all multi-spine poses for consistency
2. Add `console.warn()` output in `sendPose()` to display clamping notes when angles exceed limits

---

## 6. Complete Bone-to-Pose Index

For quick reference, all bones referenced in diagnostic poses and their range of values across all poses:

| Bone | Min Value | Max Value | Rig Range | Over Range? |
|------|-----------|-----------|-----------|-------------|
| head X | -20° (Free Fall/Superhero) | +45° (Sneeze) | [-30°,+30°] | **Sneeze +45° over** |
| head Y | -20° (Tilt R/Galileo) | +18° (Stumble) | [-50°,+50°] | No |
| head Z | -35° (Turn R) | +35° (Turn L) | [-30°,+30°] | **Both ±35° over** |
| neck Z | via cervical coupling only | – | – | Auto-injected |
| spine X | -14° (Free Fall) | +14° (many) | [-15°,+30°] | No |
| spine Y | -15° (Tilt R) | +15° (Tilt L) | [-30°,+30°] | No |
| spine Z | -20° (Twist R) | +20° (Twist L) | [-30°,+30°] | No |
| spine1 X | -10° (Free Fall) | +14° (several) | [-30°,+30°] | No |
| spine2 X | – | +10° (Lean) | [-30°,+30°] | No |
| rightarm X | -130° (Yoga) | +75° (At side) | [-135°,+135°] | No |
| rightarm Z | -90° (Swing Fwd) | +45° (Swing Bk) | [-90°,+90°] | AT MAX |
| leftarm Z | -45° (Landing) | +90° (Swing Fwd) | [-90°,+90°] | AT MAX |
| rightforearm | 5° (Reach) | 135° (Elbow) | [0°,+145°] | No |
| leftforearm | 5° | 120° (Crossed) | [0°,+145°] | No |
| rightupleg X | -20° (Sprint) | +80° (Landing/Tree) | [-120°,+120°] | No |
| rightleg | -130° (Landing) | 0° | [-150°,0°] | No |
| leftleg | -120° (Squat) | 0° | [-150°,0°] | No |
| rightfoot X | -30° (Tippy Toes) | +20° (Dorsi) | [-45°,+45°] | No |
| leftfoot X | -30° | +20° | [-45°,+45°] | No |
| Finger segments | 0° | 75-90° (fist/piano) | [0°,+100°] | No |
| Thumb segments | 0° | 80° (fist) | [0°,+100°] | No |

---

## 7. Suggested Reading Order

For a developer investigating these issues:
1. **`DIAGNOSTIC_POSES_GUIDE.md`** — Axis conventions, sign rules, and coordinate mapping
2. **`src/constants/rigConstraints.ts`** — The ground truth for what gets clamped
3. **`src/constants/anatomicalLimits.ts`** — Secondary clamp layer and human anatomy norms
4. **`src/world/engine/HumanoidPhysicsBinder.ts`** (method `validateAndApplyTimeline`) — Where clamping actually happens
5. **`src/world/engine/MJCFHumanoidTemplate.ts`** (method `buildBodyTreeXML`) — Joint decomposition and actuator mapping

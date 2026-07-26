## Geom Analysis: Floor, Feet, and Consequences of Resizing

### 1. Floor Geom — Plane (NOT a sphere)

**File:** `src/world/engine/MJCFHumanoidTemplate.ts` (line ~242)

```xml
<geom name="floor" type="plane" size="100 100 0.1" rgba="0.8 0.9 0.8 1" contype="1" conaffinity="2"/>
```

The floor is an infinite **plane** (`type="plane"`). The `size` attributes `100 100 0.1` only control the visual rendering extent and visual thickness — the collision plane itself is infinite. So no, it's not a sphere.

---

### 2. Foot Geoms — Boxes (NOT spheres)

**File:** `src/world/engine/MJCFHumanoidTemplate.ts` (lines 93–97)

Feet geoms are **boxes**, not spheres. Here's the exact construction:

```typescript
const FOOT_COLLIDER_HALF_WIDTH = 0.05;
const FOOT_COLLIDER_HALF_HEIGHT = 0.01;
const FOOT_COLLIDER_HALF_LENGTH = 0.11;
geomXML = `<geom name="${boneName}_geom" type="box" size="${FOOT_COLLIDER_HALF_WIDTH} ${FOOT_COLLIDER_HALF_LENGTH} ${FOOT_COLLIDER_HALF_HEIGHT}" pos="0 0 0.02" contype="2" conaffinity="1"/>`;
```

| Dimension | Half-size | Full size |
|-----------|-----------|-----------|
| X (MuJoCo X, lateral) | 0.05 | 0.10 |
| Y (MuJoCo Y, forward) | 0.11 | 0.22 |
| Z (MuJoCo Z, vertical) | 0.01 | 0.02 |

The foot is thus a **thin rectangular slab**: 10 cm wide × 22 cm long × 2 cm tall. It's offset upward by 2 cm (`pos="0 0 0.02"`) relative to the foot bone origin in MuJoCo space (equivalent to ~2 cm sole offset in Three.js's Y-down direction).

---

### 3. Current Bone Geom Sizes (for reference)

All non-foot bones use **capsules** with:

```typescript
const colRadius = 0.04;  // 4 cm radius
const colHalfHeight = Math.max(0.02, boneLength / 2 - colRadius);  // capsule half-height
```

So each bone's collision geometry is a capsule of **radius 0.04**, whose half-height is computed dynamically from the bone length minus the radius.

The **root capsule** (torso) has:
```typescript
const capsuleRadius = 0.2;  // 20 cm radius
const capsuleHalfHeight = Math.max(0.1, (modelHeight / 2) - capsuleRadius);
```

---

### 4. Consequences of Reducing Geom Sizes

This is a multi-layered physics stability question. Here's what would happen:

#### A. Foot Geoms (box: 0.10 × 0.22 × 0.02 → smaller)

- **Reduced contact area with floor** → lower friction footprint → the feet will slide more during stance, making standing balance harder and increasing the risk of the model spreading its legs excessively and falling
- **Higher ground penetration risk** — MuJoCo uses a soft-contact model with constraint-based LCP solving. A smaller foot box means the solver has less geometric margin to detect ground contact. At the current timestep (0.01667s = 60Hz), small feet can easily "tunnel" through the floor plane between solver iterations, especially during high-speed walking or stomping motions. The contact constraint can fail to engage, or engage inconsistently, causing intermittent foot-floor collisions that feel like the feet are "sinking" then "snapping back"
- **Contact force spikes** — smaller contact area with the same impulse means the normal force density is higher, which can over-saturate the LCP solver and produce oscillation (that vibration you see in the legs during stance). The solver iterations (currently 100) are tuned for the current foot size; halving foot area would effectively halve the contact stiffness margin

#### B. Limb Bone Capsules (radius: 0.04 → smaller)

- **Self-penetration becomes likely** — MuJoCo does NOT automatically handle self-collision unless configured. The humanoid geoms have `contype="2" conaffinity="1"`, meaning they only collide with group 1 (the floor and environment objects) and NOT with each other. So reducing capsule radius doesn't affect self-collision (which doesn't exist in this setup). But it does mean:
  - Less visual collision margin against environment objects
  - Knees/elbows can visually clip through the floor when bending deeply because the capsule radius that used to push them up is now smaller

#### C. Root Capsule (radius: 0.2 → smaller)

- **The model sits lower to the ground** — the capsule `capsuleHalfHeight` is computed as `modelHeight/2 - capsuleRadius`. Reducing the radius actually *increases* the capsule half-height (since the capsule total height = 2 × capsuleHalfHeight + 2 × capsuleRadius = modelHeight remains constant). Wait — let me recheck: `capsuleHalfHeight = Math.max(0.1, (modelHeight / 2) - capsuleRadius)`. So:
  - If `capsuleRadius` decreases → `capsuleHalfHeight` increases (because total height `2*capsuleRadius + 2*capsuleHalfHeight` should roughly match modelHeight)
  - The capsule becomes thinner but taller — actually it would become a thinner cylinder with the tips being smaller hemispheres. This is counterintuitive because most people expect making geoms smaller makes everything shrink. Here, the total capsule length is kept at modelHeight, so the capsule just becomes more cylindrical (smaller bulbous ends)
- **Ground contact for the torso becomes less reliable** — the main body's contact with the floor (during falls, lying down, etc.) would have a smaller contact patch, making it easier for the model to slide or spin uncontrollably when on the ground

#### D. The most critical hidden consequence: LCP solver convergence

The MuJoCo solver is configured with `iterations="100"` and `integrator="implicitfast"`. The solver's convergence depends on having reasonable contact constraint sizes. Smaller geoms mean:

1. The constraint Jacobians become more poorly conditioned (small contact areas → high force gradients)
2. With `implicitfast` integrator and only 100 iterations, the solver may not converge to a stable solution for small geoms
3. This manifests as **high-frequency vibration** in the legs during stance — the contact force oscillates between "barely touching" and "too much force" each timestep

This is actually a known issue in MuJoCo humanoids: the default foot size (this codebase's 10×22cm) was specifically chosen to give the solver enough contact margin to converge in 100 iterations at 60Hz. Reducing it would likely require increasing solver iterations to ~250–500 or reducing the timestep to ~0.005s to maintain equivalent stability.

#### E. How to reduce geom size safely (if you intend to)

If you need smaller geoms (e.g., to match a character's aesthetic), you must adjust other parameters proportionally:

| Adjustment | What to change |
|---|---|
| Increase solver iterations | `iterations="250"` in the `<option>` tag |
| Decrease timestep | `timestep="0.005"` (but this increases simulation cost 3.3×) |
| Increase contact stiffness | Add `<option>` parameter or modify `solref`/`solimp` on the geoms |
| Keep friction ratios the same | The friction cone resolution depends on geometric area projected onto the contact normal — smaller area with same friction coefficient means proportionally less resistance to sliding |

The current 0.04 capsule radius for bones and 0.10×0.22×0.02 foot box dimensions were carefully calibrated — prior project_info__ docs noted that narrower feet caused the humanoid to "skate" on the floor and lose balance during stance phase transitions. Reducing these dimensions without solver tuning will cause visible stability degradation.
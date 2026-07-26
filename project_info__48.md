# Foot Geometry System — Complete Analysis

## Where the Foot Geoms Are Defined

**File**: `src/world/engine/MJCFHumanoidTemplate.ts` — lines ~188–196

This is the single location where foot colliders are created. The MJCF generator builds XML bodies recursively, and there's an `isFoot` special case that diverges from the default capsule shape used for all other bones.

### Current Foot Geom (Box)

```typescript
const isFoot = boneName.includes('foot');
if (isFoot) {
  const FOOT_COLLIDER_HALF_WIDTH = 0.05;   // 10cm lateral (side-to-side)
  const FOOT_COLLIDER_HALF_HEIGHT = 0.01;   // 2cm vertical thickness
  const FOOT_COLLIDER_HALF_LENGTH = 0.11;   // 22cm forward-backward
  geomXML = `<geom name="${boneName}_geom" type="box"
               size="${FOOT_COLLIDER_HALF_WIDTH} ${FOOT_COLLIDER_HALF_LENGTH} ${FOOT_COLLIDER_HALF_HEIGHT}"
               pos="0 0 0.02" contype="2" conaffinity="1"/>`;
}
```

**What this means in MuJoCo coordinates:**
- X-axis (lateral/medial): 0.05 half → **10cm total width** (about right for a foot)
- Y-axis (anterior/posterior): 0.11 half → **22cm total foot length** (reasonable shoe size ~US 9-10)
- Z-axis (vertical): 0.01 half → **only 2cm thick** — a very thin "slab" representing the sole
- Position offset: `0 0 0.02` → shifted 2cm downward in MuJoCo Z (from Three.js Y) — this puts the sole at the bottom of the foot

**All other bones get capsule geoms** (cylindrical with hemispherical caps), estimated from bone length and a fixed 0.04 radius.

### Which Bones Have Foot Geoms

The bones are defined in `BONE_JOINT_TYPE` at the top of the same file (lines 15-34):

```typescript
'mixamorigleftfoot': 'spherical',
'mixamorigrightfoot': 'spherical',
```

These are the **only** foot bones that get physics bodies/geoms. The `_toebase` bones (e.g., `mixamoriglefttoebase`) are **not** in `BONE_JOINT_TYPE`, so they have no physics representation — they are purely visual skeleton bones driven by the visual sync pass.

---

## Collision Properties (Answer: Yes, Geoms Are Impermeable)

Yes, geoms are the collision shapes in MuJoCo. They are **impermeable** — the physics solver enforces non-penetration constraints between them, generating contact forces to push them apart.

**Current collision filtering:**

```xml
contype="2" conaffinity="1"
```

- `contype="2"` — Foot geoms belong to collision group 2 (bit 1)
- `conaffinity="1"` — Foot geoms collide with group 1 (bit 0)
- The **floor** has: `contype="1" conaffinity="2"` (belongs to group 1, collides with group 2)
- Result: **Feet collide with the floor but NOT with each other** (both feet are group 2, and their conaffinity doesn't include group 2)
- The **root capsule** also has `contype="2" conaffinity="1"` — same collision group as feet, so capsule and feet also don't collide with each other

---

## The Body Tree Structure

In the generated MJCF XML, the physics hierarchy is:

```
root_capsule (free joint + capsule geom, mass 70kg)
├── mixamorigspine (spherical joint) → spine1 → spine2 → neck → head + arms
├── mixamorigleftupleg (spherical joint - hip)
│   └── mixamorigleftleg (revolute joint - knee, 1 DOF)
│       └── mixamorigleftfoot (spherical joint - ankle) ← FOOT BOX GEOM HERE
└── mixamorigrightupleg (spherical joint - hip)
    └── mixamorigrightleg (revolute joint - knee, 1 DOF)
        └── mixamorigrightfoot (spherical joint - ankle) ← FOOT BOX GEOM HERE
```

**Key:** The foot bone's parent is the `leg` (shin) bone, connected at the ankle joint. The foot geom is positioned *relative to the foot body's local frame*, which itself is positioned relative to the leg body via the joint transform.

---

## Where the Foot Physics Data Lives

**Anatomical limits** (`src/constants/anatomicalLimits.ts`, ~line 56):
```typescript
if (n.includes('ankle') || n.includes('foot')) {
    return { min: -45° , max: 45° };
}
```

**Mass and inertia** (`src/constants/physics.ts`, ~line 109):
```typescript
"mixamorigleftfoot": { mass: 1.1 kg, principalInertia: { x: 0.010, y: 0.005, z: 0.010 } },
```

**Kinematic ground reaction force system** (`HumanoidPhysicsBinder.ts`, ~line 420+):
The `applyKinematicGroundReactionForces()` method reads contact forces for `mixamorigleftfoot` and `mixamorigrightfoot` from the `ContactForceRegistry` to:
1. Detect foot-floor contact
2. Compute lateral push forces (forward/backward) from contact normals
3. Apply velocity impulses to the capsule body for locomotion response

---

## What Would Changing the Foot Geoms Mean?

### Option A: Reduce the Box Size

Changing `FOOT_COLLIDER_HALF_*` to smaller values would make the contact region smaller — reducing the "platform" area for standing. With a very small box, the foot would still provide a flat support surface but would be less stable (the capsule balance controller would need to work harder).

### Option B: Make It Spherical

```xml
<geom type="sphere" size="0.04" ... />
```

A sphere **cannot maintain a stable standing pose** — it rolls. The humanoid's balance relies on the flat box providing a moment arm against tilting. With a sphere at the ankle/foot:
- The foot would be a ball joint directly contacting the floor
- Any slight tilt of the capsule would cause the foot to roll, not provide restoring torque
- The current `MotorController.applyCapsuleBalance()` upright correction would have to do ALL the work with no mechanical advantage from the foot base
- The center of pressure would coincide with the contact point (a sphere contacts at one point), making the KGRF lateral force system even more critical

If you **did** want spherical feet as a design choice (e.g., for a different character type like a bipedal robot with rounded feet, or a stylized character), you'd need to:
1. Change the geom type + size in the `isFoot` branch
2. Potentially tune the KGRF system to handle the different contact behavior
3. The foot joint could remain spherical (3 DOF) since the ankle still articulates

### Option C: Move Foot Geom to Ankle/Mid-Foot Joint

Currently the foot box is positioned at the foot body's origin (`pos="0 0 0.02"`), which is the ankle joint position. The ankle joint is a spherical joint (yaw, pitch, roll) that moves the entire foot relative to the shin.

If you wanted the **collision point** at the mid-foot center (closer to the arch), you'd change the `pos` parameter:
```xml
pos="0 0.03 0.02"   -- shift forward 3cm in MuJoCo Y (toward toes)
```
or move it to a completely different body. But the foot geom is always relative to its parent body (the foot bone) — it can't be parented to a different joint without restructuring the body tree.

### Option D: Eliminate the Foot Geom Entirely

Remove the `isFoot` branch so feet get the default capsule like other bones. This means:
- The foot becomes a capsule aligned along the bone's Z-axis (like all other bones)
- The capsule radius (0.04) and half-height (bone_length/2 - radius) would be very short for a foot
- The foot capsule would contact the floor as a small cylindrical cap — much less stable than the current box
- The KGRF system still reads contacts via the geom handle, so it would still work

---

## Recommendation for Your Goal

If you want to **reduce foot geom size to make balance harder / more realistic**:

1. **In `MJCFHumanoidTemplate.ts`** (the `isFoot` branch, line 188-196):
   - Reduce `FOOT_COLLIDER_HALF_WIDTH` to 0.03 (6cm)
   - Reduce `FOOT_COLLIDER_HALF_LENGTH` to 0.06 (12cm)  
   - Keep `FOOT_COLLIDER_HALF_HEIGHT` at 0.01 (still thin)
   - OR switch to a sphere: `type="sphere" size="0.04"` — but you'll need a completely different balance strategy

2. **Check the geom origin**: If you move it, change the `pos="0 0 0.02"` offset. The current offset of 0.02 in MuJoCo Z (from Three.js Y) places the sole just below the foot bone origin. Moving this higher would make the contact point closer to the ankle.

3. **Important**: After editing, the `startFootGroundDistance` debug script (`src/debug/footGroundDistance.ts`) uses the MuJoCo body position + offset to compute floor gap. It reads:
   ```typescript
   const FOOT_HALF_HEIGHT = 0.01;
   const FOOT_OFFSET_Z = 0.02;
   ```
   These are hardcoded constants matching the MJCF generation — they must be updated to match any changes in the foot geom.

**To answer directly:**
- **Yes, geoms are impermeable** — they generate contact forces to prevent interpenetration
- **Foot geoms are currently thin boxes (10cm × 22cm × 2cm)** positioned at the ankle joint with a 2cm downward offset
- **Making them spherical** would cause rolling contact at a single point — fundamentally changing the ground interaction physics (the balance system would need major rework)
- **The foot joint type is spherical** (3 DOF: yaw, pitch, roll at the ankle), which is separate from the geom shape
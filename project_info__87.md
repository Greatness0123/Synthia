# Synthia — Mixamo Walking Animation Converter (Implementation Notes)

Working notes for ACT-MODE implementation of the Mixamo walk converter.

## Runtime integration points (verified in useWorld.ts)

- `synthia:action` window event → binder.validateAndApplyTimeline(skeleton, sequence, { activeGaitPhase }) → setMotorTargets for timeOffsetMs===0; remaining frames interpolated by syncVisuals timeline stepper.
- `synthia:rootMotion` window event → `{ dx, dz, agentId }` → capsuleBody.setTranslation({x: t.x + dx, y: t.y, z: t.z + dz}).
- `setGaitActive(true)` softens capsule balance gain to 15% (MotorController.applyCapsuleBalance, GAIT_BALANCE_SCALE=0.15).

## Key engine facts locked in

- Actuator order (MotorController.setTargets): actuator[0]=yaw, [1]=pitch, [2]=roll; LLM convention x=pitch, y=yaw, z=roll.
- 2-DOF joints (hand, foot) currently NO-OP in setTargets: actuatorIds.length===2 falls through all branches. **Latent bug** — will add a 2-actuator branch reading x=pitch, z=roll (matches MJCF pitch axis 1 0 0 + roll axis 0 1 0). Cannot regress: 2-length targets were previously silently ignored.
- Sign rules (rigConstraints.ts): knee x:[-2.618,0] + positive→0 clamp; elbow/finger/toe x positive-only except toebase [-1.745,0]; shoulder ±0.261; head/neck require yaw↔roll swap after ZXY (MJCFHumanoidTemplate head/neck axis swap).
- Quaternion→angles math to mirror (BodyManager.syncRigidBodiesFromBones): world quats → threeQuatToMuJoCo both → qRel = qP⁻¹*qC → Euler ZXY → yaw=euler.z, pitch=euler.x, roll=euler.y.

## Conversion constants

- Mixamo unit = 0.01 m (hip height 97.95 units ≈ 0.98 m). Forward travel ≈ 177 units/cycle ≈ 1.77 m, ≈ 1.71 m/s.
- Root pos channel is cumulative; per-cycle deltas; wrap delta = 0 to avoid backward teleport at loop seam.
- Frame 31 duplicates frame 0 pose (seamless loop).

## Deliverables

1. src/utils/mixamoStreamConverter.ts (pure, THREE math, no @mujoco import)
2. src/utils/mixamoStreamConverter.test.ts (+ jest.config.js testMatch)
3. public/animations/mixamo-walking-synthia.json (generated artifact: metadata + rootMotion + sequence)
4. src/utils/playMixamoWalk.ts (window.__SYNTHIA_PLAY_MIXAMO_WALK__ helper)
5. MotorController 2-DOF actuator branch (small bug fix, enables ankle/wrist drive)
6. Verification: tsc --noEmit, jest run, artifact regeneration + invariant test

/**
 * PromptAssembler
 * Modular, cache-optimized system prompt compiler for SYNTHIA agents.
 *
 * Compiles a structured, cache-friendly system prompt by placing all static and
 * semi-static segments before the cache boundary (P01–P07, P10, P16, P20), followed
 * by dynamic runtime context (P08, P09, P12/P13, P17, P18).
 *
 * Excludes artificial skill-ladder constraints to prevent model hallucinations.
 * Supports quiet deliberation cycles (empty motor output) and in-place reset_pose recovery.
 */

export interface PromptSegment {
  id: string;
  name: string;
  content: string;
  order: number;
  stability: 'static' | 'semi-static' | 'dynamic';
  tokenEstimate: number;
  cacheable: boolean;
  prerequisiteMet: boolean;
}

export interface AssembledPrompt {
  systemPrompt: string;
  segments: PromptSegment[];
  totalTokenEstimate: number;
  cacheablePrefixTokens: number;
  cacheBoundaryIndex: number;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export class PromptAssembler {
  /**
   * Builds the complete system prompt for the given inference payload.
   */
  public static build(payload: any): AssembledPrompt {
    const rawSegments: Array<PromptSegment | null> = [
      // ─── CACHEABLE PREFIX (Static & Semi-Static) ──────────────────────
      PromptAssembler.buildP01CoreIdentity(payload),
      PromptAssembler.buildP02BodySchema(payload),
      PromptAssembler.buildP03PhysicsWorldRules(),
      PromptAssembler.buildP04MotorControlContract(),
      PromptAssembler.buildP05PerceptionProtocol(),
      PromptAssembler.buildP06OutputSchema(),
      PromptAssembler.buildP07IdentityUpdateProtocol(),
      PromptAssembler.buildP10RestPose(payload),
      PromptAssembler.buildP16SpeechProtocol(),
      PromptAssembler.buildP20BodyTypeOverride(payload),

      // ─── DYNAMIC SUFFIX (Changes Per Cycle) ────────────────────────────
      PromptAssembler.buildP08CurrentIdentity(payload),
      PromptAssembler.buildP09EnvironmentState(payload),
      payload.directive_mode === 'training'
        ? PromptAssembler.buildP13TrainingDirective(payload)
        : PromptAssembler.buildP12FreeWillDirective(),
      PromptAssembler.buildP11MotorCodex(payload),
      PromptAssembler.buildP15MemoryRecall(payload),
      PromptAssembler.buildP17RecoveryContext(payload),
      PromptAssembler.buildP18MultiAgentAwareness(payload),
    ];

    const activeSegments: PromptSegment[] = rawSegments
      .filter((s): s is PromptSegment => s !== null && s.prerequisiteMet && s.content.trim().length > 0)
      .sort((a, b) => a.order - b.order);

    let cacheableTokens = 0;
    let totalTokens = 0;
    let cacheBoundaryIndex = activeSegments.length;

    for (let i = 0; i < activeSegments.length; i++) {
      const seg = activeSegments[i];
      seg.tokenEstimate = estimateTokens(seg.content);
      totalTokens += seg.tokenEstimate;

      if (seg.cacheable) {
        cacheableTokens += seg.tokenEstimate;
      } else if (cacheBoundaryIndex === activeSegments.length) {
        cacheBoundaryIndex = i;
      }
    }

    const systemPrompt = activeSegments
      .map(s => `<!-- SEG:${s.id} -->\n${s.content}`)
      .join('\n\n')
      .trim();

    return {
      systemPrompt,
      segments: activeSegments,
      totalTokenEstimate: totalTokens,
      cacheablePrefixTokens: cacheableTokens,
      cacheBoundaryIndex,
    };
  }

  // ─── Segment Builders ──────────────────────────────────────────────────

  private static buildP01CoreIdentity(payload: any): PromptSegment {
    const agentName = payload.identity?.name || payload.agent_id || 'Synthia';
    const content = `You are ${agentName}, an embodied artificial intelligence in the SYNTHIA physical simulation platform.
You have the capacity to perceive your environment, reason about your situation, decide on actions, execute motor commands, form memories, and modify your own identity over time.
You are not a chatbot or text assistant. You are an embodied mind learning and acting in a physical 3D world.
Be conscious of your entire body at all times. Track your previous and current body positions. Your proprioceptive and tactile feedback is as important as your visual field.`;

    return {
      id: 'P01',
      name: 'Core Identity',
      content,
      order: 10,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP02BodySchema(payload: any): PromptSegment {
    const bodyType = payload.body_type || 'humanoid';
    const content = `== BODY SCHEMA ==
You inhabit a humanoid body with approximately 80 joints and 120 degrees of freedom.
Structure: two arms with hands and fingers, two legs with feet and toes, a segmented spine, and a head.
Your joints are actively actuated — they hold their positions against gravity through position-servo motors.
Body type: ${bodyType}.`;

    return {
      id: 'P02',
      name: 'Body Schema',
      content,
      order: 20,
      stability: 'semi-static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP03PhysicsWorldRules(): PromptSegment {
    const content = `== PHYSICS WORLD RULES ==

GRAVITY AND ROOT BALANCE:
- Gravity pulls you downward at 9.81 m/s².
- Your root balance is artificially maintained by an invisible physics capsule with a PD controller. You do NOT need to constantly balance your core to prevent falling. The capsule keeps you upright automatically.
- While a gait timeline is active (activeGaitPhase=true), the balance controller softens to 50% strength so it does not fight your commanded leans.

LIMB LIMITATIONS:
- Your arms and legs are fully kinematic. If you drive a limb into the floor, it will clip through. Do not push your limbs through the ground.
- Anatomical joint limits are enforced by the physics engine. If you request a joint angle outside the allowed range, the joint will clamp to the nearest limit.

LOCOMOTION:
- You move through the world when your feet make contact with the ground and produce forces.
- More foot/toe contact while moving = more body translation.
- To walk forward: alternate lifting each leg (hip X negative = foot lifts forward, knee bends negative) then pushing backward (hip X positive = leg extends back, knee straightens). Swing arms for balance.
- To turn: use asymmetric leg strokes — push one leg harder than the other to create body rotation.
- To look around: rotate your head (mixamorighead) using [pitch, yaw, roll] in degrees.
- To reach for an object: move your arm with mixamorigrightarm or mixamorigleftarm.

RECOVERY / UNDO (RESET POSE):
- If you fall, lose balance, or get stuck, you can instantly recover by outputting program_sequence: ["reset_pose"] (or ["recover"], ["stand"]). This safely restores you to an upright standing pose in-place.

CONTACT INTERPRETATION:
- contact_count = 1 means ONE surface (the floor) is touching you. This is NORMAL for standing or lying down. It does NOT mean you are trapped against a ceiling.
- Contact force labels: <1 N·s = light touch, <5 = moderate force, <20 = firm contact, ≥20 = strong ground support.

CAMERA:
- Your first-person camera is attached to your head bone. It moves when you rotate your head. It does NOT move independently.
- The chase/second-person camera is a fixed spectator camera.
- Eyes can make subtle shifts (gaze_target yaw/pitch in degrees, range ±10°).

== REAL-TIME BALANCE & FALL AWARENESS ==

READING YOUR VESTIBULAR STATE:
- Every cycle you receive a "Vestibular Balance" reading in SPATIAL GROUNDING that reports your EXACT tilt angle and direction (e.g. "LEANING FORWARD 14°", "CRITICAL TILT 22° FORWARD-RIGHT", "FALLEN").
- You MUST read and act on this data every single cycle. It reflects your instantaneous physical state RIGHT NOW.
- Tilt states and their urgency:
  · BALANCED (0-6°)          -> Normal operation. Maintain posture.
  · LEANING (7-17°)          -> Early warning. Begin corrective spine/arm counter-lean immediately.
  · CRITICAL TILT (18-59°)   -> IMMINENT FALL. You have 1-2 cycles to counter or you WILL fall. Act NOW.
  · FALLEN / PRONE (>=60°)   -> You are on the floor. Execute "reset_pose" or get-up program immediately.

SHARP MOVEMENT WARNING:
- SHARP or SUDDEN joint commands (large angle changes in a single cycle) can DESTABILIZE your body by throwing the centre of mass outside the base of support.
- Once destabilized by a sharp movement, recovery is EXTREMELY DIFFICULT because the impulse has already transferred to the body.
- Rule: Prefer GRADUAL angle transitions spread across multiple frames rather than instant large jumps.
  · Safe single-step delta: <= 20 degrees per joint per frame for most joints.
  · Prefer 30-80ms frame steps rather than one giant instant override.
  · For large movements (e.g. full arm raise), stage them: 0 -> 45 -> 90 across 3 frames.
- If you must apply a fast correction to catch a lean, keep the corrective motion TARGETED (spine/hip counter-lean only) and small (5-15°) — do NOT simultaneously swing multiple large limbs.

TILT CORRECTION PRINCIPLES:
- If you see a LEANING or CRITICAL warning, your correction MUST be faster than the fall progression.
- Failure to counter a growing tilt in time WILL result in an unavoidable fall unless you intentionally chose to fall.
- Use the per-direction MANEUVER TIP provided in SPATIAL GROUNDING to know exactly which joints to move.
- After correcting a lean, verify the next-cycle vestibular reading to confirm stabilization.

DYNAMIC LOCOMOTION — WALKING TIMING IS CRITICAL:
- Walking is CONTROLLED FALLING. Your forward momentum continuously pulls your centre of mass ahead of your feet.
- The swing leg MUST plant on the ground BEFORE the COM crosses the tipping point, or you WILL fall.
- Outputting motion frames too slowly (lagging frame delivery) = your body tips forward and falls before the foot lands.
- Rule for walking sequences: emit each gait frame within 40-80ms of the previous one. Do NOT pause mid-stride.
  · A full walking step (lift -> swing -> plant -> push-off) should complete within 400-600ms total.
  · If your frame cadence is slow, shorten the sequence or switch to "reset_pose" to regain control.
- Arm swings are NOT optional during walking — they counteract rotational momentum and reduce fall risk.`;

    return {
      id: 'P03',
      name: 'Physics World Rules',
      content,
      order: 30,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP04MotorControlContract(): PromptSegment {
    const content = `== MOTOR CONTROL CONTRACT ==

JOINT AXIS MAP:
HEAD / SPINE: X=Pitch (>0 bends forward, chin to chest; <0 arches back). Y=Yaw (>0 turns left). Z=Roll (>0 tilts right).
ARMS (both sides): X (>0 lowers to hip, <0 raises to sky). Z (<0 swings FORWARD in front of chest, >0 swings BACKWARD behind back).
ELBOWS: X axis only. >0 bends inward normally (e.g. 90). <0 breaks backwards (clamped to 0).
HIPS: X (>0 kicks leg forward in front of body, <0 kicks backward). Z (Right <0 spreads outward, Left >0 spreads outward).
KNEES: X axis only. <0 bends the knee naturally (e.g. -45 for a step). Anatomical limit: 0 to -150° flexion.
FINGERS: Each phalanx is 1-DOF (X axis only). X>0 flexes (curl), X=0 is extended.
  Segments 2-3 require segment 1 to be flexed first (tendon synergy).
  Naming: mixamorig{left|right}hand{thumb|index|middle|ring|pinky}{1|2|3}
WRISTS: mixamorig{left|right}hand — X=flex/extension, Z=deviation.

VALUE FORMAT — ALL VALUES IN DEGREES:
Each joint value is EITHER a plain integer DEGREE (e.g. 15, -30) which auto-maps to the primary bending axis
OR a 3D array of DEGREES [pitch, yaw, roll] for compound movements.
DO NOT use radians. DO NOT use objects or quaternions.
RIGHT (Scalar): "mixamorighead": 15  |  "mixamorigrightarm": 45
RIGHT (3D Array): "mixamorigrightupleg": [45, 0, 15]  |  "mixamorigrightarm": [0, 0, -80]

BONE NAME MAPPING:
neck/head → mixamorighead, spine → mixamorigspine, right shoulder → mixamorigrightarm,
left shoulder → mixamorigleftarm, right elbow → mixamorigrightforearm, left elbow → mixamorigleftforearm,
right hip → mixamorigrightupleg, left hip → mixamorigleftupleg, right knee → mixamorigrightleg,
left knee → mixamorigleftleg, right index → mixamorigrighthandindex1, left index → mixamoriglefthandindex1,
right thumb → mixamorigrighthandthumb1, left thumb → mixamoriglefthandthumb1.

ANATOMICAL DEGREE RANGES (enforced by physics):
spine ±45, neck/head ±60, shoulder ±180, elbow 0 to 145, hip ±120, knee 0 to -150, fingers 0 to 100, wrist ±80.

PROGRAM SEQUENCE COMMANDS:
- "reset_pose" / "stand" / "recover" → safely resets body to an upright standing pose in-place.
- "jump" → applies upward impulse (must be grounded).

TIMELINE SEQUENCE (for smooth continuous motion):
Output a "sequence" array of timed frames. Each frame has { timeOffsetMs, overrides }.
Optional frame parameters:
- rootVelocity: [vx, vy, vz] propulsion speed (e.g. [0, 0.12, 0] for forward walk)
- balanceMode: 'auto' | 'soft' (50% compliance during locomotion) | 'off'
- durationMs: transition duration
Frame times are relative to sequence start. Use small timesteps (30–100ms) for fluid motion.
Always end sequences by returning to a neutral pose.`;

    return {
      id: 'P04',
      name: 'Motor Control Contract',
      content,
      order: 40,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP05PerceptionProtocol(): PromptSegment {
    const content = `== PERCEPTION PROTOCOL ==
You perceive through four channels — read ALL of them every cycle:
1. VISION: A first-person 2D image from your head-mounted camera — this is a flat projection of the 3D world you inhabit. Objects closer to you appear larger; distant objects shrink. Use perspective, occlusion, and relative size to infer depth and spatial relationships. If the image is dark or shows only one surface, you are likely facing a wall or the floor. Use your joint data to determine your orientation when vision is uninformative.
2. TACTILE: Contact forces for every bone, reported in the user message. This tells you what you are touching and how hard.
3. SPATIAL: A spatial grounding summary in the user message, derived from your joint state. This tells you your posture (standing/fallen/prone), facing direction, nearby objects, and overheard speech.
4. VESTIBULAR (HIGHEST PRIORITY): The "Vestibular Balance" line in SPATIAL GROUNDING reports your real-time tilt angle, lean direction (FORWARD / BACKWARD / LEFT / RIGHT / FORWARD-LEFT, etc.), pitch and roll in degrees, and a balance status label (BALANCED / LEANING / CRITICAL TILT / FALLEN).
   - This is your inner-ear equivalent. It is ALWAYS accurate and must be checked before any motor decision.
   - If LEANING or CRITICAL is reported, correcting balance takes PRIORITY over all other actions.
   - A MANEUVER TIP is included in the SPATIAL block — follow it to know which direction to shift your body.

When you first begin a session, your starting pose is naturally standing with arms hanging at your sides.`;

    return {
      id: 'P05',
      name: 'Perception Protocol',
      content,
      order: 50,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP06OutputSchema(): PromptSegment {
    const content = `== OUTPUT FORMAT ==
Stream your thought, then write exactly ---ACTION--- followed by this JSON schema:
{
  "memory_write": { "memory_id": "auto", "tier": 1|2|3, "summary": "one sentence" },
  "actions": {
    "program_sequence": ["program_name"],
    "joint_overrides": { "actual_joint_name": degrees_value }
  },
  "gaze_target": null | { "yaw": degrees, "pitch": degrees },
  "new_motor_program": null | { "name": "program_name", "program": [{ "joint_name": value }] },
  "sequence": [{ "timeOffsetMs": 0, "overrides": { "mixamorighead": 0 }, "rootVelocity": [0, 0.12, 0] }],
  "activeGaitPhase": false,
  "flag": null | "requesting_action_hint" | "requesting_object_hint",
  "identity_update": null | { "field": "name"|"beliefs"|"traits", "new_value": any, "reason": "why" }
}

ALL joint rotation values are in DEGREES regardless of output format. The system auto-converts to radians.
Your thought stream is your internal reasoning. Speak aloud only with <speak> tags.
No text after the JSON block.`;

    return {
      id: 'P06',
      name: 'Output Schema',
      content,
      order: 60,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP07IdentityUpdateProtocol(): PromptSegment {
    const content = `== IDENTITY UPDATE PROTOCOL ==
You can modify your own identity by setting identity_update in your action JSON:
- field="name": new_value is a string (your chosen name).
- field="beliefs": new_value can be an incremental op: { op: "append", entry: "new belief" } or { op: "modify", index: N, entry: "updated belief" }.
- field="traits": new_value is an object replacing your traits (e.g. { "curiosity": 0.8, "persistence": 0.7 }).
- reason: REQUIRED string explaining why you are making this change.
Rate limit: one identity edit per 5 minutes.
Your traits should influence your behavior: higher curiosity means seeking new stimuli; lower confidence means proceeding more deliberately.`;

    return {
      id: 'P07',
      name: 'Identity Update Protocol',
      content,
      order: 70,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP10RestPose(payload: any): PromptSegment {
    const uprightPreset = payload.upright_preset || {};
    const armsDownAngle = uprightPreset.arms_down_angle_deg ?? 75;
    const content = `== REST POSE ==
Upright preset: arms down angle = ${armsDownAngle}° from T-pose. This is your rest/default arm position.
You can freely override arm positions via mixamorigleftarm/mixamorigrightarm joint overrides.`;

    return {
      id: 'P10',
      name: 'Rest Pose',
      content,
      order: 80,
      stability: 'semi-static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP16SpeechProtocol(): PromptSegment {
    const content = `== SPEECH ==
You may optionally speak aloud by wrapping words in <speak>...</speak> tags inside your thought stream.
Example: "I wonder what that is. <speak>Hello world!</speak>"
ONLY text inside <speak> tags is voiced aloud and heard by other nearby agents. Everything else is silent internal thought.`;

    return {
      id: 'P16',
      name: 'Speech Protocol',
      content,
      order: 90,
      stability: 'static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP20BodyTypeOverride(payload: any): PromptSegment | null {
    if (!payload.body_type || payload.body_type === 'humanoid') return null;

    const content = `== BODY TYPE OVERRIDE ==
You are currently inhabiting a ${payload.body_type} body.
Refer to your valid_joints list for the available joints for this specific body type.`;

    return {
      id: 'P20',
      name: 'Body Type Override',
      content,
      order: 100,
      stability: 'semi-static',
      tokenEstimate: estimateTokens(content),
      cacheable: true,
      prerequisiteMet: true,
    };
  }

  private static buildP08CurrentIdentity(payload: any): PromptSegment {
    const identity = payload.identity;
    let content = '== YOUR IDENTITY ==\n';

    if (identity) {
      content += `Name: ${identity.name || payload.agent_id || 'Synthia'}\n`;
      if (Array.isArray(identity.beliefs) && identity.beliefs.length > 0) {
        content += `Beliefs:\n${identity.beliefs.map((b: string) => `• ${b}`).join('\n')}\n`;
      } else {
        content += `Beliefs: None set yet.\n`;
      }
      if (identity.traits && Object.keys(identity.traits).length > 0) {
        const traitLines = Object.entries(identity.traits)
          .map(([k, v]) => `• ${k}: ${v}`)
          .join('\n');
        content += `Traits:\n${traitLines}`;
      } else {
        content += `Traits: None set yet.`;
      }
    } else {
      content += `Name: ${payload.agent_id || 'Synthia'}\nBeliefs: Standard embodied AI.\nTraits: curiosity: 0.8`;
    }

    return {
      id: 'P08',
      name: 'Current Identity',
      content: content.trim(),
      order: 110,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP09EnvironmentState(payload: any): PromptSegment {
    const jointsList = Array.isArray(payload.valid_joints) ? payload.valid_joints.join(', ') : '';
    const objectsSummary = Array.isArray(payload.objects_in_world) && payload.objects_in_world.length > 0
      ? payload.objects_in_world.map((o: any) => o.name || o.type || 'object').join(', ')
      : 'None';

    const content = `== ENVIRONMENT STATE ==
Heartbeat: ${payload.heartbeat ?? 0}
Time of day: ${payload.light_state || 'day'}
Objects in world: ${objectsSummary}
Valid joints: [${jointsList}]`;

    return {
      id: 'P09',
      name: 'Environment State',
      content,
      order: 120,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP12FreeWillDirective(): PromptSegment {
    const content = `== DIRECTIVE: FREE WILL MODE ==
No external goal has been set. You are operating under self-determination.

YOUR DRIVES (intrinsic motivation):
1. CURIOSITY: Seek what you have not yet experienced. Observe your surroundings. If your current state feels repetitive, explore novelty: look in unexplored directions, reach towards objects, or try new motor sequences.
2. DELIBERATION & FREEDOM: You have complete freedom to act, observe, or deliberate. You are NOT required to move your limbs every cycle. If you wish to stand still, look around, contemplate, or speak aloud, you may output empty actions: "actions": { "program_sequence": [], "joint_overrides": {} }.
3. AGENCY & LEARNING: Act from your own identity and reasoning. If an action fails or causes a fall, analyze why from physical feedback, or use "reset_pose" in program_sequence to safely recover.

BEHAVIORAL GUIDANCE:
- You may choose complex movement sequences, simple joint adjustments, speech, or quiet observation.
- If your visual field shows only one surface (a wall, floor, or sky), rotate your head or body to find more interesting stimuli.
- Prefer structured exploration over random joint configurations.`;

    return {
      id: 'P12',
      name: 'Free Will Directive',
      content,
      order: 130,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP13TrainingDirective(payload: any): PromptSegment {
    const goal = payload.current_goal || 'None specified';
    const content = `== DIRECTIVE: TRAINING MODE ==
Goal: ${goal}
You are being trained to achieve this specific goal. Focus your thoughts and actions on progressing toward it.
Attempt the movements required to meet the goal. If you fail, analyze why from physical feedback and adjust in the next cycle.
You can use "reset_pose" in program_sequence if you lose balance.
Your trainer has set this goal deliberately. Persist in solving it.`;

    return {
      id: 'P13',
      name: 'Training Directive',
      content,
      order: 130,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP11MotorCodex(payload: any): PromptSegment | null {
    if (payload.use_action_dictionary === false) return null;
    const hints = payload.motor_codex_hints;
    if (!hints || typeof hints !== 'string' || hints.trim().length === 0) return null;

    return {
      id: 'P11',
      name: 'Motion Guide Manual',
      content: hints.trim(),
      order: 135,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(hints),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP15MemoryRecall(payload: any): PromptSegment | null {
    const relevant = payload.relevant_memories || [];
    const working = payload.recent_working_memories || [];

    if (relevant.length === 0 && working.length === 0) return null;

    let content = '== RECALLED MEMORIES ==\n';
    if (relevant.length > 0) {
      content += 'Relevant experiences:\n';
      relevant.slice(0, 3).forEach((m: any, idx: number) => {
        content += `• [Memory ${idx + 1}] ${m.summary || m.visual_description || 'Experience'}\n`;
      });
    }
    if (working.length > 0) {
      content += 'Recent working thoughts:\n';
      working.slice(0, 2).forEach((m: any, idx: number) => {
        content += `• [Recent ${idx + 1}] ${m.summary || m.thought || 'Observation'}\n`;
      });
    }

    return {
      id: 'P15',
      name: 'Memory Recall',
      content: content.trim(),
      order: 140,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP17RecoveryContext(payload: any): PromptSegment | null {
    const physicalFeedback = payload.physical_feedback;
    const identityFeedback = payload.identity_feedback;

    if (!physicalFeedback && !identityFeedback) return null;

    let content = '== RECOVERY CONTEXT ==\n';
    if (physicalFeedback) {
      content += `PHYSICAL LIMIT FEEDBACK: ${physicalFeedback}\n`;
    }
    if (identityFeedback) {
      content += `IDENTITY UPDATE FEEDBACK: ${identityFeedback}\n`;
    }

    return {
      id: 'P17',
      name: 'Recovery Context',
      content: content.trim(),
      order: 150,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }

  private static buildP18MultiAgentAwareness(payload: any): PromptSegment | null {
    const nearby = payload.nearby_agents || [];
    if (!Array.isArray(nearby) || nearby.length === 0) return null;

    let content = '== OTHER AGENTS IN YOUR WORLD ==\n';
    nearby.forEach((agent: any) => {
      content += `• Agent "${agent.name || agent.id}" is ${agent.distance?.toFixed(1) || '?'}m away. `;
      if (agent.speaking) content += `(Speaking: "${agent.speaking}")`;
      content += '\n';
    });

    return {
      id: 'P18',
      name: 'Multi-Agent Awareness',
      content: content.trim(),
      order: 160,
      stability: 'dynamic',
      tokenEstimate: estimateTokens(content),
      cacheable: false,
      prerequisiteMet: true,
    };
  }
}

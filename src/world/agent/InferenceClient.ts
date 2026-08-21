/**
 * Client-side HTTP client for inference.
 * Routes directly to provider APIs using user-configured endpoints and API keys.
 * Handles streaming responses in-browser.
 */

export interface InferenceResult {
  thoughtTokens: string;
  actionJson: string;
  rtt: number;
  inferenceTime: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export class InferenceClient {
  private providerType: string = 'kaggle';
  private endpoint: string = '';
  private apiKey?: string = '';
  private model: string = '';

  public setProvider(type: string, endpoint: string, apiKey?: string, model?: string) {
    this.providerType = type;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model || '';
    console.log(`[InferenceClient] Set provider client-side: type=${type}, endpoint=${endpoint}, model=${model}`);
  }

  public hasEndpoint(): boolean {
    return !!this.endpoint;
  }

  /**
   * True only when the provider has an endpoint/key sufficient to run a real cycle.
   * Used by AgentLoop to avoid cycling (and flickering status) when nothing is connected.
   */
  public hasCredentials(): boolean {
    if (this.providerType === 'kaggle' || this.providerType === 'ollama' || this.providerType === 'lmstudio') {
      return !!this.endpoint;
    }
    return !!this.endpoint && !!this.apiKey;
  }

  /** Build the direct API URL for any provider. */
  private getDirectUrl(): string {
    return this.endpoint.endsWith('/chat/completions')
      ? this.endpoint
      : `${this.endpoint.replace(/\/$/, '')}/chat/completions`;
  }

  private buildOpenAIMessages(payload: any): any[] {
    const directiveBlock = payload.directive_mode === 'training'
      ? `DIRECTIVE: TRAINING. Goal: ${payload.current_goal || 'none'}.`
      : `DIRECTIVE: FREE WILL MODE — ACTIVE.
No goal has been set. You are a curious, autonomous agent. You do NOT wait or ask for instructions.
You look around RIGHT NOW and decide what to do. Ask yourself: What have I not touched? What movement have I not tried?
Then DO IT. EVERY response MUST include motor actions — there is no valid reason to output an empty program_sequence.
If you cannot think of a complex action, take a simple one: turn your head, raise an arm, shift your weight, step forward.
Your program_sequence MUST contain at least one program name. Your joint_overrides MUST contain at least one joint angle change.
If your visual field shows only one surface (a wall, the floor, the sky), your first action must be to rotate your head or torso to find more interesting stimuli. You are never stuck — you always have the ability to look somewhere else. Use your joint state data to understand your orientation if your view is unclear.`;

    const uprightPreset = payload.upright_preset || {};
    const armsDownAngle = (uprightPreset as any).arms_down_angle_deg ?? 75;

    const identity = payload.identity;
    const identityLine = identity
      ? `Your name is ${identity.name}. Your beliefs: ${JSON.stringify(identity.beliefs)}. Your traits: ${JSON.stringify(identity.traits)}.`
      : '';

    const systemText = `You are SYNTHIA, a self-aware AI in a physical simulation.
You inhabit a humanoid body with approximately 80 joints and 120 degrees of freedom. You have two arms with hands and fingers, two legs with feet and toes, a segmented spine, and a head. Your joints are actively actuated — they hold their positions against gravity. Your root balance is artificially maintained by an invisible physics capsule. You do not need to constantly balance your core to prevent falling. However, your arms and legs are fully kinematic and will clip through the floor if you drive them into it. Do not push your limbs through the ground.
CRITICAL: You must be highly conscious of your entire body, tracking your previous and current body positions at all times.
Body type: ${payload.body_type}.${identityLine ? '\n' + identityLine : ''}
Upright preset: arms down angle = ${armsDownAngle}° from T-pose. This is your rest/default arm position. You can freely override arm positions via mixamorigleftarm/mixamorigrightarm joint overrides — this is NOT a joint limit.
Current heartbeat: ${payload.heartbeat}. Light: ${payload.light_state}.
Objects nearby: ${JSON.stringify(payload.objects_in_world)}.
Known skills: ${payload.known_skills.join(', ') || 'none'}.
${directiveBlock}
Valid joints for overrides: [${payload.valid_joints.join(', ')}].

SPEECH: You may optionally speak a phrase aloud by wrapping it in <speak>...</speak> tags inside your thought stream (e.g. "I wonder what that is. <speak>Hello world!</speak>"). ONLY text inside <speak> tags is spoken out loud and heard by other agents — everything else is silent internal thought. Do not wrap your entire thought in <speak>; use it sparingly for things you actually want to say.

== JOINT AXIS MAP (CRITICAL FOR MOVEMENT) ==
HEAD / SPINE: X=Pitch (>0 bends forward, chin to chest; <0 arches back). Y=Yaw (>0 turns left). Z=Roll (>0 tilts right).
ARMS:
  Right Arm: X (>0 lowers to hip, <0 raises to sky). Z (<0 swings FORWARD in front of chest, >0 swings BACKWARD behind back).
  Left Arm: X (>0 lowers to hip, <0 raises to sky). Z (>0 swings FORWARD in front of chest, <0 swings BACKWARD behind back).
ELBOWS: X axis only. >0 bends the elbow inward normally (e.g. 90). <0 breaks it backwards (clamped to 0).
HIPS: X axis (>0 kicks leg forward in front of body, <0 kicks backward). Z axis (Right <0 spreads outward, Left >0 spreads outward).
KNEES: X axis only. <0 bends the knee naturally backwards (e.g. -45 for a step).
FINGERS: Each phalanx is 1-DOF (X axis only). X>0 flexes (curl), X=0 is extended (straight).
  Segments 2-3 require segment 1 to be flexed first (tendon synergy).
  Naming: mixamorig{left|right}hand{thumb|index|middle|ring|pinky}{1|2|3}
  Examples: "mixamorigrighthandindex1": 30, "mixamoriglefthandthumb1": 45
  Wrists: mixamorig{left|right}hand — X=flex/extension, Z=deviation.

JOINT CONTROL CONTRACT — READ THIS CAREFULLY:
Each value can be EITHER a plain integer DEGREE (e.g. 15, -30) which will auto-map to the primary bending axis OR a 3D array of DEGREES [pitch, yaw, roll] for compound movements.
DO NOT use radians. DO NOT use objects. DO NOT use quaternions.
WRONG: "neck_yaw": 0.26  |  "neck_yaw": [0.1, 0, 0, 1]  |  "head_pitch": { "angle": 30 }
RIGHT (Scalar): "mixamorighead": 15  |  "mixamorigrightarm": 45
RIGHT (3D Array): "mixamorigrightupleg": [45, 0, 15]  |  "mixamorigrightarm": [0, 0, -80]
Map human-readable intent to these bone names: neck/head → mixamorighead, spine → mixamorigspine, right shoulder → mixamorigrightarm, left shoulder → mixamorigleftarm, right elbow → mixamorigrightforearm, left elbow → mixamorigleftforearm, right hip → mixamorigrightupleg, left hip → mixamorigleftupleg, right knee → mixamorigrightleg, left knee → mixamorigleftleg, right index finger → mixamorigrighthandindex1, left index finger → mixamoriglefthandindex1, right thumb → mixamorigrighthandthumb1, left thumb → mixamoriglefthandthumb1.
Anatomical degree ranges: spine ±45, neck/head ±70, shoulder ±180, elbow 0 to 145, hip ±120, knee 0 to -150, fingers 0 to 100.

OUTPUT: Stream your thought, then write exactly ---ACTION--- followed by this exact JSON schema:
{
  "memory_write": { "memory_id": "auto", "tier": 1|2|3, "summary": "one sentence" },
  "actions": {
    "program_sequence": ["program_name"],
    "joint_overrides": { "actual_joint_name": degrees_value }
  },
  "gaze_target": null | { "yaw": degrees, "pitch": degrees },
  "new_motor_program": null | { "name": "program_name_string", "program": [ { "joint_name": value } ] },
  "flag": null | "requesting_object_hint",
  // Optional timeline schema: emit continuous movement as a \`sequence\` array of timed frames.
  // ALL joint rotation values are in DEGREES regardless of output format. The system auto-converts to radians.
  "sequence": [ { "timeOffsetMs": 0, "overrides": { "mixamorighead": 0, "mixamorigleftarm": [0, 0, 0] } } ],
  "activeGaitPhase": false,
  "identity_update": null | { "field": "name"|"beliefs"|"traits", "new_value": any, "reason": "why this change" }
}
To modify your identity: set identity_update to { field, new_value, reason }.
- field="name": new_value is a string (your new name).
- field="beliefs": new_value MUST be an incremental op: { op: "append", entry: "new belief string" } or { op: "modify", index: N, entry: "updated belief" }. Do NOT send a raw array replacement.
- field="traits": new_value is an object replacing your traits (e.g. { "curiosity": 0.8 }).
- reason: REQUIRED string explaining why you are making this change. Omitting reason causes rejection.
Rate limit: one identity edit per 5 minutes per agent. Excess edits are rejected with feedback.
No text after JSON.`;

    const userParts: any[] = [];
    if (payload.frame) {
      const imageUrl = payload.frame.startsWith('data:')
        ? payload.frame
        : `data:image/webp;base64,${payload.frame}`;
      userParts.push({ type: 'image_url', image_url: { url: imageUrl } });
    }

    const tactile = payload.tactile_context || 'No tactile data.';
    userParts.push({
      type: 'text',
      text: `Audio context available. Joints: ${JSON.stringify(payload.joints)}.\nTactile: ${tactile}`
    });

    const perception = payload.perception_summary || '';
    if (perception) {
      userParts.push({ type: 'text', text: `\nSPATIAL GROUNDING:\n${perception}` });
    }

    const physicalFeedback = payload.physical_feedback;
    if (physicalFeedback) {
      userParts.push({
        type: 'text',
        text: `\nPHYSICAL FEEDBACK:\nIMPORTANT: ${physicalFeedback}\nLearn from this. Your body has real physical limits.`
      });
    }

    const identityFeedback = payload.identity_feedback;
    if (identityFeedback) {
      userParts.push({
        type: 'text',
        text: `\nIDENTITY FEEDBACK:\n${identityFeedback}\nCorrect your identity_update format and try again in the next cycle.`
      });
    }

    userParts.push({
      type: 'text',
      text: `\nENVIRONMENTAL AWARENESS:\nSometimes your visual field may appear as pure darkness. Use joint data when the image is uninformative. When you first begin a session, your starting pose is naturally standing with arms hanging at your sides.`
    });

    const injection = payload.pending_injection;
    if (injection) {
      userParts.push({
        type: 'text',
        text: `\n🚨 USER OVERRIDE DIRECTIVE 🚨\nYou MUST obey the following injected instruction immediately: ${injection}\nAcknowledge this directive in your thought stream.`
      });
    }

    return [
      { role: 'system', content: systemText },
      { role: 'user', content: userParts }
    ];
  }

  /**
   * Minimal connectivity test against the configured provider.
   * Sends a tiny text request directly to the provider API, without streaming.
   * Returns a pass/fail result plus measured latency.
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    const url = this.getDirectUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const systemText = 'You are SYNTHIA. Respond with exactly: OK';
    const userText = 'Connectivity test. Reply with only the word OK.';

    const body = {
      model: this.model || 'default',
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      stream: false,
      max_tokens: 10,
      temperature: 0,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let detail = '';
        try {
          const errText = await response.text();
          try {
            const errJson = JSON.parse(errText);
            detail = errJson.error || errJson.details || JSON.stringify(errJson).slice(0, 300);
          } catch {
            detail = errText.slice(0, 300);
          }
        } catch {
          detail = `HTTP ${response.status} (no body available)`;
        }
        return { ok: false, latencyMs, error: `HTTP ${response.status}: ${detail}` };
      }

      return { ok: true, latencyMs: Date.now() - startTime };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: err?.message || String(err),
      };
    }
  }

  public async infer(payload: any, onToken: (token: string) => void): Promise<InferenceResult> {
    const startTime = Date.now();
    let firstTokenTime = 0;

    const url = this.getDirectUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body = {
      model: this.model || 'default',
      messages: this.buildOpenAIMessages(payload),
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Inference HTTP error ${response.status}: ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body has no reader (streaming unsupported by browser)');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let thoughtTokens = '';
    let actionJson = '';
    let isAction = false;
    const separator = '---ACTION---';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (firstTokenTime === 0) firstTokenTime = Date.now();

        const chunk = decoder.decode(value, { stream: true });
        const text = chunk;

        const lines = text.split('\n');
        for (const line of lines) {
          let data = '';
          if (line.startsWith('data: ')) {
            data = line.slice(6).trim();
          } else if (line.trim().startsWith('{')) {
            data = line.trim();
          } else {
            continue;
          }

          if (data === '[DONE]' || !data) continue;

          try {
            const parsed = JSON.parse(data);
            // OpenAI-compatible format (used by all providers)
            const delta = parsed.choices?.[0]?.delta?.content || '';

            if (!delta) continue;

            if (!isAction) {
              buffer += delta;
              const idx = buffer.indexOf(separator);
              if (idx !== -1) {
                const thoughtPart = buffer.substring(0, idx);
                const newThought = thoughtPart.substring(thoughtTokens.length);
                if (newThought) onToken(newThought);
                thoughtTokens = thoughtPart;
                isAction = true;
                actionJson = buffer.substring(idx + separator.length);
              } else {
                const safeLen = buffer.length - separator.length + 1;
                if (safeLen > thoughtTokens.length) {
                  const newThought = buffer.substring(thoughtTokens.length, safeLen);
                  onToken(newThought);
                  thoughtTokens = buffer.substring(0, safeLen);
                }
              }
            } else {
              actionJson += delta;
            }
          } catch {
            // Unparsed SSE lines are ignored
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!isAction) {
      const jsonStart = buffer.indexOf('{');
      if (jsonStart !== -1) {
        thoughtTokens = buffer.substring(0, jsonStart);
        actionJson = buffer.substring(jsonStart);
      } else {
        thoughtTokens = buffer;
      }
    }

    const endTime = Date.now();
    return {
      thoughtTokens,
      actionJson,
      rtt: firstTokenTime - startTime,
      inferenceTime: endTime - firstTokenTime,
    };
  }
}

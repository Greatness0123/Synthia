// Kept in sync with frontend/src/types — update both if schema changes

/**
 * Types for inference payloads and responses.
 */

export interface InferPayload {
  frame: string;
  audio_pcm: string;
  joints: Record<string, any>;
  valid_joints: string[];
  upright_preset: Record<string, any>;
  heartbeat: number;
  light_state: string;
  session_id: string;
  body_type: string;
  current_goal: string | null;
  current_rung: number;
  objects_in_world: any[];
  relevant_memories: any[];
  recent_working_memories: any[];
  known_skills: string[];
  pending_injection: string | null;
  motor_program_library: string[];
  directive_mode: string;
  agent_id: string;
  contact_forces?: Record<string, any>;
  isGrounded?: boolean;
  tactile_context?: string;
  gaze_context?: string;
  perception_summary?: string;
  physical_feedback?: string | null;
  overheard_speech?: any[];
  use_action_dictionary?: boolean;
  motor_codex_hints?: string;
}

export interface InferResponse {
  memory_write: {
    memory_id: 'auto' | string;
    tier: 1 | 2 | 3;
    summary: string;
    skill_mastered: string | null;
    name_this_memory: string | null;
  };
  actions: {
    program_sequence: string[];
    joint_overrides: Record<string, number | number[]>;
  };
  new_motor_program: any | null;
  sequence?: Array<{
    timeOffsetMs: number;
    overrides: Record<string, number | number[]>;
    durationMs?: number;
    interpolation?: 'linear' | 'smooth' | 'step';
    rootVelocity?: [number, number, number];
    balanceMode?: 'auto' | 'soft' | 'dynamic_rmbs' | 'compliant' | 'off';
    stiffnessScale?: number;
    contactsExpected?: string[];
  }>;
  activeGaitPhase?: boolean;
  gaze_target?: { yaw: number; pitch: number } | null;
  flag: 'requesting_object_hint' | 'requesting_action_hint' | null;
}

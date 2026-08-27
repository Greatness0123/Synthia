import { PhysicsEngine } from './PhysicsEngine';
import { logger as Logger } from '../../utils/logger';

export interface CapturedAgentState {
  rootPos: [number, number, number];
  rootQuat: [number, number, number, number];
  rootVel: number[]; // 6 elements
  jointAngles: Record<string, number>;
  jointVels: Record<string, number>;
  /** Fix 2: Actuator control values keyed by actuator name, captured before world reload. */
  ctrl: Record<string, number>;
}

export interface CapturedObjectState {
  pos: [number, number, number];
  quat: [number, number, number, number];
  linvel: [number, number, number];
  angvel: [number, number, number];
}

// Module-level caches for WASM name→ID lookups (cleared on model reload)
let _jointNameCache: Map<string, number> | null = null;
let _actuatorNameCache: Map<string, number> | null = null;

/** Clear name→ID caches (call after model reload). */
export function clearStateRehydratorCaches(): void {
  _jointNameCache?.clear();
  _actuatorNameCache?.clear();
}

function getJointId(model: any, module: any, name: string): number {
  if (!_jointNameCache) _jointNameCache = new Map();
  let id = _jointNameCache.get(name);
  if (id === undefined) {
    id = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, name);
    _jointNameCache.set(name, id);
  }
  return id;
}

function getActuatorId(model: any, module: any, name: string): number {
  if (!_actuatorNameCache) _actuatorNameCache = new Map();
  let id = _actuatorNameCache.get(name);
  if (id === undefined) {
    id = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, name);
    _actuatorNameCache.set(name, id);
  }
  return id;
}

export class StateRehydrator {
  /**
   * Captures the physical state of all active agents and custom objects.
   */
  public static capture(
    physicsEngine: PhysicsEngine,
    activeAgentIds: string[],
    objects: any[]
  ): { agents: Record<string, CapturedAgentState>; objects: Record<string, CapturedObjectState> } {
    const agentsState: Record<string, CapturedAgentState> = {};
    const objectsState: Record<string, CapturedObjectState> = {};

    const world = physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule();
    if (!module) return { agents: {}, objects: {} };

    // 1. Capture agents' state
    for (const agentId of activeAgentIds) {
      const prefix = `${agentId}_`;
      const rootJntId = getJointId(model, module, prefix + 'root_freejoint');

      let rootPos: [number, number, number] = [0, 0.9, 0];
      let rootQuat: [number, number, number, number] = [1, 0, 0, 0];
      const rootVel: number[] = [0, 0, 0, 0, 0, 0];

      if (rootJntId >= 0) {
        const qp = model.jnt_qposadr[rootJntId];
        const qv = model.jnt_dofadr[rootJntId];
        rootPos = [data.qpos[qp], data.qpos[qp + 1], data.qpos[qp + 2]];
        rootQuat = [data.qpos[qp + 3], data.qpos[qp + 4], data.qpos[qp + 5], data.qpos[qp + 6]];
        for (let i = 0; i < 6; i++) {
          rootVel[i] = data.qvel[qv + i];
        }
      }

      const jointAngles: Record<string, number> = {};
      const jointVels: Record<string, number> = {};

      // We can scan joints in the model that belong to this agent's prefix
      for (let ji = 0; ji < model.njnt; ji++) {
        const jntName = module.mj_id2name(model, module.mjtObj.mjOBJ_JOINT.value, ji);
        if (jntName && jntName.startsWith(prefix) && jntName !== prefix + 'root_freejoint') {
          const qp = model.jnt_qposadr[ji];
          const qv = model.jnt_dofadr[ji];
          jointAngles[jntName] = data.qpos[qp];
          jointVels[jntName] = data.qvel[qv];
        }
      }

      // Fix 2: Capture data.ctrl for all actuators belonging to this agent.
      // Actuator names in the compiled MJCF are prefixed with "act_" in addition to the
      // agent prefix (e.g. "act_agent_0_mixamorigleftarm_pitch"), so we must check for
      // 'act_' + prefix. Without this, startsWith(prefix) never matches and ctrl is always
      // captured as empty — causing a full ctrl reset to 0 on every world reload, which
      // drives all joints back to T-pose (the 20-step ramp from zero destabilizes old agents).
      const ctrl: Record<string, number> = {};
      for (let ai = 0; ai < model.nu; ai++) {
        const actName = module.mj_id2name(model, module.mjtObj.mjOBJ_ACTUATOR.value, ai);
        if (actName && actName.startsWith('act_' + prefix)) {
          ctrl[actName] = data.ctrl[ai];
        }
      }

      agentsState[agentId] = {
        rootPos,
        rootQuat,
        rootVel,
        jointAngles,
        jointVels,
        ctrl,
      };
      Logger.info(`[STATE_REHYDRATOR] Captured ${agentId}: rootPos=[${rootPos.map(n=>n.toFixed(3)).join(', ')}], jointCount=${Object.keys(jointAngles).length}, ctrlCount=${Object.keys(ctrl).length}`);
    }

    // 2. Capture objects' state
    for (const obj of objects) {
      if (obj.bodyId !== undefined && obj.bodyId >= 0) {
        const dofAdr = model.body_dofadr[obj.bodyId];
        const dofNum = model.body_dofnum[obj.bodyId];
        const jntadr = model.body_jntadr[obj.bodyId];
        if (jntadr >= 0) {
          const qposAdr = model.jnt_qposadr[jntadr];
          if (dofNum === 6 && qposAdr >= 0) {
            objectsState[obj.id] = {
              pos: [data.qpos[qposAdr], data.qpos[qposAdr + 1], data.qpos[qposAdr + 2]],
              quat: [data.qpos[qposAdr + 3], data.qpos[qposAdr + 4], data.qpos[qposAdr + 5], data.qpos[qposAdr + 6]],
              linvel: [data.qvel[dofAdr], data.qvel[dofAdr + 1], data.qvel[dofAdr + 2]],
              angvel: [data.qvel[dofAdr + 3], data.qvel[dofAdr + 4], data.qvel[dofAdr + 5]],
            };
          }
        }
      }
    }

    return { agents: agentsState, objects: objectsState };
  }

  /**
   * Restores the physical state of all active agents and custom objects into the newly loaded world.
   */
  public static restore(
    physicsEngine: PhysicsEngine,
    captured: { agents: Record<string, CapturedAgentState>; objects: Record<string, CapturedObjectState> },
    objectsList: any[]
  ): void {
    const world = physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule();
    if (!module) return;

    // 1. Restore agents' state
    for (const [agentId, state] of Object.entries(captured.agents)) {
      const prefix = `${agentId}_`;
      const rootJntId = getJointId(model, module, prefix + 'root_freejoint');
      if (rootJntId >= 0) {
        const qp = model.jnt_qposadr[rootJntId];
        const qv = model.jnt_dofadr[rootJntId];
        data.qpos[qp] = state.rootPos[0];
        data.qpos[qp + 1] = state.rootPos[1];
        data.qpos[qp + 2] = state.rootPos[2];
        data.qpos[qp + 3] = state.rootQuat[0];
        data.qpos[qp + 4] = state.rootQuat[1];
        data.qpos[qp + 5] = state.rootQuat[2];
        data.qpos[qp + 6] = state.rootQuat[3];
        for (let i = 0; i < 6; i++) {
          data.qvel[qv + i] = state.rootVel[i];
        }
      }

      for (const [jntName, angle] of Object.entries(state.jointAngles)) {
        const ji = getJointId(model, module, jntName);
        if (ji >= 0) {
          const qp = model.jnt_qposadr[ji];
          const qv = model.jnt_dofadr[ji];
          data.qpos[qp] = angle;
          data.qvel[qv] = state.jointVels[jntName] ?? 0;
        }
      }

      // Fix 2: Restore data.ctrl for this agent's actuators by name so that old agents
      // resume their exact commanded servo state on the first step after reload —
      // no 20-step ramp from zero, no pose flop.
      if (state.ctrl) {
        for (const [actName, value] of Object.entries(state.ctrl)) {
          const ai = getActuatorId(model, module, actName);
          if (ai >= 0) {
            data.ctrl[ai] = value;
          }
        }
      }
      Logger.info(`[STATE_REHYDRATOR] Restored ${agentId}: rootPos=[${state.rootPos.map(n=>n.toFixed(3)).join(', ')}] into new world.`);
    }

    // 2. Restore objects' state
    for (const obj of objectsList) {
      const state = captured.objects[obj.id];
      if (state && obj.bodyId !== undefined && obj.bodyId >= 0) {
        const dofAdr = model.body_dofadr[obj.bodyId];
        const dofNum = model.body_dofnum[obj.bodyId];
        const jntadr = model.body_jntadr[obj.bodyId];
        if (jntadr >= 0) {
          const qposAdr = model.jnt_qposadr[jntadr];
          if (dofNum === 6 && qposAdr >= 0) {
            Logger.info(`[RESTORE OBJ] ${obj.id} bodyId=${obj.bodyId} writing pos=[${state.pos.map((n:number)=>n.toFixed(3))}] to qposAdr=${qposAdr}`);
            data.qpos[qposAdr] = state.pos[0];
            data.qpos[qposAdr + 1] = state.pos[1];
            data.qpos[qposAdr + 2] = state.pos[2];
            data.qpos[qposAdr + 3] = state.quat[0];
            data.qpos[qposAdr + 4] = state.quat[1];
            data.qpos[qposAdr + 5] = state.quat[2];
            data.qpos[qposAdr + 6] = state.quat[3];
            data.qvel[dofAdr] = state.linvel[0];
            data.qvel[dofAdr + 1] = state.linvel[1];
            data.qvel[dofAdr + 2] = state.linvel[2];
            data.qvel[dofAdr + 3] = state.angvel[0];
            data.qvel[dofAdr + 4] = state.angvel[1];
            data.qvel[dofAdr + 5] = state.angvel[2];
          }
        }
      }
    }

    // Forward physics state update
    physicsEngine.forward();
  }
}

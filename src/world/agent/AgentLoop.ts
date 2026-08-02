/**
 * Main cycle loop per agent running fully client-side.
 * Ported from coordinator/src/agentLoop.ts.
 */

import { PayloadBuilder } from './payloadBuilder';
import { InferenceClient } from './InferenceClient';
import { MemoryManager, MemoryEntry } from './memoryManager';
import { useAgentStore } from '../../store/agentStore';

interface AgentLoopConfig {
  agentId: string;
  cycleMs: number;
  supabaseUrl: string;
  supabaseKey: string;
  captureWorldState: () => Promise<any>;
}

export class AgentLoop {
  private config: AgentLoopConfig;
  private interval: any = null;
  private isProcessing: boolean = false;

  private payloadBuilder: PayloadBuilder;
  private inferenceClient: InferenceClient;
  private memoryManager: MemoryManager;

  private directives = { mode: 'free_will', goal: '' };
  private heartbeat = 0;
  private lastActionFeedback: any[] = [];
  private currentSessionId: string | null = null;
  private pendingCycles: Map<string, any> = new Map();

  constructor(config: AgentLoopConfig) {
    this.config = config;
    this.memoryManager = new MemoryManager(config.supabaseUrl, config.supabaseKey);
    this.payloadBuilder = new PayloadBuilder(this.memoryManager);
    this.inferenceClient = new InferenceClient();
  }

  public setDirective(mode: string, goal: string) {
    this.directives = { mode, goal };
  }

  public recordActionFeedback(rejected: any[]) {
    this.lastActionFeedback = rejected;
    console.log(`[AgentLoop (${this.config.agentId})] recorded ${rejected.length} rejected joint action(s) for next payload`);
  }

  public setProvider(type: string, endpoint: string, apiKey?: string, model?: string) {
    this.inferenceClient.setProvider(type, endpoint, apiKey, model);
  }

  public setCycleMs(ms: number): void {
    this.config.cycleMs = ms;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = setInterval(() => this.cycle(), ms);
    }
  }

  public updateSupabase(url: string, key: string) {
    this.config.supabaseUrl = url;
    this.config.supabaseKey = key;
    this.memoryManager = new MemoryManager(url, key);
    this.payloadBuilder = new PayloadBuilder(this.memoryManager);
  }

  public async start() {
    if (this.interval) return;

    this.currentSessionId = `session_${Date.now()}_${this.config.agentId}`;

    const rehydrationSummary = "Reconnecting to neural lattice... archives accessed... current status: operational.";
    const store = useAgentStore.getState() as any;
    const agentId = this.config.agentId;
    const isActiveAgent = store.activeAgentId === agentId;

    // Send rehydration tokens to the agent's own record. Only the active agent
    // drives the flat mirror + startup modal so spawning additional agents never
    // re-triggers the RehydrationModal.
    if (store.setRehydrationSummaryForAgent) {
      store.setRehydrationSummaryForAgent(agentId, '');
      for (const token of rehydrationSummary.split(' ')) {
        store.appendRehydrationTokenForAgent(agentId, token + ' ');
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      if (isActiveAgent) {
        store.setHasRehydrated(true);
      }
    }

    this.interval = setInterval(() => this.cycle(), this.config.cycleMs || 2000);
    console.log(`[AgentLoop (${this.config.agentId})] started independent inference loop`);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.currentSessionId) {
      this.memoryManager.endSession(this.currentSessionId);
      this.currentSessionId = null;
    }
    console.log(`[AgentLoop (${this.config.agentId})] stopped`);
  }

  private async cycle() {
    if (this.isProcessing) {
      console.log(`[AgentLoop (${this.config.agentId})] Skipping cycle: previous inference is still in-flight.`);
      return;
    }

    // Call callback to capture the current world state
    const worldState = await this.config.captureWorldState();
    if (!worldState) {
      console.log(`[AgentLoop (${this.config.agentId})] Skipping cycle: world state not available yet.`);
      return;
    }

    // Sync agent heartbeat state
    this.heartbeat = worldState.heartbeat || this.heartbeat + 1;

    // Direct read of pending injection + directive/goal from store for this agent.
    // DirectivePanel/InjectionInput write to agents[agentId] via *ForAgent actions.
    const store = useAgentStore.getState() as any;
    const agentState = store.agents?.[this.config.agentId];
    let pendingInjection: string | null = null;
    if (agentState && agentState.pendingInjection) {
      pendingInjection = agentState.pendingInjection;
      if (store.setPendingInjectionForAgent) {
        store.setPendingInjectionForAgent(this.config.agentId, null);
      }
    }

    // Per-agent directive mode + goal (client path). Falls back to last set via
    // setDirective() so the loop always carries the latest intent.
    if (agentState) {
      if (agentState.directiveMode) {
        this.directives.mode = agentState.directiveMode === 'training' ? 'training' : 'free_will';
      }
      if (agentState.currentGoal != null) {
        this.directives.goal = agentState.currentGoal;
      }
    }

    if (pendingInjection) {
      worldState.injected_thought = pendingInjection;
      console.log(`[AgentLoop (${this.config.agentId})] Injection consumed: "${pendingInjection}"`);
    }

    this.isProcessing = true;
    try {
      const masteredSkills = await this.memoryManager.getMasteredSkills(this.config.agentId);

      // Force session ID
      worldState.sessionId = this.currentSessionId || `session_${this.config.agentId}`;

      const payload = await this.payloadBuilder.build(worldState, this.config.agentId, {
        motorPrograms: [],
        masteredSkills,
        physicalFeedback: this.lastActionFeedback,
        ...this.directives
      });
      this.lastActionFeedback = [];

      // Clear pending thoughts for this agent in store before writing new stream
      if (store.setCurrentThoughtForAgent) {
        store.setCurrentThoughtForAgent(this.config.agentId, '');
        store.setStatusForAgent(this.config.agentId, 'thinking');
      }

      console.log(`[AgentLoop (${this.config.agentId})] Sending inference request...`);
      const result = await this.inferenceClient.infer(payload, (token) => {
        if (store.appendThoughtTokenForAgent) {
          store.appendThoughtTokenForAgent(this.config.agentId, token);
        }
      });

      if (store.setStatusForAgent) {
        store.setStatusForAgent(this.config.agentId, 'acting');
      }

      console.log(`[AgentLoop (${this.config.agentId})] Inference completed. Parsing action JSON.`);
      const actionData = this.parseAndValidateAction(result.actionJson);
      if (actionData) {
        // Dispatch parsed action custom event which useWorld's handleAction will receive
        const actionEvent = new CustomEvent('synthia:action', {
          detail: {
            programSequence: actionData.actions?.program_sequence || [],
            jointOverrides: actionData.actions?.joint_overrides || {},
            sequence: actionData.sequence || null,
            activeGaitPhase: typeof actionData.activeGaitPhase === 'boolean' ? actionData.activeGaitPhase : false,
            gazeTarget: actionData.gaze_target || null,
            agentId: this.config.agentId
          }
        });
        window.dispatchEvent(actionEvent);

        // Record pending cycle for memory write
        const cycleTimestamp = Date.now();
        const cycleId = `cycle_${cycleTimestamp}`;
        const cycleData = {
          id: cycleId,
          result,
          actionData,
          worldState,
          timestamp: cycleTimestamp,
          finalized: false
        };

        this.pendingCycles.set(cycleId, cycleData);

        // Auto finalize with 'unknown' after 4s
        setTimeout(() => {
          const cycle = this.pendingCycles.get(cycleId);
          if (cycle && !cycle.finalized) {
            this.finalizeCycle({ description: 'timeout', reward: 0 }, cycleId);
          }
        }, 4000);

      } else {
        console.warn(`[AgentLoop (${this.config.agentId})] Action parse failed. XML action raw text: ${result.actionJson}`);
      }

    } catch (err: any) {
      console.error(`[AgentLoop (${this.config.agentId})] Cycle error:`, err);
    } finally {
      this.isProcessing = false;
      if (store.setStatusForAgent) {
        store.setStatusForAgent(this.config.agentId, 'idle');
      }
    }
  }

  public async handleOutcome(outcome: any) {
    let latestCycleId: string | null = null;
    let latestTs = 0;
    for (const [id, cycle] of this.pendingCycles.entries()) {
      if (!cycle.finalized && cycle.timestamp > latestTs) {
        latestTs = cycle.timestamp;
        latestCycleId = id;
      }
    }
    if (latestCycleId) {
      this.finalizeCycle(outcome, latestCycleId);
    }
  }

  private async finalizeCycle(outcome: any, cycleId: string) {
    const cycle = this.pendingCycles.get(cycleId);
    if (!cycle || cycle.finalized) return;

    cycle.finalized = true;
    this.pendingCycles.delete(cycleId);
    const { result, actionData, worldState } = cycle;

    const memoryEntry: MemoryEntry = {
      memory_id: actionData.memory_write.memory_id === 'auto' ? `mem_${Date.now()}` : actionData.memory_write.memory_id,
      heartbeat: worldState.heartbeat || this.heartbeat,
      day_cycle: 1,
      light_state: worldState.lightState || 'day',
      tier: actionData.memory_write.tier || 3,
      visual_description: actionData.memory_write.summary || "No summary provided",
      audio_state: JSON.stringify(worldState.audio || {}),
      joint_state_summary: JSON.stringify(worldState.joints || {}),
      self_questions: {},
      thought: result.thoughtTokens,
      action_taken: actionData.actions,
      outcome: outcome.description || outcome || 'unknown',
      reward_signal: outcome.reward || 0,
      goal_at_time: worldState.currentGoal || '',
      injected: !!worldState.injected_thought,
      session_id: worldState.sessionId || `session_${this.config.agentId}`,
    };

    const writeOk = await this.memoryManager.write(memoryEntry, this.config.agentId);
    if (writeOk) {
      const store = useAgentStore.getState() as any;
      if (store.addMemoryForAgent) {
        store.addMemoryForAgent(this.config.agentId, {
          id: memoryEntry.memory_id,
          thought: memoryEntry.thought,
          summary: memoryEntry.visual_description,
          timestamp: Date.now(),
          reward: memoryEntry.reward_signal,
          outcome: memoryEntry.outcome,
          tier: memoryEntry.tier,
          heartbeat: memoryEntry.heartbeat,
        });
      }
      console.log(`[AgentLoop (${this.config.agentId})] Client-side memory saved successfully: ${memoryEntry.memory_id}`);
    }
  }

  private parseAndValidateAction(jsonStr: string): any {
    try {
      const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);

      if (!data.memory_write || typeof data.memory_write !== 'object') {
        const fallbackSummary = typeof data.memory_write === 'string' ? data.memory_write : 'No summary provided';
        data.memory_write = { memory_id: 'auto', tier: 3, summary: fallbackSummary };
      }

      if (Array.isArray(data.actions)) {
        const programs = data.actions.map((a: any) => a.program_name || a.program || a.action).filter(Boolean);
        const overrides: Record<string, any> = {};
        data.actions.forEach((a: any) => {
          if (a.joint_overrides) Object.assign(overrides, a.joint_overrides);
          if (a.joint && a.rotation) overrides[a.joint] = a.rotation;
        });
        data.actions = {
          program_sequence: programs,
          joint_overrides: overrides
        };
      }

      if (!data.actions || typeof data.actions !== 'object') {
        data.actions = { program_sequence: [], joint_overrides: {} };
      }
      if (!Array.isArray(data.actions.program_sequence)) {
        data.actions.program_sequence = [];
      }
      if (!data.actions.joint_overrides || typeof data.actions.joint_overrides !== 'object') {
        data.actions.joint_overrides = {};
      }

      const DEG_TO_RAD = Math.PI / 180;
      const normalizeRaw = (rawAction: any) => {
        if (typeof rawAction === 'number') {
          let value = rawAction;
          if (Math.abs(value) > Math.PI + 0.1) value *= DEG_TO_RAD;
          return Math.max(-Math.PI, Math.min(Math.PI, value));
        }

        if (Array.isArray(rawAction) && rawAction.length === 3) {
          return rawAction.map((v) => {
            const n = Number(v) || 0;
            return Math.abs(n) > Math.PI + 0.1 ? Math.max(-Math.PI, Math.min(Math.PI, n * DEG_TO_RAD)) : Math.max(-Math.PI, Math.min(Math.PI, n));
          }) as [number, number, number];
        }

        if (typeof rawAction === 'object' && rawAction !== null) {
          const x = Number(rawAction.x ?? rawAction.pitch ?? 0) || 0;
          const y = Number(rawAction.y ?? rawAction.yaw ?? 0) || 0;
          const z = Number(rawAction.z ?? rawAction.roll ?? 0) || 0;
          return [x, y, z].map((v) => {
            const n = Number(v) || 0;
            return Math.abs(n) > Math.PI + 0.1 ? Math.max(-Math.PI, Math.min(Math.PI, n * DEG_TO_RAD)) : Math.max(-Math.PI, Math.min(Math.PI, n));
          }) as [number, number, number];
        }

        return rawAction;
      };

      if (data.sequence && Array.isArray(data.sequence)) {
        for (const frame of data.sequence) {
          if (!frame.overrides || typeof frame.overrides !== 'object') continue;
          for (const joint in frame.overrides) {
            frame.overrides[joint] = normalizeRaw(frame.overrides[joint]);
          }
        }
      }

      if (data.actions && data.actions.joint_overrides) {
        for (const joint in data.actions.joint_overrides) {
          data.actions.joint_overrides[joint] = normalizeRaw(data.actions.joint_overrides[joint]);
        }
      }

      const gazeTarget = data.gaze_target || data.actions?.gaze_target || null;
      if (gazeTarget && typeof gazeTarget === 'object') {
        let gtYaw = gazeTarget.yaw ?? 0;
        let gtPitch = gazeTarget.pitch ?? 0;

        if (Math.abs(gtYaw) > Math.PI + 0.1) gtYaw *= DEG_TO_RAD;
        if (Math.abs(gtPitch) > Math.PI + 0.1) gtPitch *= DEG_TO_RAD;

        gtYaw = Math.max(-0.79, Math.min(0.79, gtYaw));
        gtPitch = Math.max(-0.79, Math.min(0.79, gtPitch));

        if (!data.actions.joint_overrides['mixamorighead']) {
          data.actions.joint_overrides['mixamorighead'] = [gtPitch, gtYaw, 0];
        }
      }

      return data;
    } catch (e: any) {
      console.error(`[AgentLoop (${this.config.agentId})] JSON parse error — ${e.message}`);
      return null;
    }
  }
}

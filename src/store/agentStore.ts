/**
 * Zustand store for agent-specific state supporting multi-agent record map
 * and active agent selection with backward-compatible flat field mirroring.
 */

import { create } from 'zustand';
import type { Thought, Memory, AgentStatus, DirectiveMode } from '../types/agent';

export interface SingleAgentState {
  agentId: string;
  thoughts: Thought[];
  memories: Memory[];
  skills: string[];
  currentRung: number;
  currentGoal: string | null;
  directiveMode: DirectiveMode;
  heartbeat: number;
  status: AgentStatus;
  pendingInjection: string | null;
  currentThought: string;
}

const createDefaultAgent = (agentId: string): SingleAgentState => ({
  agentId,
  thoughts: [],
  memories: [],
  skills: [],
  currentRung: 0,
  currentGoal: null,
  directiveMode: 'free_will',
  heartbeat: 0,
  status: 'idle',
  pendingInjection: null,
  currentThought: '',
});

interface AgentStoreState {
  activeAgentId: string;
  agents: Record<string, SingleAgentState>;

  // Flat fields mirrored from the activeAgentId for backward compatibility
  thoughts: Thought[];
  memories: Memory[];
  skills: string[];
  currentRung: number;
  currentGoal: string | null;
  directiveMode: DirectiveMode;
  heartbeat: number;
  lightState: 'day' | 'night';
  status: AgentStatus;
  pendingInjection: string | null;
  currentThought: string;
  rehydrationSummary: string;
  hasRehydrated: boolean;
  masteredSkills: string[];
  injectionQueue: string[];
  injectionQueueCount: number;

  // Actions
  setActiveAgentId: (id: string) => void;
  addAgent: (id: string) => void;
  addThoughtForAgent: (id: string, thought: Thought) => void;
  addMemoryForAgent: (id: string, memory: Memory) => void;
  setStatusForAgent: (id: string, status: AgentStatus) => void;
  setCurrentThoughtForAgent: (id: string, text: string) => void;
  appendThoughtTokenForAgent: (id: string, token: string) => void;
  setPendingInjectionForAgent: (id: string, text: string | null) => void;
  setDirectiveModeForAgent: (id: string, mode: DirectiveMode) => void;
  setCurrentGoalForAgent: (id: string, goal: string | null) => void;
  incrementHeartbeatForAgent: (id: string) => void;

  // Mirrored Actions on the currently active agent
  addThought: (thought: Thought) => void;
  addMemory: (memory: Memory) => void;
  setDirectiveMode: (mode: DirectiveMode) => void;
  setCurrentGoal: (goal: string | null) => void;
  setPendingInjection: (text: string | null) => void;
  setStatus: (status: AgentStatus) => void;
  setCurrentThought: (text: string) => void;
  appendThoughtToken: (token: string) => void;
  setRehydrationSummary: (text: string) => void;
  appendRehydrationToken: (token: string) => void;
  setHasRehydrated: (val: boolean) => void;
  addMasteredSkill: (skill: string) => void;
  setInjectionQueue: (queue: string[]) => void;
  setInjectionQueueCount: (count: number) => void;
  incrementInjectionQueueCount: () => void;
  decrementInjectionQueueCount: () => void;
  setRung: (rung: number) => void;
  incrementHeartbeat: () => void;
  setHeartbeat: (hb: number) => void;
}

const initialAgentId = 'agent_0';
const initialAgents = {
  [initialAgentId]: createDefaultAgent(initialAgentId),
};

export const useAgentStore = create<AgentStoreState>((set, get) => {
  // Helper to update flat mirrored fields in the state
  const mirrorActiveAgentFields = (activeId: string, agentsMap: Record<string, SingleAgentState>) => {
    const active = agentsMap[activeId] || createDefaultAgent(activeId);
    return {
      thoughts: active.thoughts,
      memories: active.memories,
      skills: active.skills,
      currentRung: active.currentRung,
      currentGoal: active.currentGoal,
      directiveMode: active.directiveMode,
      heartbeat: active.heartbeat,
      status: active.status,
      pendingInjection: active.pendingInjection,
      currentThought: active.currentThought,
    };
  };

  return {
    activeAgentId: initialAgentId,
    agents: initialAgents,

    // Initial mirror values
    ...createDefaultAgent(initialAgentId),
    lightState: 'day',
    rehydrationSummary: '',
    hasRehydrated: false,
    masteredSkills: [],
    injectionQueue: [],
    injectionQueueCount: 0,

    setActiveAgentId: (activeAgentId) => set((state) => {
      const mirrors = mirrorActiveAgentFields(activeAgentId, state.agents);
      return { activeAgentId, ...mirrors };
    }),

    addAgent: (id) => set((state) => {
      if (state.agents[id]) return {};
      const newAgents = {
        ...state.agents,
        [id]: createDefaultAgent(id),
      };
      return { agents: newAgents };
    }),

    addThoughtForAgent: (id, thought) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = {
        ...agent,
        thoughts: [...agent.thoughts, thought],
      };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    addMemoryForAgent: (id, memory) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = {
        ...agent,
        memories: [...agent.memories, memory],
      };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    setStatusForAgent: (id, status) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, status };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    setCurrentThoughtForAgent: (id, currentThought) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, currentThought };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    appendThoughtTokenForAgent: (id, token) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = {
        ...agent,
        currentThought: agent.currentThought + token,
      };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    setPendingInjectionForAgent: (id, text) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, pendingInjection: text };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    setDirectiveModeForAgent: (id, mode) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, directiveMode: mode };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    setCurrentGoalForAgent: (id, goal) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, currentGoal: goal };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    incrementHeartbeatForAgent: (id) => set((state) => {
      const agent = state.agents[id] || createDefaultAgent(id);
      const updatedAgent = { ...agent, heartbeat: agent.heartbeat + 1 };
      const newAgents = { ...state.agents, [id]: updatedAgent };
      const mirrors = id === state.activeAgentId ? mirrorActiveAgentFields(id, newAgents) : {};
      return { agents: newAgents, ...mirrors };
    }),

    // Mirrored Legacy Actions targeting the currently active agent
    addThought: (thought) => {
      const activeId = get().activeAgentId;
      get().addThoughtForAgent(activeId, thought);
    },
    addMemory: (memory) => {
      const activeId = get().activeAgentId;
      get().addMemoryForAgent(activeId, memory);
    },
    setDirectiveMode: (mode) => {
      const activeId = get().activeAgentId;
      get().setDirectiveModeForAgent(activeId, mode);
    },
    setCurrentGoal: (goal) => {
      const activeId = get().activeAgentId;
      get().setCurrentGoalForAgent(activeId, goal);
    },
    setPendingInjection: (text) => {
      const activeId = get().activeAgentId;
      get().setPendingInjectionForAgent(activeId, text);
    },
    setStatus: (status) => {
      const activeId = get().activeAgentId;
      get().setStatusForAgent(activeId, status);
    },
    setCurrentThought: (text) => {
      const activeId = get().activeAgentId;
      get().setCurrentThoughtForAgent(activeId, text);
    },
    appendThoughtToken: (token) => {
      const activeId = get().activeAgentId;
      get().appendThoughtTokenForAgent(activeId, token);
    },

    setRehydrationSummary: (rehydrationSummary) => set({ rehydrationSummary }),
    appendRehydrationToken: (token) => set((state) => ({ rehydrationSummary: state.rehydrationSummary + token })),
    setHasRehydrated: (hasRehydrated) => set({ hasRehydrated }),
    addMasteredSkill: (skill) => set((state) => ({ masteredSkills: [...state.masteredSkills, skill] })),
    setInjectionQueue: (injectionQueue) => set({ injectionQueue }),
    setInjectionQueueCount: (injectionQueueCount) => set({ injectionQueueCount }),
    incrementInjectionQueueCount: () => set((state) => ({ injectionQueueCount: state.injectionQueueCount + 1 })),
    decrementInjectionQueueCount: () => set({ injectionQueueCount: Math.max(0, get().injectionQueueCount - 1) }),
    setRung: (currentRung) => set((state) => {
      const activeId = state.activeAgentId;
      const agent = state.agents[activeId] || createDefaultAgent(activeId);
      const updatedAgent = { ...agent, currentRung };
      const newAgents = { ...state.agents, [activeId]: updatedAgent };
      const mirrors = mirrorActiveAgentFields(activeId, newAgents);
      return { agents: newAgents, ...mirrors };
    }),
    incrementHeartbeat: () => {
      const activeId = get().activeAgentId;
      get().incrementHeartbeatForAgent(activeId);
    },
    setHeartbeat: (heartbeat) => set((state) => {
      const activeId = state.activeAgentId;
      const agent = state.agents[activeId] || createDefaultAgent(activeId);
      const updatedAgent = { ...agent, heartbeat };
      const newAgents = { ...state.agents, [activeId]: updatedAgent };
      const mirrors = mirrorActiveAgentFields(activeId, newAgents);
      return { agents: newAgents, ...mirrors };
    }),
  };
});

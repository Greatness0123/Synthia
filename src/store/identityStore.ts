import { create } from 'zustand';
import { AgentIdentity } from '../world/agent/identityManager';

interface IdentityState {
  identities: Record<string, AgentIdentity>;
  getIdentity: (agentId: string) => AgentIdentity | undefined;
  setIdentity: (agentId: string, identity: AgentIdentity) => void;
  removeIdentity: (agentId: string) => void;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  identities: {},

  getIdentity: (agentId: string) => get().identities[agentId],

  setIdentity: (agentId: string, identity: AgentIdentity) =>
    set((state) => ({
      identities: { ...state.identities, [agentId]: identity },
    })),

  removeIdentity: (agentId: string) =>
    set((state) => {
      const identities = { ...state.identities };
      delete identities[agentId];
      return { identities };
    }),
}));

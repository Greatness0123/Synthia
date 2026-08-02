/**
 * Shared coordinator context primitives: the React context object, public
 * types, helper functions, and the useCoordinator hook.
 *
 * Kept in a dedicated non-component file so that CoordinatorContext.tsx only
 * exports the CoordinatorProvider component (react-refresh / fast-refresh
 * friendly).
 */

import { createContext, useContext } from 'react';
import { useAgentStore } from '../../store/agentStore';

/**
 * Resolve the target agentId for an incoming coordinator message.
 * Falls back to the currently active agent when the server omits agentId.
 */
export function resolveAgentId(data: any): string {
  return data?.agentId || useAgentStore.getState().activeAgentId || 'agent_0';
}

export type MessageListener = (msg: { type: string; data: any }) => void;

export interface CoordinatorContextType {
  sendMessage: (type: string, data: Record<string, any>) => void;
  setRagdoll: (ragdoll: any | null) => void;
  onMessage: (listener: MessageListener) => () => void;
}

export const CoordinatorContext = createContext<CoordinatorContextType | null>(null);

export function normalizeWebSocketUrl(url: string): string {
  if (url.startsWith('wss://') || url.startsWith('ws://')) return url;
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `ws://${url}`;
}

export const useCoordinator = () => {
  const context = useContext(CoordinatorContext);
  if (!context) {
    throw new Error('useCoordinator must be used within a CoordinatorProvider');
  }
  return context;
};

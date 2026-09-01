/**
 * Onboarding step definitions.
 * Each step defines its content, target element, and lifecycle hooks.
 */

import { useUIStore } from '../../store/uiStore';
import { waitForElement } from './waitForElement';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  target: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  onEnter?: () => Promise<void> | void;
  onExit?: () => Promise<void> | void;
}

export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'viewport',
    title: 'Your simulation is live',
    body: 'This is a real physics world running in your browser. A humanoid agent can stand, move, and interact here. Everything you do happens in this space.',
    target: '[data-tour="viewport"]',
    side: 'bottom',
  },
  {
    id: 'spawn-agent',
    title: 'Create an agent',
    body: 'Click here to bring an AI agent into the world. Each agent has its own body, memory, and mind. You can run several at once.',
    target: '[data-tour="spawn-agent"]',
    side: 'bottom',
  },
  {
    id: 'agent-settings',
    title: 'Give it a mind',
    body: 'Before your agent can think, connect an inference provider here. Choose a cloud API or a local model, add your key, and save. This is also where you configure memory, voice, and vision.',
    target: '[data-tour="agent-settings-modal"]',
    side: 'bottom',
    onEnter: async () => {
      useUIStore.getState().setSettingsModalOpen(true);
      await waitForElement('[data-tour="agent-settings-modal"]');
    },
    onExit: async () => {
      useUIStore.getState().setSettingsModalOpen(false);
    },
  },
  {
    id: 'task-input',
    title: 'Tell it what to do',
    body: 'Type a goal here: "walk forward," "look around," "explore the room." An empty field means free will. Text sets a task. Press the X to end the task and return to free will.',
    target: '[data-tour="task-input"]',
    side: 'top',
    onEnter: async () => {
      useUIStore.getState().setSettingsModalOpen(false);
    },
  },
  {
    id: 'agent-inspector',
    title: 'Watch it think',
    body: 'Open the Agent Inspector to see reasoning in real time. Thoughts stream live. Memories show what it retains. Body shows its structure. Logs capture technical detail.',
    target: '[data-tour="agent-inspector-panel"]',
    side: 'left',
    onEnter: async () => {
      useUIStore.getState().setRightPanelOpen(true);
      useUIStore.getState().setActiveRightPanelTab('thoughts');
      await waitForElement('[data-tour="agent-inspector-panel"]');
    },
    onExit: async () => {
      useUIStore.getState().setRightPanelOpen(false);
    },
  },
  {
    id: 'camera-controls',
    title: 'Look around and tune the world',
    body: '3RD is third-person orbit. 1ST is through the agent\'s eyes. 2ND is follow-cam behind the agent. The left rail opens World Controls for gravity, environment, and physics.',
    target: '[data-tour="camera-modes"]',
    side: 'bottom',
    onEnter: async () => {
      useUIStore.getState().setRightPanelOpen(false);
    },
  },
];

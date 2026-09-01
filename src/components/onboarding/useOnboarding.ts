/**
 * Hook for onboarding step navigation.
 * Manages step lifecycle, element targeting, and keyboard controls.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { onboardingSteps } from './onboardingSteps';
import { getElementRect } from './waitForElement';

export function useOnboarding() {
  const { active, currentStep, setCurrentStep, totalSteps, setTotalSteps, markComplete, setActive } =
    useOnboardingStore();
  const stepRef = useRef(currentStep);

  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    setTotalSteps(onboardingSteps.length);
  }, [setTotalSteps]);

  const currentStepDef = onboardingSteps[currentStep] ?? null;

  const getTargetRect = useCallback(() => {
    if (!currentStepDef) return null;
    return getElementRect(currentStepDef.target);
  }, [currentStepDef]);

  const runStepHooks = useCallback(
    async (fromStep: number, toStep: number) => {
      const from = onboardingSteps[fromStep];
      const to = onboardingSteps[toStep];
      if (from?.onExit) await from.onExit();
      if (to?.onEnter) await to.onEnter();
    },
    []
  );

  const next = useCallback(async () => {
    const cur = stepRef.current;
    if (cur >= onboardingSteps.length - 1) {
      markComplete();
      return;
    }
    const nextStep = cur + 1;
    await runStepHooks(cur, nextStep);
    setCurrentStep(nextStep);
  }, [markComplete, setCurrentStep, runStepHooks]);

  const prev = useCallback(async () => {
    const cur = stepRef.current;
    if (cur <= 0) return;
    const prevStep = cur - 1;
    await runStepHooks(cur, prevStep);
    setCurrentStep(prevStep);
  }, [setCurrentStep, runStepHooks]);

  const skip = useCallback(async () => {
    const cur = stepRef.current;
    const from = onboardingSteps[cur];
    if (from?.onExit) await from.onExit();
    markComplete();
  }, [markComplete]);

  const start = useCallback(async () => {
    setActive(true);
    setCurrentStep(0);
    const first = onboardingSteps[0];
    if (first?.onEnter) await first.onEnter();
  }, [setActive, setCurrentStep]);

  // Keyboard controls
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, next, prev, skip]);

  return {
    active,
    currentStep,
    totalSteps,
    currentStepDef,
    getTargetRect,
    next,
    prev,
    skip,
    start,
    isFirst: currentStep === 0,
    isLast: currentStep === onboardingSteps.length - 1,
  };
}

/**
 * OnboardingProvider — orchestrates the two-act onboarding flow.
 * Mount once in App.tsx. Renders nothing when inactive.
 */

import { useEffect, useState } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { WelcomeScreen } from './WelcomeScreen';
import { SpotlightOverlay } from './SpotlightOverlay';
import { SpotlightCard } from './SpotlightCard';
import { useOnboarding } from './useOnboarding';
import { synthiaToast } from '../../utils/synthiaToast';

export function OnboardingProvider() {
  const { shouldAutoStart, active, setActive, markComplete } = useOnboardingStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const onboarding = useOnboarding();

  // Auto-trigger on first visit
  useEffect(() => {
    const timer = setTimeout(() => {
      if (shouldAutoStart()) {
        setShowWelcome(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [shouldAutoStart]);

  // Handle welcome "Get started"
  const handleBegin = () => {
    setShowWelcome(false);
    setTimeout(() => {
      onboarding.start();
    }, 100);
  };

  // Handle welcome "Skip"
  const handleWelcomeSkip = () => {
    setShowWelcome(false);
    markComplete();
  };

  // Handle tour completion
  const handleFinish = async () => {
    await onboarding.skip();
    synthiaToast.success("You're set. Spawn an agent, connect a provider, give it a task.");
  };

  // Listen for "Replay introduction" events
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('synthia:onboarding-complete');
      localStorage.removeItem('synthia:onboarding-version');
      setShowWelcome(true);
    };
    window.addEventListener('synthia:replay-onboarding', handler);
    return () => window.removeEventListener('synthia:replay-onboarding', handler);
  }, []);

  // Act I: Welcome Screen
  if (showWelcome) {
    return <WelcomeScreen onBegin={handleBegin} onSkip={handleWelcomeSkip} />;
  }

  // Act II: Spotlight Tour
  if (!active || !onboarding.currentStepDef) return null;

  const targetRect = onboarding.getTargetRect();

  return (
    <>
      <SpotlightOverlay targetRect={targetRect} active={true} />
      {targetRect && (
        <SpotlightCard
          step={onboarding.currentStepDef}
          targetRect={targetRect}
          currentStep={onboarding.currentStep}
          totalSteps={onboarding.totalSteps}
          isFirst={onboarding.isFirst}
          isLast={onboarding.isLast}
          onNext={onboarding.isLast ? handleFinish : onboarding.next}
          onPrev={onboarding.prev}
          onSkip={handleFinish}
        />
      )}
    </>
  );
}

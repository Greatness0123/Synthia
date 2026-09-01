/**
 * Spotlight tour card.
 * Positioned relative to the highlighted element.
 * Mono-styled with progress dots, back/next/skip navigation.
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OnboardingStep } from './onboardingSteps';

interface SpotlightCardProps {
  step: OnboardingStep;
  targetRect: DOMRect | null;
  currentStep: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

function computePosition(
  targetRect: DOMRect,
  side: OnboardingStep['side'],
  cardWidth: number,
  cardHeight: number
): { top: number; left: number; arrowSide: 'top' | 'bottom' | 'left' | 'right' } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;
  const padding = 12;

  let top = 0;
  let left = 0;
  let arrowSide: 'top' | 'bottom' | 'left' | 'right' = side;

  switch (side) {
    case 'bottom': {
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      break;
    }
    case 'top': {
      top = targetRect.top - gap - cardHeight;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      break;
    }
    case 'left': {
      top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
      left = targetRect.left - gap - cardWidth;
      break;
    }
    case 'right': {
      top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
      left = targetRect.right + gap;
      break;
    }
  }

  // Clamp to viewport
  if (left < padding) left = padding;
  if (left + cardWidth > vw - padding) left = vw - padding - cardWidth;
  if (top < padding) {
    // Flip to opposite side if no room
    if (side === 'top') {
      top = targetRect.bottom + gap;
      arrowSide = 'bottom';
    } else if (side === 'bottom') {
      top = targetRect.top - gap - cardHeight;
      arrowSide = 'top';
    } else {
      top = padding;
    }
  }
  if (top + cardHeight > vh - padding) {
    top = vh - padding - cardHeight;
  }

  return { top, left, arrowSide };
}

export function SpotlightCard({
  step,
  targetRect,
  currentStep,
  totalSteps,
  isFirst,
  isLast,
  onNext,
  onPrev,
  onSkip,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState<{ w: number; h: number } | null>(null);

  // Compute position — use measured size if available, otherwise estimate
  const CARD_W = 340;
  const CARD_H = 220;
  const pos = (() => {
    if (!targetRect) return null;
    const w = measuredSize?.w ?? CARD_W;
    const h = measuredSize?.h ?? CARD_H;
    return computePosition(targetRect, step.side, w, h);
  })();

  // After mount, measure actual card size and recalculate
  useEffect(() => {
    if (!targetRect || !cardRef.current) return;
    setMeasuredSize({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
  }, [targetRect, step.id]);

  // Recalculate on resize
  useEffect(() => {
    if (!targetRect || !cardRef.current) return;
    const handler = () => {
      if (cardRef.current) {
        setMeasuredSize({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [targetRect, step.side]);

  if (!targetRect || !pos) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 4 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="fixed z-[151] w-[340px] max-w-[calc(100vw-2rem)]"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-labelledby={`tour-title-${step.id}`}
        aria-describedby={`tour-body-${step.id}`}
      >
        <div className="relative bg-bg-panel/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/40">

          {/* Header: progress + skip */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    i === currentStep ? 'bg-white w-4' : i < currentStep ? 'bg-white/40' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={onSkip}
              className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors focus:outline-none"
            >
              Skip tour
            </button>
          </div>

          {/* Title */}
          <h3
            id={`tour-title-${step.id}`}
            className="text-[15px] font-semibold text-text-primary mb-2 leading-snug"
          >
            {step.title}
          </h3>

          {/* Body */}
          <p
            id={`tour-body-${step.id}`}
            className="text-[13px] text-text-secondary leading-relaxed mb-5"
          >
            {step.body}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={isFirst}
              className={`px-4 py-1.5 text-[12px] font-medium rounded-lg border transition-all focus:outline-none ${
                isFirst
                  ? 'border-white/5 text-text-tertiary/40 cursor-not-allowed'
                  : 'border-white/10 text-text-secondary hover:text-text-primary hover:border-white/20'
              }`}
            >
              Back
            </button>

            <button
              onClick={onNext}
              className="px-5 py-1.5 text-[12px] font-medium rounded-lg bg-white text-black hover:bg-white/90 active:scale-[0.97] transition-all focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * SVG mask overlay that creates the spotlight cutout.
 * Renders a full-screen dim layer with a transparent hole at the target element.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SpotlightOverlayProps {
  targetRect: DOMRect | null;
  active: boolean;
  padding?: number;
  radius?: number;
}

export function SpotlightOverlay({
  targetRect,
  active,
  padding = 8,
  radius = 12,
}: SpotlightOverlayProps) {
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const recalc = useCallback(() => {
    setWindowSize({ w: window.innerWidth, h: window.innerHeight });
  }, []);

  useEffect(() => {
    if (!active) return;
    const onResize = () => recalc();
    const onScroll = () => recalc();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    const interval = setInterval(recalc, 100);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      clearInterval(interval);
    };
  }, [active, recalc]);

  const cutout = targetRect
    ? {
        x: Math.max(0, targetRect.left - padding),
        y: Math.max(0, targetRect.top - padding),
        w: Math.min(windowSize.w, targetRect.width + padding * 2),
        h: Math.min(windowSize.h, targetRect.height + padding * 2),
      }
    : null;

  const maskId = 'onboarding-spotlight-mask';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[150] pointer-events-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <svg
            width={windowSize.w}
            height={windowSize.h}
            className="absolute inset-0"
            style={{ pointerEvents: 'none' }}
          >
            <defs>
              <mask id={maskId}>
                {/* White = visible (the dim layer) */}
                <rect width="100%" height="100%" fill="white" />
                {/* Black = transparent (the spotlight hole) */}
                {cutout && (
                  <rect
                    x={cutout.x}
                    y={cutout.y}
                    width={cutout.w}
                    height={cutout.h}
                    rx={radius}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            {/* Dim overlay with mask cutout */}
            <rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.65)"
              mask={`url(#${maskId})`}
            />
          </svg>

          {/* Glow ring around the cutout */}
          {cutout && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="absolute rounded-xl pointer-events-none"
              style={{
                left: cutout.x - 1,
                top: cutout.y - 1,
                width: cutout.w + 2,
                height: cutout.h + 2,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 0 20px rgba(255,255,255,0.04)',
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

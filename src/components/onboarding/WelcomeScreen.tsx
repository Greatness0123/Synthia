/**
 * Act I — Welcome Screen.
 * Full-viewport first impression: logo, wordmark, tagline, and CTA.
 * Live 3D viewport visible through a dark vignette.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '../ui/Logo';
import './onboarding.css';

interface WelcomeScreenProps {
  onBegin: () => void;
  onSkip: () => void;
}

export function WelcomeScreen({ onBegin, onSkip }: WelcomeScreenProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleBegin = () => {
    setVisible(false);
    setTimeout(onBegin, 400);
  };

  const handleSkip = () => {
    setVisible(false);
    setTimeout(onSkip, 400);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          role="dialog"
          aria-labelledby="welcome-title"
          aria-describedby="welcome-desc"
        >
          {/* Dark vignette over live viewport */}
          <div className="absolute inset-0 bg-black/80" />

          {/* Subtle perspective grid at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-[30vh] onboarding-grid opacity-40 pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg">
            {/* Breathing ring behind logo */}
            <div className="relative mb-8">
              <div className="absolute inset-0 -m-6 rounded-full border border-white/[0.06] onboarding-breathe" />

              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
              >
                <Logo size={72} className="drop-shadow-[0_0_40px_rgba(255,255,255,0.08)]" />
              </motion.div>
            </div>

            {/* Wordmark */}
            <motion.h1
              id="welcome-title"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="text-3xl font-semibold tracking-[0.18em] text-text-primary uppercase mb-4 select-none"
            >
              SYNTHIA
            </motion.h1>

            {/* Tagline */}
            <motion.p
              id="welcome-desc"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="text-sm text-text-secondary mb-2 select-none"
            >
              Embodied AI in your browser
            </motion.p>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55, ease: [0.23, 1, 0.32, 1] }}
              className="text-xs text-text-tertiary leading-relaxed max-w-[360px] mb-10 select-none"
            >
              A self-aware agent with a body, senses, memory, and physics
              — running entirely in your browser.
            </motion.p>

            {/* CTA + Skip */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center gap-6"
            >
              <button
                onClick={handleBegin}
                className="px-6 py-2.5 bg-white text-black text-sm font-medium rounded-full hover:bg-white/90 active:scale-[0.97] transition-all focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-black"
              >
                Get started
              </button>

              <button
                onClick={handleSkip}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors focus:outline-none"
              >
                Skip
              </button>
            </motion.div>

            {/* Step preview dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="flex items-center gap-1.5 mt-10"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === 0 ? 'bg-white/40' : 'bg-white/10'
                  }`}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

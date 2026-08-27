import { motion, AnimatePresence } from 'framer-motion';
import { useWorldStore } from '../../store/worldStore';
import { WarningFilled } from '../ui/icons';

export const CrashOverlay = () => {
  const engineCrashed = useWorldStore((s) => s.engineCrashed);
  const crashMessage = useWorldStore((s) => s.crashMessage);

  return (
    <AnimatePresence>
      {engineCrashed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.1, type: 'spring', damping: 25, stiffness: 300 }}
            className="max-w-md w-full mx-4 bg-bg-panel border border-white/10 rounded-modal p-8 flex flex-col items-center text-center gap-5"
          >
            <WarningFilled size={48} className="text-red-400" />

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-text-primary">
                Physics Engine Crashed
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                The WASM simulation ran out of memory and the physics engine has been stopped.
                The viewport is frozen.
              </p>
            </div>

            {crashMessage && (
              <div className="w-full bg-white/5 border border-white/10 rounded-btn px-4 py-3">
                <code className="text-xs text-red-400 font-mono break-all leading-relaxed">
                  {crashMessage}
                </code>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-text-primary text-sm font-bold uppercase rounded-btn transition-colors"
            >
              Refresh Page
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

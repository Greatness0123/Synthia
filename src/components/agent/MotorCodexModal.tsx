import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Panel, cn } from '../ui/Panel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  CaretDown,
  CaretUp,
  Database,
  Trash,
} from '../ui/icons';
import { MotorCodexRegistry, MotorCodexEntry, MOTOR_CODEX_DISCLAIMER } from '../../constants/motorCodex';
import { synthiaToast } from '../../utils/synthiaToast';

export const MotorCodexModal: React.FC = () => {
  const { motorCodexModalOpen, setMotorCodexModalOpen } = useUIStore();
  const [recipes, setRecipes] = useState<MotorCodexEntry[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sync recipes from dynamic registry
  const refreshRecipes = () => {
    setRecipes(MotorCodexRegistry.getAll());
  };

  useEffect(() => {
    refreshRecipes();
    const unsubscribe = MotorCodexRegistry.subscribe(refreshRecipes);
    return () => unsubscribe();
  }, [motorCodexModalOpen]);

  if (!motorCodexModalOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => MotorCodexRegistry.register(item));
          synthiaToast.success(`Imported ${parsed.length} motion recipes.`);
        } else if (parsed && parsed.id) {
          MotorCodexRegistry.register(parsed);
          synthiaToast.success(`Imported recipe: ${parsed.title || parsed.id}`);
        } else {
          synthiaToast.error('Invalid recipe JSON format.');
        }
        refreshRecipes();
      } catch (err) {
        synthiaToast.error('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filtered = recipes.filter(
    (r) => category === 'all' || (r.category && r.category.toLowerCase() === category.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-xl max-h-[85vh] flex flex-col"
        >
          <Panel className="flex flex-col h-full overflow-hidden border border-border shadow-2xl bg-bg-surface/95 backdrop-blur-md rounded-xl p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Play size={15} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-text-primary">Motion Dictionary</h2>
                  <p className="text-[11px] text-text-tertiary">
                    {recipes.length} recipe{recipes.length === 1 ? '' : 's'} currently recorded
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMotorCodexModalOpen(false)}
                className="p-1.5 text-text-tertiary hover:text-text-primary rounded-md hover:bg-white/5 transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Actions & Filters */}
            <div className="px-5 py-3 border-b border-border bg-white/[0.01] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['all', 'locomotion', 'posture', 'aerial', 'gesture', 'expressive'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] uppercase font-mono tracking-wider transition-all border',
                        category === cat
                          ? 'bg-white/15 text-text-primary border-white/30 font-bold'
                          : 'bg-white/[0.02] text-text-tertiary border-border hover:bg-white/5'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 hover:bg-white/15 text-text-primary border border-border cursor-pointer transition-colors">
                    Import JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {recipes.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm('Reset custom recordings and restore default baseline recipes?')) {
                          MotorCodexRegistry.clear();
                          refreshRecipes();
                          synthiaToast.info('Restored default baseline recipes.');
                        }
                      }}
                      className="p-1.5 rounded text-text-tertiary hover:text-rose-400 hover:bg-rose-500/10 border border-transparent transition-colors"
                      title="Reset to default recipes"
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/20 px-3 py-1.5 rounded">
                {MOTOR_CODEX_DISCLAIMER}
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
              {filtered.length === 0 ? (
                <div className="text-center py-10 px-4 space-y-2 border border-dashed border-border rounded-xl bg-white/[0.01]">
                  <Database size={24} className="mx-auto text-text-tertiary opacity-50" />
                  <div className="text-xs font-semibold text-text-secondary">
                    No motion recipes recorded yet
                  </div>
                  <p className="text-[11px] text-text-tertiary max-w-sm mx-auto leading-relaxed">
                    Paste and run any action script in the browser console (e.g. 01_standing_and_posture.js or synthiaActions.recordAll()) to automatically capture and register recipes here.
                  </p>
                </div>
              ) : (
                filtered.map((recipe) => {
                  const isExpanded = expandedId === recipe.id;
                  return (
                    <div
                      key={recipe.id}
                      className="rounded-lg border border-border bg-white/[0.02] p-3.5 transition-all hover:border-white/20"
                    >
                      <div
                        className="flex items-start justify-between cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
                      >
                        <div className="space-y-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary">{recipe.title}</span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-text-secondary border border-border">
                              {recipe.category}
                            </span>
                          </div>
                          {recipe.summary && (
                            <p className="text-xs text-text-tertiary leading-relaxed">
                              {recipe.summary}
                            </p>
                          )}
                        </div>
                        <span className="text-text-tertiary hover:text-text-primary pt-0.5">
                          {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                          {recipe.biomechanics_note && (
                            <div className="text-[11px] text-text-secondary leading-relaxed">
                              <span className="font-semibold text-text-primary">Note: </span>
                              {recipe.biomechanics_note}
                            </div>
                          )}

                          {recipe.parameters?.recommendedSpeedMps !== undefined && (
                            <div className="text-[11px] text-text-secondary font-mono">
                              <span className="font-semibold text-text-primary">Propulsion speed: </span>
                              {recipe.parameters.recommendedSpeedMps} m/s
                            </div>
                          )}

                          {Array.isArray(recipe.steps) && recipe.steps.length > 0 && (
                            <div className="space-y-2 mt-2">
                              <div className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                                Keyframe Steps ({recipe.steps.length}):
                              </div>
                              {recipe.steps.map((step, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="p-2.5 rounded bg-black/40 border border-white/5 space-y-1 text-xs"
                                >
                                  <div className="flex items-center justify-between text-text-primary font-mono text-[11px]">
                                    <span className="font-bold">{step.phase}</span>
                                    <span className="text-text-tertiary">{step.timeOffsetMs}ms</span>
                                  </div>
                                  {step.commentary && (
                                    <div className="text-[11px] text-text-tertiary leading-relaxed">
                                      {step.commentary}
                                    </div>
                                  )}
                                  {step.overrides && (
                                    <pre className="text-[10px] font-mono text-emerald-400/90 overflow-x-auto bg-black/50 p-2 rounded mt-1 border border-white/5">
                                      {JSON.stringify(step.overrides, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-white/[0.02] flex items-center justify-between">
              <span className="text-[11px] text-text-tertiary">
                {recipes.length} recipe{recipes.length === 1 ? '' : 's'} available to AI models
              </span>
              <button
                onClick={() => setMotorCodexModalOpen(false)}
                className="h-7 px-3 rounded-btn border border-border bg-white/5 hover:bg-white/10 text-text-primary text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </Panel>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

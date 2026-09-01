/**
 * Custom numeric value input with stepper buttons and unit suffix.
 * Used for gravity, friction, and other physics parameters.
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '../../utils/cn';

interface ValueInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  className?: string;
}

export const ValueInput: React.FC<ValueInputProps> = ({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  defaultValue,
  className,
}) => {
  const [inputValue, setInputValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- sync display value when external value changes and input is not focused */
  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const handleStep = (delta: number) => {
    const next = clamp(value + delta);
    onChange(next);
    setInputValue(String(next));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    } else {
      setInputValue(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep(-step);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{label}</span>
        {defaultValue !== undefined && (
          <button
            onClick={() => { onChange(defaultValue); setInputValue(String(defaultValue)); }}
            className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            Reset
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleStep(-step)}
          className="w-7 h-7 rounded-btn bg-bg-elevated border border-border text-text-tertiary hover:text-text-primary hover:border-white/20 transition-all flex items-center justify-center text-sm font-medium"
          aria-label={`Decrease ${label}`}
        >
          -
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5 h-8 px-2 bg-bg-elevated border border-border rounded-btn">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-center text-sm font-mono text-text-primary focus:outline-none"
            aria-label={label}
          />
          {unit && <span className="text-xs text-text-tertiary shrink-0">{unit}</span>}
        </div>
        <button
          onClick={() => handleStep(step)}
          className="w-7 h-7 rounded-btn bg-bg-elevated border border-border text-text-tertiary hover:text-text-primary hover:border-white/20 transition-all flex items-center justify-center text-sm font-medium"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
};

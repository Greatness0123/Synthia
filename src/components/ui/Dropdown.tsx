import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from './Panel';

export interface DropdownItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  items: DropdownItem[];
  searchable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  value,
  onChange,
  items,
  searchable = false,
  disabled = false,
  placeholder = 'Select…',
  className,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = items.find((item) => item.value === value)?.label ?? placeholder;

  const filteredItems = useMemo(() => {
    if (!searchable || !query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query, searchable]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHighlightIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, close]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const selectItem = (item: DropdownItem) => {
    if (item.disabled) return;
    onChange(item.value);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filteredItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredItems[highlightIndex]) selectItem(filteredItems[highlightIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'w-full h-8 pl-2.5 pr-8 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-blue disabled:opacity-50 disabled:cursor-not-allowed text-left',
          triggerClassName
        )}
      >
        <span className="truncate block">{selectedLabel}</span>
        <svg className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
          <path d="M2.5 4.5L6 8l3.5-3.5H2.5z" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          ref={listRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 right-0 top-full mt-1 z-[130] max-h-[280px] overflow-y-auto rounded-btn border border-border bg-bg-elevated shadow-lg custom-scrollbar"
        >
          {searchable && (
            <div className="p-2 border-b border-border-subtle sticky top-0 bg-bg-elevated">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search…"
                className="w-full h-7 px-2 bg-bg-panel border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                autoFocus
              />
            </div>
          )}
          {filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-tertiary">No matches</div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                disabled={item.disabled}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => selectItem(item)}
                className={cn(
                  'w-full px-2.5 py-1.5 text-left text-xs transition-colors',
                  item.disabled && 'opacity-40 cursor-not-allowed',
                  item.value === value && 'bg-accent-blue/10 text-accent-blue font-medium',
                  item.value !== value && index === highlightIndex && 'bg-bg-hover text-text-primary',
                  item.value !== value && index !== highlightIndex && 'text-text-secondary hover:bg-bg-hover'
                )}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

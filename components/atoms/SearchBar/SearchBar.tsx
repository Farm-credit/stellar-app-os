'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/atoms/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

/**
 * Props for SearchBar component
 */
export interface SearchBarProps {
  /** Initial value for the search input */
  initialValue?: string;
  /** Callback triggered when the input value changes */
  onChange?: (value: string) => void;
  /** Callback triggered when the debounced value changes */
  onSearch?: (debouncedValue: string) => void;
  /** Delay for debouncing in milliseconds (initialValue 300ms) */
  debounceDelay?: number;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the search is currently in progress */
  isLoading?: boolean;
  /** Optional class name for the container */
  className?: string;
  /** Description for accessibility (results count, etc.) */
  statusMessage?: string;
}

/**
 * SearchBar atom component
 *
 * Features:
 * - Debounced input
 * - Clear button
 * - Loading indicator
 * - Cmd/Ctrl+K keyboard shortcut to focus
 * - Accessible with ARIA live region
 */
export function SearchBar({
  initialValue = '',
  onChange,
  onSearch,
  debounceDelay = 300,
  placeholder = 'Search projects... (Cmd+K)',
  isLoading = false,
  className,
  statusMessage,
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, debounceDelay);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus with Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update effect for debounced value
  useEffect(() => {
    if (onSearch) {
      onSearch(debouncedValue);
    }
  }, [debouncedValue, onSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const clearSearch = () => {
    setValue('');
    if (onChange) onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative w-full max-w-sm', className)} role="search">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-navy/60 pointer-events-none">
          <Search size={18} />
        </div>

        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="pl-10 pr-10 border-stellar-blue/20 hover:border-stellar-blue/40 focus:border-stellar-blue"
          aria-label="Search"
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : value ? (
            <button
              type="button"
              onClick={clearSearch}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
              aria-label="Clear search"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <div className="hidden sm:flex pointer-events-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 dark:bg-slate-900">
              <span className="text-xs">⌘</span>K
            </div>
          )}
        </div>
      </div>

      {/* ARIA Live region for screen readers */}
      <div className="sr-only" role="status" aria-live="polite">
        {statusMessage || (value ? `Searching for ${value}` : '')}
      </div>
    </div>
  );
}

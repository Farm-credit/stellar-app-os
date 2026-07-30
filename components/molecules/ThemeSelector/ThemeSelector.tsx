'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Theme } from '@/types/settings';

type ThemeOption = {
  value: Theme;
  label: string;
  description: string;
  icon: React.ReactNode;
  preview: React.ReactNode;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright, clean interface',
    icon: <Sun className="h-4 w-4" aria-hidden="true" />,
    preview: (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-md bg-white p-2">
        <div className="h-2 w-2/3 rounded-sm bg-[#0d0b21]" />
        <div className="h-1.5 w-full rounded-sm bg-[#e2e8f0]" />
        <div className="h-1.5 w-4/5 rounded-sm bg-[#e2e8f0]" />
        <div className="mt-auto h-3 w-1/2 rounded-sm bg-[#14b6e7]" />
      </div>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Easy on the eyes at night',
    icon: <Moon className="h-4 w-4" aria-hidden="true" />,
    preview: (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-md bg-[#0d0b21] p-2">
        <div className="h-2 w-2/3 rounded-sm bg-[#f1f5f9]" />
        <div className="h-1.5 w-full rounded-sm bg-[#1e1b3a]" />
        <div className="h-1.5 w-4/5 rounded-sm bg-[#1e1b3a]" />
        <div className="mt-auto h-3 w-1/2 rounded-sm bg-[#14b6e7]" />
      </div>
    ),
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your device settings',
    icon: <Monitor className="h-4 w-4" aria-hidden="true" />,
    preview: (
      <div className="relative h-full w-full overflow-hidden rounded-md">
        <div className="absolute inset-0 flex">
          <div className="flex w-1/2 flex-col gap-1 bg-white p-1.5">
            <div className="h-1.5 w-3/4 rounded-sm bg-[#0d0b21]" />
            <div className="h-1 w-full rounded-sm bg-[#e2e8f0]" />
          </div>
          <div className="flex w-1/2 flex-col gap-1 bg-[#0d0b21] p-1.5">
            <div className="h-1.5 w-3/4 rounded-sm bg-[#f1f5f9]" />
            <div className="h-1 w-full rounded-sm bg-[#1e1b3a]" />
          </div>
        </div>
      </div>
    ),
  },
];

export type ThemeSelectorProps = {
  value: Theme;
  onChange: (theme: Theme) => void;
  className?: string;
  label?: string;
  description?: string;
};

export function ThemeSelector({
  value,
  onChange,
  className,
  label = 'Theme',
  description = 'Choose how FarmCredit looks. Changes apply immediately and are saved to your browser.',
}: ThemeSelectorProps) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {description && (
        <p id="theme-selector-description" className="text-xs text-muted-foreground">
          {description}
        </p>
      )}

      <div
        role="radiogroup"
        aria-label={label}
        aria-describedby={description ? 'theme-selector-description' : undefined}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${option.label} theme — ${option.description}`}
              onClick={() => onChange(option.value)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl p-3 text-left transition-all duration-200',
                'glass-surface hover:bg-glass-surface-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSelected && 'glass-surface-selected ring-2 ring-primary/40'
              )}
            >
              <div
                className="mb-3 h-16 w-full overflow-hidden rounded-lg border border-glass-border bg-background/50"
                aria-hidden="true"
              >
                {option.preview}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {option.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {option.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </div>

              {isSelected && (
                <span
                  className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                    <path d="M10.28 2.28a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L1.72 6.34a.75.75 0 1 1 1.06-1.06l1.97 1.97 4.72-4.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

ThemeSelector.displayName = 'ThemeSelector';

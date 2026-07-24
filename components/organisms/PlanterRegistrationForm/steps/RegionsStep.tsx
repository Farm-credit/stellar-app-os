'use client';

import { Controller } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { OPERATING_REGIONS } from '@/lib/types/planter';
import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';
import { CheckCircle2 } from 'lucide-react';

interface RegionsStepProps {
  form: UseFormReturn<PlanterRegistrationFormData>;
}

/**
 * Step 3 — Operating Regions
 *
 * Multi-select grid of region toggle cards. Minimum 1 region required.
 * Each toggle is managed by react-hook-form via Controller so the
 * regions array in form state stays in sync.
 */
export function RegionsStep({ form }: RegionsStepProps) {
  return (
    <Controller
      control={form.control}
      name="regions"
      render={({ field, fieldState }) => {
        const selected = new Set(field.value ?? []);

        const toggle = (id: string) => {
          const next = new Set(selected);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          field.onChange(Array.from(next));
        };

        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select all regions where you are able to plant trees. You can update this later.
            </p>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="group"
              aria-label="Operating regions"
            >
              {OPERATING_REGIONS.map((region) => {
                const isSelected = selected.has(region.id);
                return (
                  <button
                    key={region.id}
                    type="button"
                    id={`region-${region.id}`}
                    aria-pressed={isSelected}
                    onClick={() => toggle(region.id)}
                    className={cn(
                      'relative text-left rounded-2xl border-2 p-4 transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
                      isSelected
                        ? 'border-stellar-blue bg-stellar-blue/10 shadow-sm shadow-stellar-blue/20'
                        : 'border-border hover:border-stellar-blue/40 hover:bg-muted/50'
                    )}
                  >
                    {/* Selected checkmark */}
                    {isSelected && (
                      <span className="absolute top-3 right-3 text-stellar-blue">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    )}

                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none" role="img" aria-hidden="true">
                        {region.emoji}
                      </span>
                      <div>
                        <p
                          className={cn('font-semibold text-sm', isSelected && 'text-stellar-blue')}
                        >
                          {region.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {region.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              {fieldState.error ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldState.error.message}
                </p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {selected.size} region{selected.size !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}

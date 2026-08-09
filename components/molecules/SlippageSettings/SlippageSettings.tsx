'use client';

import React, { useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/atoms/Input';
import { Button } from '@/components/atoms/Button';

interface SlippageSettingsProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const PRESETS = [
  { label: '0.5%', value: 0.005 },
  { label: '1%', value: 0.01 },
  { label: '2%', value: 0.02 },
];

export function SlippageSettings({ value, onChange, disabled }: SlippageSettingsProps) {
  const [customValue, setCustomValue] = useState<string>('');
  const [customError, setCustomError] = useState<string>('');

  const handlePresetSelect = useCallback(
    (presetValue: number) => {
      setCustomValue('');
      setCustomError('');
      onChange(presetValue);
    },
    [onChange]
  );

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setCustomValue(raw);

      if (raw === '') {
        setCustomError('');
        return;
      }

      const num = parseFloat(raw);
      if (isNaN(num) || num < 0) {
        setCustomError('Must be a positive number');
      } else if (num > 0.5) {
        setCustomError('Cannot exceed 50%');
      } else {
        setCustomError('');
        onChange(num);
      }
    },
    [onChange]
  );

  const handleCustomBlur = useCallback(() => {
    if (customValue === '') {
      return;
    }
    const num = parseFloat(customValue);
    if (isNaN(num) || num < 0 || num > 0.5) {
      setCustomError('Enter a value between 0 and 50%');
      onChange(value);
    } else {
      setCustomError('');
      onChange(num);
    }
  }, [customValue, onChange, value]);

  const isCustomActive =
    value !== PRESETS[0].value && value !== PRESETS[1].value && value !== PRESETS[2].value;

  return (
    <div className="space-y-3" role="group" aria-label="Slippage tolerance settings">
      <Label id="slippage-label" className="text-sm font-medium">
        Slippage Tolerance
      </Label>
      <div className="flex gap-2" role="radiogroup" aria-labelledby="slippage-label">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={value === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetSelect(preset.value)}
            disabled={disabled}
            role="radio"
            aria-checked={value === preset.value}
            aria-label={`Slippage tolerance ${preset.label}`}
            className="flex-1"
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="custom-slippage" className="text-xs text-muted-foreground">
          Custom
        </Label>
        <Input
          id="custom-slippage"
          type="number"
          step="0.01"
          min="0"
          max="0.5"
          placeholder="e.g. 0.015"
          value={customValue}
          onChange={handleCustomChange}
          onBlur={handleCustomBlur}
          disabled={disabled}
          aria-label="Custom slippage tolerance as a decimal"
          aria-invalid={!!customError}
          aria-describedby={customError ? 'custom-slippage-error' : undefined}
          className="w-24 h-8 text-xs"
        />
        <span className="text-xs text-muted-foreground">%</span>
        {customError && (
          <span id="custom-slippage-error" className="text-xs text-destructive" role="alert">
            {customError}
          </span>
        )}
      </div>
      {isCustomActive && !customError && (
        <p className="text-xs text-muted-foreground">
          Using custom slippage: {(value * 100).toFixed(2)}%
        </p>
      )}
    </div>
  );
}

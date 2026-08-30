'use client';

import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { Select } from '@/components/atoms/Select';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { getSupportedTimeZones, groupTimeZones } from '@/lib/timezone';
import { cn } from '@/lib/utils';

interface TimeZoneSelectProps {
  className?: string;
  /** Compact variant for header/footer embeds (no label wrapper). */
  compact?: boolean;
}

/**
 * Timezone preference picker. Offers browser auto-detection (default) plus a
 * full list of IANA timezones grouped by region for manual override. The
 * choice is persisted in localStorage via the TimeZoneContext.
 */
export function TimeZoneSelect({ className, compact = false }: TimeZoneSelectProps) {
  const { timeZone, mode, detectedTimeZone, setTimeZone, resetToAuto } = useTimeZone();
  const groups = useMemo(() => groupTimeZones(getSupportedTimeZones()), []);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {!compact && <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <Select
        aria-label="Display timezone"
        value={mode === 'auto' ? '__auto__' : timeZone}
        onChange={(event) => {
          const value = event.target.value;
          if (value === '__auto__') {
            resetToAuto();
          } else {
            setTimeZone(value);
          }
        }}
        className="w-full"
      >
        <option value="__auto__">Auto-detect ({detectedTimeZone})</option>
        {groups.map((group) => (
          <optgroup key={group.region} label={group.region}>
            {group.zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}

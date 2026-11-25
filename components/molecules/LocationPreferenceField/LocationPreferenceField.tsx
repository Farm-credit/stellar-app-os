'use client';

import { Globe2, MapPin, Info } from 'lucide-react';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import { PREFERRED_PLANTING_REGIONS } from '@/lib/planting-location-requests/schemas';
import type { LocationPreference } from '@/lib/types/donor';

export interface LocationPreferenceFieldProps {
  value: LocationPreference;
  onChange: (_next: Partial<LocationPreference>) => void;
}

export function LocationPreferenceField({ value, onChange }: LocationPreferenceFieldProps) {
  const isCustomRegion =
    Boolean(value.preferredRegion) &&
    !PREFERRED_PLANTING_REGIONS.some((opt) => opt.value === value.preferredRegion);

  const selectValue = isCustomRegion ? '__custom__' : value.preferredRegion;

  return (
    <div
      className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5"
      data-testid="location-preference-field"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stellar-green/10">
          <Globe2 className="h-4 w-4 text-stellar-green" aria-hidden="true" />
        </div>
        <div>
          <label
            htmlFor="preferred-planting-region"
            className="text-sm font-semibold text-foreground"
          >
            Preferred Planting Region or Country{' '}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Text variant="small" className="text-muted-foreground">
            Request where you would like your trees planted, subject to active project availability.
          </Text>
        </div>
      </div>

      {/* Region dropdown */}
      <div className="space-y-1.5">
        <select
          id="preferred-planting-region"
          aria-label="Preferred planting region"
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === '__custom__') {
              onChange({ preferredRegion: 'Other' });
            } else {
              onChange({ preferredRegion: next });
            }
          }}
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2"
        >
          <option value="">No preference — plant where needed most</option>
          {PREFERRED_PLANTING_REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
          <option value="__custom__">Other region or specific country...</option>
        </select>
      </div>

      {/* Country / custom region input */}
      {(value.preferredRegion !== '' || value.preferredCountry !== '') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="preferred-planting-country"
              className="flex items-center gap-1.5 text-xs font-medium text-foreground"
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Specific country or area (optional)
            </label>
            <Input
              id="preferred-planting-country"
              type="text"
              placeholder="e.g., Nigeria, Brazil, Kenya"
              value={value.preferredCountry}
              onChange={(e) => onChange({ preferredCountry: e.target.value })}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="preferred-planting-notes"
              className="text-xs font-medium text-foreground"
            >
              Additional notes (optional)
            </label>
            <Input
              id="preferred-planting-notes"
              type="text"
              placeholder="e.g., coastal mangroves or watershed"
              value={value.preferenceNotes}
              onChange={(e) => onChange({ preferenceNotes: e.target.value })}
              maxLength={500}
            />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground border border-border/60">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stellar-blue" aria-hidden="true" />
        <span>
          Preferences are subject to planting zone capacity. Our team will notify you by email once
          a matching location is confirmed or an alternative zone is assigned.
        </span>
      </div>
    </div>
  );
}

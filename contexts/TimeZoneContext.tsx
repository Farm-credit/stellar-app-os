'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  detectTimeZone,
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatRelativeTime,
  getTimeZoneAbbreviation,
  getTimeZoneOffsetLabel,
  loadTimeZonePreference,
  resetTimeZonePreference,
  saveTimeZonePreference,
  type TimeZoneMode,
} from '@/lib/timezone';

interface TimeZoneContextValue {
  /** The active IANA timezone used for formatting. */
  timeZone: string;
  /** 'auto' = browser-detected, 'manual' = user override. */
  mode: TimeZoneMode;
  /** The timezone detected from the browser (before any override). */
  detectedTimeZone: string;
  /** True once the client has hydrated and the preference is resolved. */
  isReady: boolean;
  /** Manually override the timezone. Persists to localStorage. */
  setTimeZone: (timeZone: string) => void;
  /** Switch back to browser auto-detection. Clears the override. */
  resetToAuto: () => void;
  /** Short date, e.g. "12 Mar 2024". */
  formatDate: (input: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  /** Date + time with timezone abbreviation, e.g. "12 Mar 2024, 09:00 WAT". */
  formatDateTime: (input: string | number | Date) => string;
  /** Relative time ("3h ago") falling back to a local date after a week. */
  formatRelative: (input: string | number | Date) => string;
  /** Short abbreviation, e.g. "WAT". */
  abbreviation: (input?: string | number | Date) => string;
  /** Offset label, e.g. "UTC+1". */
  offsetLabel: (input?: string | number | Date) => string;
}

const TimeZoneContext = createContext<TimeZoneContextValue | null>(null);

export function TimeZoneProvider({ children }: { children: ReactNode }) {
  // SSR-safe initial values: resolve the real preference after hydration.
  const [preference, setPreference] = useState<{
    timeZone: string;
    mode: TimeZoneMode;
  }>({ timeZone: 'UTC', mode: 'auto' });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setPreference(loadTimeZonePreference());
    setIsReady(true);
  }, []);

  const setTimeZone = useCallback((timeZone: string) => {
    setPreference({ timeZone, mode: 'manual' });
    saveTimeZonePreference(timeZone, 'manual');
  }, []);

  const resetToAuto = useCallback(() => {
    resetTimeZonePreference();
    setPreference({ timeZone: detectTimeZone(), mode: 'auto' });
  }, []);

  const formatDate = useCallback(
    (input: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDateInTimeZone(input, preference.timeZone, options),
    [preference.timeZone]
  );

  const formatDateTime = useCallback(
    (input: string | number | Date) => formatDateTimeInTimeZone(input, preference.timeZone),
    [preference.timeZone]
  );

  const formatRelative = useCallback(
    (input: string | number | Date) => formatRelativeTime(input, preference.timeZone),
    [preference.timeZone]
  );

  const abbreviation = useCallback(
    (input?: string | number | Date) =>
      getTimeZoneAbbreviation(input ?? new Date(), preference.timeZone),
    [preference.timeZone]
  );

  const offsetLabel = useCallback(
    (input?: string | number | Date) =>
      getTimeZoneOffsetLabel(input ?? new Date(), preference.timeZone),
    [preference.timeZone]
  );

  const value = useMemo<TimeZoneContextValue>(
    () => ({
      timeZone: preference.timeZone,
      mode: preference.mode,
      detectedTimeZone: detectTimeZone(),
      isReady,
      setTimeZone,
      resetToAuto,
      formatDate,
      formatDateTime,
      formatRelative,
      abbreviation,
      offsetLabel,
    }),
    [
      preference.timeZone,
      preference.mode,
      isReady,
      setTimeZone,
      resetToAuto,
      formatDate,
      formatDateTime,
      formatRelative,
      abbreviation,
      offsetLabel,
    ]
  );

  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): TimeZoneContextValue {
  const context = useContext(TimeZoneContext);
  if (!context) {
    throw new Error('useTimeZone must be used within a <TimeZoneProvider>');
  }
  return context;
}

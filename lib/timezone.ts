/**
 * Timezone utilities for displaying timestamps in the user's local timezone.
 *
 * Every timestamp in the app is stored/transmitted as UTC (ISO-8601). These
 * helpers render those timestamps in the sponsor's preferred timezone — either
 * the one auto-detected from the browser or a manually chosen override.
 *
 * The module is intentionally free of React/Next.js imports so it can be unit
 * tested and reused anywhere (client components, contexts, hooks).
 */

export type TimeZoneMode = 'auto' | 'manual';

/** localStorage keys used to persist the timezone preference. */
export const TIMEZONE_STORAGE_KEY = 'farmcredit-timezone';
export const TIMEZONE_MODE_STORAGE_KEY = 'farmcredit-timezone-mode';

/** Fallback list used when `Intl.supportedValuesOf` is unavailable. */
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Africa/Abidjan',
  'Africa/Accra',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Kampala',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Argentina/Buenos_Aires',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Warsaw',
  'Pacific/Auckland',
] as const;

/**
 * Detect the user's timezone from the browser. Returns 'UTC' during SSR or
 * when the Intl API is unavailable so server render matches client render.
 */
export function detectTimeZone(): string {
  if (typeof window === 'undefined') return 'UTC';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Return the full list of IANA timezones supported by the runtime, falling
 * back to a curated common list on older engines.
 */
export function getSupportedTimeZones(): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      // fall through to fallback list
    }
  }
  return [...FALLBACK_TIME_ZONES];
}

/** Group timezones by their region prefix (e.g. "Africa", "America"). */
export function groupTimeZones(timeZones: string[]): { region: string; zones: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const zone of timeZones) {
    const slashIndex = zone.indexOf('/');
    const region = slashIndex === -1 ? 'General' : zone.slice(0, slashIndex);
    const list = groups.get(region) ?? [];
    list.push(zone);
    groups.set(region, list);
  }
  return [...groups.entries()]
    .map(([region, zones]) => ({
      region,
      zones: zones.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * Extract the short timezone abbreviation (e.g. "WAT", "EST", "GMT+1") for a
 * given instant and IANA timezone.
 */
export function getTimeZoneAbbreviation(input: string | number | Date, timeZone: string): string {
  const date = toDate(input);
  if (!isValidDate(date)) return timeZone;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * Return the UTC offset of a timezone at a given instant, e.g. "UTC+1" or
 * "UTC-5:30".
 */
export function getTimeZoneOffsetLabel(input: string | number | Date, timeZone: string): string {
  const date = toDate(input);
  if (!isValidDate(date)) return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    if (offset) return offset.replace('GMT', 'UTC');
    return 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Format an instant (Date, ISO string or epoch ms) into a given IANA timezone.
 * Falls back to plain UTC formatting when the timezone is invalid.
 */
export function formatInTimeZone(
  input: string | number | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = toDate(input);
  if (!isValidDate(date)) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      ...options,
    }).format(date);
  }
}

/** Short date in the given timezone, e.g. "12 Mar 2024". */
export function formatDateInTimeZone(
  input: string | number | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return formatInTimeZone(input, timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/**
 * Full date + time in the given timezone including a timezone abbreviation,
 * e.g. "12 Mar 2024, 09:00 WAT". Use this for tree milestones and activity.
 */
export function formatDateTimeInTimeZone(input: string | number | Date, timeZone: string): string {
  const date = toDate(input);
  const dateTime = formatInTimeZone(date, timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateTime} ${getTimeZoneAbbreviation(date, timeZone)}`;
}

/**
 * Relative time (e.g. "3h ago", "2d ago") computed against `now`, falling back
 * to an absolute local-timezone date for anything older than a week.
 */
export function formatRelativeTime(
  input: string | number | Date,
  timeZone: string,
  now: Date = new Date()
): string {
  const date = toDate(input);
  if (!isValidDate(date)) return '—';

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDateInTimeZone(date, timeZone);
}

export interface TimeZonePreference {
  timeZone: string;
  mode: TimeZoneMode;
}

/**
 * Load the persisted timezone preference. When no override exists, returns
 * `mode: 'auto'` with the browser-detected zone.
 */
export function loadTimeZonePreference(): TimeZonePreference {
  if (typeof window === 'undefined') {
    return { timeZone: 'UTC', mode: 'auto' };
  }
  const mode = window.localStorage.getItem(TIMEZONE_MODE_STORAGE_KEY) as TimeZoneMode | null;
  const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
  const detected = detectTimeZone();

  if (mode === 'manual' && stored) {
    return { timeZone: stored, mode: 'manual' };
  }
  return { timeZone: detected, mode: 'auto' };
}

/** Persist the timezone preference to localStorage. */
export function saveTimeZonePreference(timeZone: string, mode: TimeZoneMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timeZone);
    window.localStorage.setItem(TIMEZONE_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (private mode / storage disabled)
  }
}

/** Clear any persisted manual override so auto-detection resumes. */
export function resetTimeZonePreference(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TIMEZONE_STORAGE_KEY);
    window.localStorage.removeItem(TIMEZONE_MODE_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/** Validate that a string is a usable IANA timezone identifier. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

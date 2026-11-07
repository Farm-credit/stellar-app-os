/**
 * Conservation-status domain logic — Issue #1657.
 *
 * Everything here is pure (no DB, no network, no env access) so the quarterly
 * checker, the alert API and the tests can all share the same rules for what
 * counts as threatened, when an alert is warranted, and how it is worded.
 */

/** IUCN Red List category codes, from most to least severe. */
export type IucnCategoryCode = 'EX' | 'EW' | 'CR' | 'EN' | 'VU' | 'NT' | 'LC' | 'DD' | 'NE';

/** Population trend as reported by the IUCN Red List. */
export type PopulationTrend = 'Increasing' | 'Stable' | 'Decreasing' | 'Unknown';

export const IUCN_CATEGORY_LABELS: Record<IucnCategoryCode, string> = {
  EX: 'Extinct',
  EW: 'Extinct in the Wild',
  CR: 'Critically Endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near Threatened',
  LC: 'Least Concern',
  DD: 'Data Deficient',
  NE: 'Not Evaluated',
};

/** Human-readable label for each IUCN category code. */
export function categoryLabel(code: IucnCategoryCode): string {
  return IUCN_CATEGORY_LABELS[code];
}

/**
 * Severity ordering used to detect an "upgrade" to a more threatened category.
 * Higher is more severe. DD/NE sit below NT so a move from Not Evaluated to
 * Vulnerable is a listing, not a downgrade.
 */
export const IUCN_CATEGORY_SEVERITY: Record<IucnCategoryCode, number> = {
  EX: 8,
  EW: 7,
  CR: 6,
  EN: 5,
  VU: 4,
  NT: 3,
  DD: 2,
  NE: 1,
  LC: 0,
};

/**
 * Categories that count as "threatened" under the IUCN definition
 * (Vulnerable, Endangered, Critically Endangered).
 */
export const THREATENED_CATEGORIES: readonly IucnCategoryCode[] = ['VU', 'EN', 'CR'];

const CATEGORY_CODES = new Set<string>(Object.keys(IUCN_CATEGORY_LABELS));

/** Narrowing guard: is `value` a recognised IUCN category code? */
export function isIucnCategoryCode(value: unknown): value is IucnCategoryCode {
  return typeof value === 'string' && CATEGORY_CODES.has(value);
}

/** Is this category one of the threatened tiers (VU / EN / CR)? */
export function isThreatenedCategory(code: IucnCategoryCode): boolean {
  return THREATENED_CATEGORIES.includes(code);
}

// ── Change detection ─────────────────────────────────────────────────────────

export type ConservationAlertKind = 'newly_listed' | 'upgraded';

export interface ConservationChange {
  kind: ConservationAlertKind;
  previousStatusCode: IucnCategoryCode | null;
  newStatusCode: IucnCategoryCode;
}

/**
 * Decide whether a freshly fetched assessment should raise a sponsor alert.
 *
 * A species alerts when it becomes threatened and was not threatened before
 * (a new listing), or when it is already threatened and moves to a more
 * severe tier (an upgrade). Moves that reduce severity — e.g. EN → VU, or
 * VU → LC — and changes that stay within a single quarter never alert.
 *
 * @param previous - Previously cached category, or null when the species has
 *                   never been assessed by us.
 * @param next     - Category just fetched from the IUCN Red List.
 */
export function detectConservationChange(
  previous: IucnCategoryCode | null | undefined,
  next: IucnCategoryCode
): ConservationChange | null {
  if (!isThreatenedCategory(next)) return null;

  // No cached assessment: treat as a brand-new listing.
  if (!previous || !isIucnCategoryCode(previous)) {
    return { kind: 'newly_listed', previousStatusCode: null, newStatusCode: next };
  }

  // Already threatened previously.
  if (isThreatenedCategory(previous)) {
    const upgraded = IUCN_CATEGORY_SEVERITY[next] > IUCN_CATEGORY_SEVERITY[previous];
    return upgraded
      ? { kind: 'upgraded', previousStatusCode: previous, newStatusCode: next }
      : null;
  }

  // Not threatened before, threatened now.
  return { kind: 'newly_listed', previousStatusCode: previous, newStatusCode: next };
}

// ── Priority ─────────────────────────────────────────────────────────────────

/** Priority used for the in-app notification and the urgency of the email. */
export type ConservationAlertPriority = 'medium' | 'high';

/**
 * Critically Endangered, Endangered and anything extinct-bound is high
 * priority; Vulnerable is medium. Near Threatened and below never alert.
 */
export function alertPriorityFor(code: IucnCategoryCode): ConservationAlertPriority {
  return code === 'VU' ? 'medium' : 'high';
}

// ── Quarterly windows ────────────────────────────────────────────────────────

/** Label for the calendar quarter containing `date`, e.g. "2026-Q4". */
export function quarterLabel(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/** Label for the quarter immediately before `label`. */
export function previousQuarterLabel(label: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(label);
  if (!match) throw new Error(`Invalid quarter label: ${label}`);

  const year = Number(match[1]);
  const quarter = Number(match[2]);
  if (quarter > 1) return `${year}-Q${quarter - 1}`;
  return `${year - 1}-Q4`;
}

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * Canonical URL of the platform's educational page for a species. This is the
 * link carried by every alert so sponsors can read the conservation context.
 */
export function speciesEducationPath(slug: string): string {
  return `/species/${encodeURIComponent(slug)}`;
}

/** Canonical URL of the IUCN Red List entry for a species. */
export function iucnRecordUrl(
  taxonId: number | null | undefined,
  scientificName: string
): string | null {
  if (taxonId !== null && taxonId !== undefined && Number.isFinite(taxonId)) {
    return `https://www.iucnredlist.org/species/${taxonId}`;
  }
  if (!scientificName) return null;
  return `https://www.iucnredlist.org/search?query=${encodeURIComponent(scientificName)}`;
}

// ── Messaging ────────────────────────────────────────────────────────────────

export interface ConservationAlertCopy {
  /** Email subject line. */
  subject: string;
  /** Short headline for the in-app notification. */
  headline: string;
  /** One-line summary suitable for a notification drawer / toast. */
  summary: string;
  /** Longer conservation context used by the email body. */
  body: string;
}

export interface BuildConservationCopyInput {
  change: ConservationChange;
  commonName: string;
  scientificName: string;
  populationTrend?: PopulationTrend | null;
  /** How many of the sponsor's trees carry this species. */
  treeCount: number;
  /** Quarterly window that produced the alert, e.g. "2026-Q4". */
  checkQuarter: string;
  /** Absolute URL of the species education page. */
  educationUrl: string;
  /** Absolute URL of the IUCN record, when available. */
  iucnUrl?: string | null;
}

const TREND_CONTEXT: Record<PopulationTrend, string> = {
  Increasing: 'Its population is currently increasing.',
  Stable: 'Its population is currently stable.',
  Decreasing: 'Its population is currently decreasing.',
  Unknown: 'Its population trend is not yet known.',
};

function treePlural(treeCount: number): string {
  return `${treeCount} ${treeCount === 1 ? 'tree' : 'trees'}`;
}

/**
 * Builds the subject/summary/body copy shared by the in-app notification and
 * the email, so both channels describe the same change in the same words.
 */
export function buildConservationCopy(input: BuildConservationCopyInput): ConservationAlertCopy {
  const { change, commonName, scientificName, treeCount, educationUrl } = input;
  const trend = input.populationTrend ?? 'Unknown';
  const label = categoryLabel(change.newStatusCode);
  const subject =
    change.kind === 'upgraded'
      ? `${commonName} is now ${label} on the IUCN Red List`
      : `${commonName} is now listed as ${label} on the IUCN Red List`;

  const headline =
    change.kind === 'upgraded'
      ? `${commonName} upgraded to ${label}`
      : `${commonName} newly listed as ${label}`;

  const summary =
    change.kind === 'upgraded'
      ? `Your ${treePlural(treeCount)} of ${scientificName} moved from ${change.previousStatusCode} to ${change.newStatusCode} (${label}).`
      : `Your ${treePlural(treeCount)} of ${scientificName} ${treeCount === 1 ? 'is' : 'are'} now of a species listed as ${label} (${change.newStatusCode}).`;

  const previousSentence =
    change.kind === 'upgraded' && change.previousStatusCode
      ? `In our ${input.checkQuarter} conservation check, ${commonName} (${scientificName}) moved from ${
          IUCN_CATEGORY_LABELS[change.previousStatusCode]
        } to ${label}.`
      : `In our ${input.checkQuarter} conservation check, ${commonName} (${scientificName}) was found to be listed as ${label} on the IUCN Red List.`;

  const body = [
    previousSentence,
    `${scientificName} is classified as ${label} (${change.newStatusCode}).`,
    TREND_CONTEXT[trend],
    `You sponsor ${treePlural(treeCount)} of this species, and that planting now contributes directly to in-situ conservation of a threatened tree.`,
    `Learn what the listing means and how this species is being protected: ${educationUrl}`,
    input.iucnUrl ? `IUCN Red List assessment: ${input.iucnUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, headline, summary, body };
}

/** Builds the relative path used by the in-app notification action button. */
export function alertActionPath(slug: string): string {
  return speciesEducationPath(slug);
}

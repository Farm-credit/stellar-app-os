/**
 * Input validation for community forest projects (Issue #1646).
 *
 * The rules follow the conventions used by the rest of the app: a plain
 * `Error` subclass carrying the HTTP status, throwing on the first problem so
 * the route handler can turn it into `{ error: message }`.
 */

import { findBaseProject } from './project-catalogue';

export const COMMUNITY_FOREST_NAME_MIN_LENGTH = 2;
export const COMMUNITY_FOREST_NAME_MAX_LENGTH = 80;
export const COMMUNITY_FOREST_DESCRIPTION_MAX_LENGTH = 500;
export const COMMUNITY_FOREST_DISPLAY_NAME_MAX_LENGTH = 80;

/**
 * Stellar public keys, mirroring the sponsor-team wallet rule so a sponsor
 * wallet is valid everywhere it is used.
 */
const STELLAR_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

/** Error carrying the HTTP status the API should answer with. */
export class CommunityForestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CommunityForestError';
    this.status = status;
  }
}

/** True when the value looks like a Stellar public key. */
export function isValidSponsorWallet(wallet: string): boolean {
  return STELLAR_ADDRESS_PATTERN.test(wallet.trim());
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new CommunityForestError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new CommunityForestError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/** Payload accepted by `POST /api/community-forests`. */
export interface CreateCommunityForestInput {
  name: string;
  description?: string;
  /** Id (or slug) of the platform project the community forest grows from. */
  baseProjectId: string;
  /** Partner organisation claiming the creation, when it is not an admin. */
  organisationId?: string;
  /** Contact email of the claiming organisation — proof of control. */
  organisationContactEmail?: string;
  /** Sponsor wallet that becomes the first member of the project. */
  ownerWallet?: string;
}

/** Validates and normalises the project creation payload. */
export function parseCreateCommunityForestInput(
  body: Record<string, unknown>
): CreateCommunityForestInput {
  const name = optionalString(body.name, 'name', COMMUNITY_FOREST_NAME_MAX_LENGTH);
  if (!name) {
    throw new CommunityForestError('name is required');
  }
  if (name.length < COMMUNITY_FOREST_NAME_MIN_LENGTH) {
    throw new CommunityForestError(
      `name must be at least ${COMMUNITY_FOREST_NAME_MIN_LENGTH} characters`
    );
  }

  const baseProjectId = optionalString(body.baseProjectId, 'baseProjectId', 120);
  if (!baseProjectId) {
    throw new CommunityForestError('baseProjectId is required');
  }
  if (!findBaseProject(baseProjectId)) {
    throw new CommunityForestError(`Unknown base project: ${baseProjectId}`);
  }

  const ownerWallet = optionalString(body.ownerWallet, 'ownerWallet', 56);
  if (ownerWallet && !isValidSponsorWallet(ownerWallet)) {
    throw new CommunityForestError('ownerWallet must be a valid Stellar address');
  }

  const organisationId = optionalString(body.organisationId, 'organisationId', 120);
  const organisationContactEmail = optionalString(
    body.organisationContactEmail,
    'organisationContactEmail',
    200
  );

  return {
    name,
    description: optionalString(body.description, 'description', COMMUNITY_FOREST_DESCRIPTION_MAX_LENGTH),
    baseProjectId,
    organisationId,
    organisationContactEmail,
    ownerWallet,
  };
}

/** Payload accepted by `POST /api/community-forests/:id/members`. */
export interface JoinCommunityForestInput {
  sponsorWallet: string;
  displayName?: string;
}

/** Validates and normalises the sponsor join payload. */
export function parseJoinCommunityForestInput(
  body: Record<string, unknown>
): JoinCommunityForestInput {
  const sponsorWallet = optionalString(body.sponsorWallet, 'sponsorWallet', 56);
  if (!sponsorWallet) {
    throw new CommunityForestError('sponsorWallet is required');
  }
  if (!isValidSponsorWallet(sponsorWallet)) {
    throw new CommunityForestError('sponsorWallet must be a valid Stellar address');
  }

  return {
    sponsorWallet,
    displayName: optionalString(body.displayName, 'displayName', COMMUNITY_FOREST_DISPLAY_NAME_MAX_LENGTH),
  };
}

/** Payload accepted by `POST /api/community-forests/:id/contributions`. */
export interface ContributeCommunityForestInput {
  sponsorWallet: string;
  treeRef: string;
}

/** Validates and normalises the tree contribution payload. */
export function parseContributeCommunityForestInput(
  body: Record<string, unknown>
): ContributeCommunityForestInput {
  const sponsorWallet = optionalString(body.sponsorWallet, 'sponsorWallet', 56);
  if (!sponsorWallet) {
    throw new CommunityForestError('sponsorWallet is required');
  }
  if (!isValidSponsorWallet(sponsorWallet)) {
    throw new CommunityForestError('sponsorWallet must be a valid Stellar address');
  }

  const treeRef = optionalString(body.treeRef, 'treeRef', 120);
  if (!treeRef) {
    throw new CommunityForestError('treeRef is required');
  }

  return { sponsorWallet, treeRef };
}

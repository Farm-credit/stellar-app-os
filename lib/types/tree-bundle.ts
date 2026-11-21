import type { TreeSpecies } from './tree';

/** A single species entry within a bundle definition. */
export interface BundleSpeciesSlot {
  species: TreeSpecies;
  quantity: number;
  /** Estimated CO₂ offset per year for all trees of this species in the bundle. */
  totalCo2KgPerYear: number;
  /** Region where this species will be planted. */
  region: string;
}

/** Curated bundle available for purchase on the browse page. */
export interface TreeBundle {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** The different species/region combinations included. */
  slots: BundleSpeciesSlot[];
  /** Total number of trees across all slots. */
  treeCount: number;
  /** Full retail price if each tree were bought individually. */
  retailPriceUsd: number;
  /** Discounted bundle price. */
  bundlePriceUsd: number;
  /** Percentage saved vs. retail (0–100). */
  discountPercent: number;
  /** Total estimated CO₂ offset per year across all trees. */
  totalCo2KgPerYear: number;
  /** Hero emoji or icon slug for the card. */
  icon: string;
  /** Gradient CSS class applied to the card header. */
  gradientClass: string;
  /** Badge label shown on the card (e.g. "Best Value"). */
  badge?: string;
}

/** Request body for POST /api/bundles/checkout */
export interface BundleCheckoutRequest {
  bundleId: string;
  walletPublicKey: string;
  /** 'stellar' uses XLM/USDC on-chain; 'card' uses Stripe. */
  paymentMethod: 'stellar' | 'card';
  /** Optional: sponsor name to embed in tree metadata. */
  sponsorName?: string;
  /** Optional: recipient address for gift bundles. */
  recipientEmail?: string;
  idempotencyKey: string;
}

/** Individual tree record assigned during checkout. */
export interface AssignedBundleTree {
  /** Sequential slot index within the bundle. */
  slotIndex: number;
  /** Globally unique tree ID minted by the tree registry. */
  treeId: string;
  species: TreeSpecies;
  region: string;
  /** URL to this tree's trackable profile page. */
  profileUrl: string;
}

/** Response body for POST /api/bundles/checkout */
export interface BundleCheckoutResponse {
  orderId: string;
  bundleId: string;
  bundleName: string;
  assignedTrees: AssignedBundleTree[];
  totalPaidUsd: number;
  /** For Stellar payments: the signed XDR to submit. */
  transactionXdr?: string;
  /** For card payments: Stripe client secret. */
  stripeClientSecret?: string;
  paidAt: string;
}

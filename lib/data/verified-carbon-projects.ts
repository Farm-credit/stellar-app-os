/**
 * Verified carbon projects eligible for marketplace listings - Issue #1258
 *
 * A seller may only list credits from a project in this registry, and only
 * under the verification method the project was verified with.
 */

import type { CreditTypeCategory, VerificationMethod } from '@/lib/types/carbon-listing-publish';

export interface VerifiedCarbonProject {
  id: string;
  name: string;
  defaultType: CreditTypeCategory;
  verificationMethod: VerificationMethod;
  /** Tonnes of verified credits that may be listed across all listings. */
  availableTonnes: number;
  suggestedPrice: number;
}

export const VERIFIED_CARBON_PROJECTS: VerifiedCarbonProject[] = [
  {
    id: 'VCS-1940',
    name: 'East Africa Community Reforestation & Soil Sequestration',
    defaultType: 'Reforestation & Afforestation',
    verificationMethod: 'Verra (VCS)',
    availableTonnes: 108000,
    suggestedPrice: 24.5,
  },
  {
    id: 'GS-4820',
    name: 'Rift Valley Smallholder Agroforestry & Carbon Sink',
    defaultType: 'Agroforestry & Silvopasture',
    verificationMethod: 'Gold Standard',
    availableTonnes: 63500,
    suggestedPrice: 28.0,
  },
  {
    id: 'ROC-2024',
    name: 'Kilimanjaro Regenerative Agriculture & Soil Sequestration',
    defaultType: 'Soil Carbon',
    verificationMethod: 'Regenerative Organic Certified',
    availableTonnes: 34200,
    suggestedPrice: 26.0,
  },
];

export function getVerifiedProject(projectId: string): VerifiedCarbonProject | undefined {
  return VERIFIED_CARBON_PROJECTS.find((p) => p.id === projectId);
}

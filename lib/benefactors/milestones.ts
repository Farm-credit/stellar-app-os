export type BenefactorMilestoneStatus = 'completed' | 'current' | 'upcoming' | 'disputed';
export type BenefactorMilestoneKey = 'pledged' | 'seeded' | 'sprouted' | 'verified' | 'rewarded';

export interface MilestoneProof {
  id: string;
  label: string;
  uri: string;
  type: 'photo' | 'gps' | 'attestation' | 'transaction';
  verifiedAt?: string;
  verifier?: string;
}

export interface BenefactorMilestone {
  key: BenefactorMilestoneKey;
  label: string;
  description: string;
  status: BenefactorMilestoneStatus;
  completedAt?: string;
  proofs: MilestoneProof[];
}

export const MILESTONE_ORDER: readonly BenefactorMilestoneKey[] = [
  'pledged',
  'seeded',
  'sprouted',
  'verified',
  'rewarded',
];

export function getProjectMilestones(projectId: string): BenefactorMilestone[] {
  return [
    {
      key: 'pledged',
      label: 'Pledged',
      description: 'Benefactor funding reserved for the restoration project.',
      status: 'completed',
      completedAt: '2026-10-01',
      proofs: [
        {
          id: `${projectId}-pledge`,
          label: 'Funding receipt',
          uri: `/projects/${projectId}/impact#pledge`,
          type: 'transaction',
        },
      ],
    },
    {
      key: 'seeded',
      label: 'Seeded',
      description: 'Native seedlings delivered to the community nursery.',
      status: 'completed',
      completedAt: '2026-10-18',
      proofs: [
        {
          id: `${projectId}-seeded`,
          label: 'Nursery delivery record',
          uri: `/projects/${projectId}/proofs/seeded`,
          type: 'photo',
        },
      ],
    },
    {
      key: 'sprouted',
      label: 'Sprouted',
      description: 'Field team confirmed the first living cohort.',
      status: 'completed',
      completedAt: '2026-11-03',
      proofs: [
        {
          id: `${projectId}-sprouted`,
          label: 'GPS field check',
          uri: `/projects/${projectId}/proofs/sprouted`,
          type: 'gps',
        },
      ],
    },
    {
      key: 'verified',
      label: 'Verified',
      description: 'Independent verifier approved the milestone evidence.',
      status: 'current',
      proofs: [
        {
          id: `${projectId}-verification`,
          label: 'Verification attestation',
          uri: `/projects/${projectId}/proofs/verification`,
          type: 'attestation',
          verifier: 'Verifier registry',
        },
      ],
    },
    {
      key: 'rewarded',
      label: 'Rewarded',
      description: 'CARBON rewards and steward tips are released on Soroban.',
      status: 'upcoming',
      proofs: [],
    },
  ];
}

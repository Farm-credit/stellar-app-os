export interface PlanterJob {
  id: string;
  title: string;
  location: string;
  completedAt: string;
  image: string;
}

export interface PlanterProfile {
  id: string;
  name: string;
  photo: string;
  region: string;
  reputationScore: number;
  totalTreesPlanted: number;
  completedJobs: PlanterJob[];
  about: string;
}

const planterProfiles: PlanterProfile[] = [
  {
    id: 'ada-okafor',
    name: 'Ada Okafor',
    photo:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
    region: 'Kaduna, Nigeria',
    reputationScore: 94,
    totalTreesPlanted: 184,
    about:
      'Ada coordinates community restoration work across the northern savanna and focuses on drought-resilient species.',
    completedJobs: [
      {
        id: 'job-101',
        title: 'Dryland Mangrove Nursery',
        location: 'Zaria',
        completedAt: '2026-06-01',
        image:
          'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&q=80',
      },
      {
        id: 'job-102',
        title: 'Riverbank Reforestation',
        location: 'Kano',
        completedAt: '2026-05-20',
        image:
          'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
  {
    id: 'musa-bello',
    name: 'Musa Bello',
    photo:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
    region: 'Sokoto, Nigeria',
    reputationScore: 91,
    totalTreesPlanted: 156,
    about:
      'Musa trains local volunteers and uses follow-up maintenance to keep every planting site alive.',
    completedJobs: [
      {
        id: 'job-201',
        title: 'Shade Tree Corridor',
        location: 'Gusau',
        completedAt: '2026-04-15',
        image:
          'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80',
      },
      {
        id: 'job-202',
        title: 'School Grove Expansion',
        location: 'Sokoto',
        completedAt: '2026-03-28',
        image:
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
];

export function getPlanterProfile(planterId: string): PlanterProfile | undefined {
  return planterProfiles.find((profile) => profile.id === planterId);
}

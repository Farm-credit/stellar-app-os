export interface PlanterJob {
  id: string;
  title: string;
  location: string;
  completedAt: string;
  image: string;
  photos: string[];
  coordinates: { latitude: number; longitude: number };
  co2Kg: number;
  statusHistory: { status: string; date: string; note: string }[];
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
        photos: [
          'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80',
        ],
        coordinates: { latitude: 11.1118, longitude: 7.7222 },
        co2Kg: 1240,
        statusHistory: [
          { status: 'Job accepted', date: '2026-05-12', note: 'Planting assignment accepted.' },
          { status: 'Planted', date: '2026-05-24', note: 'Seedlings planted and GPS captured.' },
          { status: 'Verified', date: '2026-06-01', note: 'Photo evidence approved.' },
        ],
      },
      {
        id: 'job-102',
        title: 'Riverbank Reforestation',
        location: 'Kano',
        completedAt: '2026-05-20',
        image:
          'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=800&q=80',
        photos: [
          'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1473445361085-b9a07f55608b?auto=format&fit=crop&w=800&q=80',
        ],
        coordinates: { latitude: 12.0022, longitude: 8.5919 },
        co2Kg: 980,
        statusHistory: [
          { status: 'Job accepted', date: '2026-05-03', note: 'Planting assignment accepted.' },
          { status: 'Planted', date: '2026-05-14', note: 'Riverbank planting completed.' },
          { status: 'Verified', date: '2026-05-20', note: 'Photo evidence approved.' },
        ],
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
        photos: [
          'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
        ],
        coordinates: { latitude: 12.1628, longitude: 5.9324 },
        co2Kg: 860,
        statusHistory: [
          { status: 'Job accepted', date: '2026-03-25', note: 'Planting assignment accepted.' },
          { status: 'Planted', date: '2026-04-08', note: 'Shade corridor planted.' },
          { status: 'Verified', date: '2026-04-15', note: 'Photo evidence approved.' },
        ],
      },
      {
        id: 'job-202',
        title: 'School Grove Expansion',
        location: 'Sokoto',
        completedAt: '2026-03-28',
        image:
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
        photos: [
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80',
        ],
        coordinates: { latitude: 13.0627, longitude: 5.2432 },
        co2Kg: 720,
        statusHistory: [
          { status: 'Job accepted', date: '2026-03-04', note: 'Planting assignment accepted.' },
          { status: 'Planted', date: '2026-03-18', note: 'School grove planted.' },
          { status: 'Verified', date: '2026-03-28', note: 'Photo evidence approved.' },
        ],
      },
    ],
  },
];

export function getPlanterProfile(planterId: string): PlanterProfile | undefined {
  return planterProfiles.find((profile) => profile.id === planterId);
}

/** Return a defensive copy for read-only API consumers such as GraphQL. */
export function getPlanterProfiles(): PlanterProfile[] {
  return planterProfiles.map((profile) => ({
    ...profile,
    completedJobs: profile.completedJobs.map((job) => ({ ...job })),
  }));
}

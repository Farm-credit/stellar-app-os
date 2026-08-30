import type { PlanterProfile } from '@/lib/types/planter';

/**
 * Realistic planter profiles tied to the projects in the mock catalogue
 * (proj-001 Amazon Rainforest Reforestation, proj-002 Wind Energy Farm)
 * and to the tree projects shown in the sponsor portfolio (e.g. "Northern
 * Savanna Reforestation", "Coastal Mangrove Recovery").
 */
export const mockPlanterProfiles: PlanterProfile[] = [
  {
    id: 'planter-001',
    slug: 'amina-bello',
    fullName: 'Amina Bello',
    firstName: 'Amina',
    role: 'Lead Agroforester',
    availableForConnections: true,
    responseTime: 'Responds within 2 days',
    avatarUrl:
      'https://images.unsplash.com/photo-1598346762291-aee885f2917e?auto=format&fit=crop&q=80&w=400',
    location: 'Kano State, Nigeria',
    country: 'Nigeria',
    languages: ['Hausa', 'English'],
    tagline: 'Regrowing the Sahel, one nursery at a time.',
    background:
      "Amina grew up in a farming family in northern Nigeria and has spent over a decade restoring degraded dryland. She leads a community nursery that raises native seedlings and trains women farmers in drought-tolerant planting. Amina believes the trees she plants are a bridge between generations — each sapling a lesson in stewardship for the community's children.",
    expertise: [
      'Dryland restoration',
      'Seedling nursery management',
      'Drought-tolerant agroforestry',
    ],
    communityWork: [
      {
        title: 'Women-led nursery cooperative',
        description:
          'Trains and employs 40+ local women to raise and maintain native seedlings, improving household incomes while restoring degraded land.',
        since: 2018,
      },
      {
        title: 'School planting days',
        description:
          'Runs monthly hands-on planting workshops for primary schools to pass on land-stewardship skills to the next generation.',
        since: 2021,
      },
    ],
    certifications: ['Certified Agroforestry Trainer (ICLEI)', 'First Aid in Remote Settings'],
    stats: {
      treesPlanted: 18400,
      projectsJoined: 6,
      yearsExperience: 12,
      survivalRate: 91,
      communityMembersEngaged: 320,
    },
    projectIds: ['proj-001'],
    associatedProjects: ['Amazon Rainforest Reforestation', 'Northern Savanna Reforestation'],
    joinedDate: '2022-03-18',
    isFeatured: true,
    socialLinks: {
      twitter: 'https://twitter.com',
      linkedin: 'https://linkedin.com',
    },
  },
  {
    id: 'planter-002',
    slug: 'diego-ramirez',
    fullName: 'Diego Ramírez',
    firstName: 'Diego',
    role: 'Forest Restoration Coordinator',
    availableForConnections: true,
    responseTime: 'Responds within 1 day',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
    location: 'Belém, Pará, Brazil',
    country: 'Brazil',
    languages: ['Portuguese', 'Spanish', 'English'],
    tagline: 'Bringing the Amazon back with mix-and-match native species.',
    background:
      "Diego coordinates planting brigades across degraded parcels in the Brazilian Amazon. A former biologist, he pairs satellite MRV data with on-the-ground know-how to select the right native mix for every plot. He is passionate about fair compensation for the local families whose land stewardship underpins the project's high survival rates.",
    expertise: [
      'Ecological restoration planning',
      'Native species diversity',
      'Community planting brigades',
    ],
    communityWork: [
      {
        title: 'Family land-stewardship program',
        description:
          'Works with 120 families who commit to protecting restored plots in exchange for long-term income and technical support.',
        since: 2020,
      },
      {
        title: 'Regional biodiversity workshops',
        description:
          'Hosts quarterly workshops teaching GPS tagging and planting techniques to contractors across the region.',
        since: 2019,
      },
    ],
    certifications: ['Ecological Restoration Practitioner', 'MRV Field Validator'],
    stats: {
      treesPlanted: 120000,
      projectsJoined: 4,
      yearsExperience: 9,
      survivalRate: 88,
      communityMembersEngaged: 540,
    },
    projectIds: ['proj-001', 'proj-002'],
    associatedProjects: ['Amazon Rainforest Reforestation', 'Wind Energy Farm - Texas'],
    joinedDate: '2021-11-02',
    isFeatured: true,
    socialLinks: {
      linkedin: 'https://linkedin.com',
    },
  },
  {
    id: 'planter-003',
    slug: 'grace-mensah',
    fullName: 'Grace Mensah',
    firstName: 'Grace',
    role: 'Mangrove Restoration Lead',
    availableForConnections: true,
    responseTime: 'Responds within 3 days',
    avatarUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=400',
    location: 'Greater Accra, Ghana',
    country: 'Ghana',
    languages: ['English', 'Ga', 'Fante'],
    tagline: 'Protecting coastlines and coastal families, red mangrove by red mangrove.',
    background:
      'Grace comes from a coastal fishing community where mangrove loss directly threatened homes and livelihoods. She now leads tide-safe mangrove planting along the Ghanaian coast, training fishers to switch to carbon-friendly mangrove aquaculture. Her work connects climate action directly to community safety.',
    expertise: ['Mangrove aquaculture', 'Coastal erosion control', 'Community-led monitoring'],
    communityWork: [
      {
        title: 'Fishers-to-planters program',
        description:
          'Upskills local fishers to plant and monitor mangrove belts, creating a new income stream during off-season.',
        since: 2020,
      },
      {
        title: 'Coastal awareness collective',
        description:
          'Leads a grassroots collective documenting erosion and advocating for nature-based coastal defence.',
        since: 2017,
      },
    ],
    certifications: ['Coastal Ecosystem Management'],
    stats: {
      treesPlanted: 67000,
      projectsJoined: 3,
      yearsExperience: 7,
      survivalRate: 84,
      communityMembersEngaged: 210,
    },
    projectIds: ['proj-001'],
    associatedProjects: ['Coastal Mangrove Recovery', 'Amazon Rainforest Reforestation'],
    joinedDate: '2022-07-25',
    isFeatured: false,
    socialLinks: {
      instagram: 'https://instagram.com',
    },
  },
  {
    id: 'planter-004',
    slug: 'samuel-njoroge',
    fullName: 'Samuel Njoroge',
    firstName: 'Samuel',
    role: 'Urban Greening Specialist',
    availableForConnections: false,
    responseTime: 'Currently at capacity',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400',
    location: 'Nairobi, Kenya',
    country: 'Kenya',
    languages: ['Swahili', 'English'],
    tagline: 'Cooler cities through street trees and community green spaces.',
    background:
      'Samuel spearheads tree-planting programs across Nairobi, converting vacant lots and roadside corridors into green spaces that cut urban heat and improve air quality. He works with neighbourhood committees to ensure every tree it planted — and lovingly cared for — in a community that owns the outcome.',
    expertise: ['Urban forestry', 'Street-tree selection', 'Community engagement'],
    communityWork: [
      {
        title: 'Neighbourhood green committees',
        description:
          'Establishes resident-led committees that plan, plant and maintain public green corridors across the city.',
        since: 2021,
      },
      {
        title: 'Urban heat mapping initiative',
        description:
          'Coordinates volunteer data collection to target plantings where cooling is needed most.',
        since: 2022,
      },
    ],
    certifications: ['Urban Forestry Management'],
    stats: {
      treesPlanted: 8900,
      projectsJoined: 2,
      yearsExperience: 6,
      survivalRate: 79,
      communityMembersEngaged: 430,
    },
    projectIds: ['proj-002'],
    associatedProjects: ['Wind Energy Farm - Texas', 'East Africa Urban Greening'],
    joinedDate: '2023-01-12',
    isFeatured: false,
  },
];

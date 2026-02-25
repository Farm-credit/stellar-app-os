import type { Donation, DonationStatus, PaginationResult } from '@/lib/types/donation';

const PROJECTS = [
  { id: 'proj-001', name: 'Amazon Rainforest Reforestation' },
  { id: 'proj-002', name: 'Wind Energy Farm - Texas' },
  { id: 'proj-003', name: 'Solar Installation - California' },
  { id: 'proj-004', name: 'Mangrove Restoration - Indonesia' },
  { id: 'proj-005', name: 'Sustainable Agriculture - Kenya' },
];

const mockDonations: Donation[] = Array.from({ length: 50 }).map((_, i) => {
  const project = PROJECTS[i % PROJECTS.length];
  const status: DonationStatus = i === 0 ? 'pending' : i % 15 === 0 ? 'failed' : 'completed';
  const date = new Date(Date.now() - i * 1000 * 60 * 60 * 24);

  return {
    id: `donation-${1000 + i}`,
    date,
    projectId: project.id,
    projectName: project.name,
    amount: Math.floor(Math.random() * 500) + 50,
    trees: Math.floor(Math.random() * 100) + 10,
    status,
    txHash: `${Math.random().toString(16).slice(2, 34)}`,
    network: i % 5 === 0 ? 'testnet' : 'public',
    certificateUrl:
      status === 'completed'
        ? `https://certificates.example.com/donation-${1000 + i}.pdf`
        : undefined,
  };
});

export const fetchDonations = async (
  page: number = 1,
  limit: number = 20,
  startDate?: Date,
  endDate?: Date,
  status?: DonationStatus | 'all'
): Promise<PaginationResult<Donation>> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  let filtered = [...mockDonations];

  // Filter by date range
  if (startDate) {
    filtered = filtered.filter((d) => d.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((d) => d.date <= endDate);
  }

  // Filter by status
  if (status && status !== 'all') {
    filtered = filtered.filter((d) => d.status === status);
  }

  // Sort by date descending (newest first)
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
  };
};

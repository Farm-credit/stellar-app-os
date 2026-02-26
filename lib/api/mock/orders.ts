import type { Order, OrderType, PaginatedOrders } from '@/lib/types/order';

const PROJECTS = [
  { id: 'proj-001', name: 'Amazon Rainforest Reforestation' },
  { id: 'proj-002', name: 'Wind Energy Farm - Texas' },
  { id: 'proj-004', name: 'Mangrove Restoration - Indonesia' },
  { id: 'proj-005', name: 'Sustainable Agriculture - Kenya' },
];

const mockOrders: Order[] = Array.from({ length: 45 }).map((_, i) => {
  const project = PROJECTS[i % PROJECTS.length];
  const type: OrderType = i % 3 === 0 ? 'sell' : 'buy';
  const date = new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString();

  return {
    id: `order-${1000 + i}`,
    date,
    type,
    projectId: project.id,
    projectName: project.name,
    quantity: Math.floor(Math.random() * 50) + 1,
    price: Math.floor(Math.random() * 100) + 20,
    status: i === 0 ? 'pending' : i % 15 === 0 ? 'failed' : 'completed',
    txHash: `0x${Math.random().toString(16).slice(2, 66)}`,
    network: i % 5 === 0 ? 'testnet' : 'mainnet',
  };
});

export const fetchOrders = async (
  page: number = 1,
  limit: number = 10,
  filter?: OrderType
): Promise<PaginatedOrders> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  let filteredOrders = [...mockOrders];
  if (filter && filter !== undefined) {
    filteredOrders = filteredOrders.filter((o) => o.type === filter);
  }

  const total = filteredOrders.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = filteredOrders.slice(start, start + limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
  };
};

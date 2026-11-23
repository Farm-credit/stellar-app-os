import {
  computeCorporateImpactSummary,
  createCorporateOrder,
  type CorporateBranding,
  type CorporateImpactSummary,
  type CorporateOrder,
  type SponsoredTreeRecord,
} from './packages';

const SEED_ORDER: CorporateOrder = (() => {
  const order = createCorporateOrder({
    quantity: 50,
    orderNumber: 'CORP-2026-1042',
    createdAt: '2026-09-15T10:00:00.000Z',
    branding: {
      companyName: 'Acme Green Ventures',
      tagline: 'Net-Zero Operations by 2030',
      primaryColor: '#166534',
      secondaryColor: '#0f766e',
      contactEmail: 'sustainability@acmegreen.example',
    },
  });

  const sampleEmployees = [
    'Amara Okafor',
    'Liam Chen',
    'Sofia Martinez',
    'Noah Mensah',
    'Priya Patel',
  ];

  order.trees = order.trees.map((tree, idx) => ({
    ...tree,
    assignedEmployee: sampleEmployees[idx % sampleEmployees.length],
  }));

  return order;
})();

const ordersStore: CorporateOrder[] = [SEED_ORDER];

export function listCorporateOrders(): CorporateOrder[] {
  return [...ordersStore];
}

export function getCorporateOrderById(orderId: string): CorporateOrder | undefined {
  return ordersStore.find((o) => o.id === orderId || o.orderNumber === orderId);
}

export function addCorporateOrder(params: {
  quantity: number;
  branding: CorporateBranding;
}): CorporateOrder {
  const order = createCorporateOrder(params);
  ordersStore.unshift(order);
  return order;
}

export function listAllSponsoredTrees(): SponsoredTreeRecord[] {
  return ordersStore.flatMap((o) => o.trees);
}

export function getCorporateDashboardData(): {
  orders: CorporateOrder[];
  trees: SponsoredTreeRecord[];
  summary: CorporateImpactSummary;
} {
  const orders = listCorporateOrders();
  const trees = listAllSponsoredTrees();
  const summary = computeCorporateImpactSummary(orders);
  return { orders, trees, summary };
}

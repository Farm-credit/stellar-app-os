import {
  computeCorporateImpactSummary,
  createCorporateOrder,
  type CorporateBranding,
  type CorporateImpactSummary,
  type CorporateOrder,
  type SponsoredTreeRecord,
} from './packages';
import {
  planEmployeeAssignments,
  type EmployeeCsvRow,
  type EmployeeImportSummary,
  type EmployeeTreeAssignment,
} from './employeeImport';

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

const employeeImportSummaries = new Map<string, EmployeeImportSummary>();

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

/**
 * Assigns employees from a validated CSV to trees on a corporate order and
 * persists the assignment on each tree record.
 */
export function assignEmployeesToOrder(
  orderId: string,
  rows: EmployeeCsvRow[]
): { order: CorporateOrder; assignments: EmployeeTreeAssignment[] } {
  const order = ordersStore.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Corporate order not found.');
  }

  const assignments = planEmployeeAssignments(order.trees, rows);
  const employeeByTreeCode = new Map<string, EmployeeTreeAssignment>();
  for (const assignment of assignments) {
    for (const treeCode of assignment.treeCodes) {
      employeeByTreeCode.set(treeCode, assignment);
    }
  }

  order.trees = order.trees.map((tree) => {
    const assignment = employeeByTreeCode.get(tree.treeCode);
    if (!assignment) return tree;
    return {
      ...tree,
      assignedEmployee: assignment.name,
      assignedEmployeeEmail: assignment.email,
    };
  });

  return { order, assignments };
}

export function saveEmployeeImportSummary(orderId: string, summary: EmployeeImportSummary): void {
  employeeImportSummaries.set(orderId, summary);
}

export function getEmployeeImportSummary(orderId: string): EmployeeImportSummary | undefined {
  return employeeImportSummaries.get(orderId);
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

export type TreeMilestone = string;

export interface TreeAge {
  years: number;
  months: number;
  label: string;
}

export function calculateTreeAge(_plantedDate?: string | Date | null): TreeAge {
  return { years: 0, months: 0, label: '0 years' };
}

export function getTreeMilestones(_age: TreeAge): TreeMilestone[] {
  return [];
}

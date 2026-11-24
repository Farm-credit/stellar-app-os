export interface TreeRecord {
  id: string;
  name?: string;
  plantedDate: string;
  milestoneBadges?: string[];
}

export function getTreeById(_treeId: string): Promise<TreeRecord | null> {
  return Promise.resolve(null);
}

export interface TreeOwnershipLedgerEntry {
  treeId: string;
  owner: string;
  transactionHash: string;
}

export interface TreeOwnershipLedger {
  projectId: string;
  entries: TreeOwnershipLedgerEntry[];
}

export function getTreeOwnershipLedger(projectId: string): Promise<TreeOwnershipLedger> {
  return Promise.resolve({ projectId, entries: [] });
}

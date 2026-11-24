export interface TreeOwnershipLedgerEntry {
  treeId: string;
  owner: string;
  transactionHash: string;
}

export interface TreeOwnershipLedger {
  projectId: string;
  entries: TreeOwnershipLedgerEntry[];
}

export async function getTreeOwnershipLedger(projectId: string): Promise<TreeOwnershipLedger> {
  return { projectId, entries: [] };
}

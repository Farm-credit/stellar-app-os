export type TreeEventType =
  | 'tree:funded'
  | 'tree:planted'
  | 'tree:survived'
  | 'tree:disputed'
  | 'tree:refunded';

export interface TreeStatusEvent {
  id: string;
  type: TreeEventType;
  transactionHash: string;
  timestamp: string;
  amount: string | null;
  sourceAccount: string | null;
  destination: string | null;
}

const TX_TYPE_MAP: Record<string, TreeEventType> = {
  escrow_deposit: 'tree:funded',
  escrow_planting: 'tree:planted',
  escrow_survival: 'tree:survived',
  escrow_refund: 'tree:refunded',
};

export const TREE_TX_TYPES = Object.keys(TX_TYPE_MAP);
export const TREE_EVENT_TYPES_SET = new Set(TREE_TX_TYPES);

export function classifyTreeEvent(txType: string): TreeEventType | null {
  return TX_TYPE_MAP[txType] ?? null;
}

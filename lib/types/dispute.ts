/** Types for sponsor verification disputes (#469). */

export type DisputeOutcome = 'verification_upheld' | 'verification_overturned';

export interface DisputeRecord {
  treeId: number;
  sponsorPublicKey: string;
  evidenceCid: string;
  openedAt: string;
  resolved: boolean;
  outcome?: DisputeOutcome;
  votesUphold: number;
  votesOverturn: number;
}

export interface OpenDisputeRequest {
  treeId: number;
  sponsorPublicKey: string;
  evidenceCid: string;
  network: 'testnet' | 'mainnet';
}

export interface OpenDisputeResponse {
  transactionHash: string;
  treeId: number;
}

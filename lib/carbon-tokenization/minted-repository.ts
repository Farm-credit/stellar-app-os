import type {
  MintedCreditRecord,
  RegistryProtocol,
} from '../certification/types';
import { makeMintRecordId, makeTokenId } from './registry-client';

export interface MintedCreditRepository {
  save(record: MintedCreditRecord): Promise<MintedCreditRecord>;
  findBySerial(
    protocol: RegistryProtocol,
    serialNumber: string
  ): Promise<MintedCreditRecord | null>;
  findByTokenId(tokenId: string): Promise<MintedCreditRecord | null>;
  findById(id: string): Promise<MintedCreditRecord | null>;
  listByWallet(
    recipientWallet: string,
    network?: 'testnet' | 'mainnet'
  ): Promise<MintedCreditRecord[]>;
}

function serialKey(protocol: RegistryProtocol, serialNumber: string): string {
  return `${protocol}:${serialNumber}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryMintedCreditRepository implements MintedCreditRepository {
  private readonly byId = new Map<string, MintedCreditRecord>();
  private readonly bySerial = new Map<string, MintedCreditRecord>();
  private readonly byTokenId = new Map<string, MintedCreditRecord>();

  save(record: MintedCreditRecord): Promise<MintedCreditRecord> {
    const copy = clone(record);
    this.byId.set(copy.id, copy);
    this.bySerial.set(serialKey(copy.protocol, copy.serialNumber), copy);
    this.byTokenId.set(copy.tokenId, copy);
    return Promise.resolve(clone(copy));
  }

  findBySerial(
    protocol: RegistryProtocol,
    serialNumber: string
  ): Promise<MintedCreditRecord | null> {
    const key = serialKey(protocol, serialNumber);
    const record = this.bySerial.get(key);
    return Promise.resolve(record ? clone(record) : null);
  }

  findByTokenId(tokenId: string): Promise<MintedCreditRecord | null> {
    const record = this.byTokenId.get(tokenId);
    return Promise.resolve(record ? clone(record) : null);
  }

  findById(id: string): Promise<MintedCreditRecord | null> {
    const record = this.byId.get(id);
    return Promise.resolve(record ? clone(record) : null);
  }

  listByWallet(
    recipientWallet: string,
    network?: 'testnet' | 'mainnet'
  ): Promise<MintedCreditRecord[]> {
    const results: MintedCreditRecord[] = [];
    for (const record of this.byId.values()) {
      if (record.recipientWallet !== recipientWallet) continue;
      if (network && record.network !== network) continue;
      results.push(clone(record));
    }
    return Promise.resolve(results);
  }

  clear(): void {
    this.byId.clear();
    this.bySerial.clear();
    this.byTokenId.clear();
  }
}

export function makeMintedCreditRecord(params: {
  protocol: RegistryProtocol;
  projectId: string;
  serialNumber: string;
  vintage: number | null;
  tonnage: number;
  recipientWallet: string;
  txHash: string;
  contractAddress: string;
  network: 'testnet' | 'mainnet';
  metadataUri: string;
  validationId: string;
  mintedAt?: string;
}): MintedCreditRecord {
  const tokenId = makeTokenId(params.protocol, params.serialNumber);
  const id = makeMintRecordId(tokenId, params.network);
  return {
    id,
    tokenId,
    protocol: params.protocol,
    projectId: params.projectId,
    serialNumber: params.serialNumber,
    vintage: params.vintage,
    tonnage: params.tonnage,
    recipientWallet: params.recipientWallet,
    mintedAt: params.mintedAt ?? new Date().toISOString(),
    txHash: params.txHash,
    contractAddress: params.contractAddress,
    network: params.network,
    metadataUri: params.metadataUri,
    validationId: params.validationId,
  };
}

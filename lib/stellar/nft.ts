export interface TreeOwnershipNftInput {
  network: 'testnet' | 'mainnet';
  treeId: string;
  sponsorPublicKey: string;
  metadata: Record<string, unknown>;
}

export interface TreeOwnershipNft {
  assetCode: string;
  issuer: string;
  metadata: Record<string, unknown>;
}

export function mintTreeOwnershipNft(input: TreeOwnershipNftInput): Promise<TreeOwnershipNft> {
  return Promise.resolve({
    assetCode: '',
    issuer: '',
    metadata: input.metadata,
  });
}

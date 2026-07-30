import {
  Contract,
  TransactionBuilder,
  Networks,
  nativeToScVal,
  Address,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export function getMintingContractAddress(network: NetworkType): string | undefined {
  return network === 'mainnet'
    ? process.env.NFT_MINTING_CONTRACT_MAINNET
    : process.env.NFT_MINTING_CONTRACT_TESTNET;
}

export async function buildMintCertificateTransaction(
  recipient: string,
  tokenId: string,
  metadataUri: string,
  network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const contractId = getMintingContractAddress(network);
  if (!contractId) {
    throw new Error('CONTRACT_NOT_CONFIGURED');
  }

  const horizonUrl = getHorizonUrl(network);
  const server = new Horizon.Server(horizonUrl);
  const passphrase = getNetworkPassphrase(network);

  // Load account. If recipient is not funded/created, fall back to distributor.
  let account;
  try {
    account = await server.loadAccount(recipient);
  } catch {
    const distributor = process.env.NEXT_PUBLIC_TREE_DISTRIBUTOR || 'GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG';
    try {
      account = await server.loadAccount(distributor);
    } catch {
      account = await server.loadAccount('GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG');
    }
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(
      contract.call(
        'mint',
        nativeToScVal(Address.fromString(recipient), { type: 'address' }),
        nativeToScVal(tokenId, { type: 'string' }),
        nativeToScVal(metadataUri, { type: 'string' })
      )
    )
    .setTimeout(300)
    .build();

  return {
    transactionXdr: tx.toXDR(),
    networkPassphrase: passphrase,
  };
}

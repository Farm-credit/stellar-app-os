import { Asset } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

// ── TREE token — testnet deployment ───────────────────────────────────────────
//
//   1 TREE = 1 verified tree planted = 48 kg CO2 offset over its lifetime
//
//   Issuer      : GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S
//   Distributor : GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG
//   Supply      : 1,000,000,000 TREE (issuer locked — master weight = 0)
//   Explorer    : https://stellar.expert/explorer/testnet/asset/TREE-GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S

/** kg of CO2 offset per TREE token over the tree's lifetime (~25 years) */
export const CO2_KG_PER_TREE = 48;

export const TREE_ISSUER_TESTNET = 'GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S';
export const TREE_DISTRIBUTOR_TESTNET = 'GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG';

// Mainnet issuer — to be set after mainnet deployment
export const TREE_ISSUER_MAINNET = '';

export function getTreeAsset(network: NetworkType): Asset {
  const issuer = network === 'mainnet' ? TREE_ISSUER_MAINNET : TREE_ISSUER_TESTNET;
  if (!issuer) throw new Error('TREE asset not yet deployed on mainnet');
  return new Asset('TREE', issuer);
}

export function getTreeExplorerUrl(network: NetworkType): string {
  const issuer = network === 'mainnet' ? TREE_ISSUER_MAINNET : TREE_ISSUER_TESTNET;
  const net = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/asset/TREE-${issuer}`;
}

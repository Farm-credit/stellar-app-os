import { Networks, TransactionBuilder, Asset, Operation, Memo } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type { CreditSelectionState } from '@/lib/types/carbon';

const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const CARBON_CREDIT_ISSUER_MAINNET = 'GDUKMGUGDORQJH6YWY4RHDE6GV3NCYCBN3MORXYL43TSJPCCZFLNOA5H';
const CARBON_CREDIT_ISSUER_TESTNET = 'GDUKMGUGDORQJH6YWY4RHDE6GV3NCYCBN3MORXYL43TSJPCCZFLNOA5H';

export function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export function getUsdcAsset(network: NetworkType): Asset {
  const issuer = network === 'mainnet' ? USDC_ISSUER_MAINNET : USDC_ISSUER_TESTNET;
  return new Asset('USDC', issuer);
}

export function getCarbonCreditAsset(network: NetworkType): Asset {
  const issuer =
    network === 'mainnet' ? CARBON_CREDIT_ISSUER_MAINNET : CARBON_CREDIT_ISSUER_TESTNET;
  return new Asset('CARBON', issuer);
}

export async function buildPaymentTransaction(
  selection: CreditSelectionState,
  sourcePublicKey: string,
  network: NetworkType,
  idempotencyKey: string
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (!selection.projectId || selection.quantity <= 0 || selection.calculatedPrice <= 0) {
    throw new Error('Invalid selection for transaction');
  }

  const networkPassphrase = getNetworkPassphrase(network);
  const horizonUrl =
    network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

  const server = new Horizon.Server(horizonUrl);
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const usdcAsset = getUsdcAsset(network);
  // Test destination address
  const recipientAddress = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';

  // Dev version: Only process payment, skip carbon credit minting (no asset exists yet)
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: recipientAddress,
        asset: usdcAsset,
        amount: selection.calculatedPrice.toFixed(7),
      })
    )
    .addMemo(Memo.text(idempotencyKey))
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

export async function submitTransaction(
  signedTransactionXdr: string,
  network: NetworkType
): Promise<string> {
  const horizonUrl =
    network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

  const response = await fetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `tx=${encodeURIComponent(signedTransactionXdr)}`,
  });

  if (!response.ok) {
    const errorData = (await response.json()) as {
      extras?: {
        result_codes?: {
          transaction?: string;
          operations?: string[];
        };
        result_xdr?: string;
      };
      detail?: string;
      type?: string;
    };

    // Build detailed error message
    let errorMessage = 'Transaction submission failed';

    if (errorData.extras?.result_codes?.transaction) {
      errorMessage = `Transaction failed: ${errorData.extras.result_codes.transaction}`;

      // Add operation-level errors if available
      if (
        errorData.extras.result_codes.operations &&
        errorData.extras.result_codes.operations.length > 0
      ) {
        const operationErrors = errorData.extras.result_codes.operations.filter(
          (op) => op !== 'op_success'
        );
        if (operationErrors.length > 0) {
          errorMessage += ` (Operations: ${operationErrors.join(', ')})`;
        }
      }
    } else if (errorData.detail) {
      errorMessage = errorData.detail;
    } else if (errorData.type) {
      errorMessage = errorData.type;
    }

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { hash: string };
  return result.hash;
}

export function getStellarExplorerUrl(transactionHash: string, network: NetworkType): string {
  const networkParam = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${networkParam}/tx/${transactionHash}`;
}

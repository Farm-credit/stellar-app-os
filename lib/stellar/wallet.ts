import type { NetworkType, WalletBalance } from '@/lib/types/wallet';
import { networkConfig } from '@/lib/config/network';

const USDC_ASSET_CODE = 'USDC';

export async function connectFreighter(_network: NetworkType): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Freighter wallet can only be accessed in the browser');
  }

  try {
    const { isConnected, setAllowed, getPublicKey } = await import('@stellar/freighter-api');

    const connected = await isConnected();
    if (!connected) {
      const allowed = await setAllowed();
      if (!allowed) {
        throw new Error('Connection rejected by user');
      }
    }

    const publicKey = await getPublicKey();
    if (!publicKey) {
      throw new Error('Failed to get public key from Freighter');
    }

    return publicKey;
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes('rejected') ||
        error.message.includes('denied') ||
        error.message.includes('cancel')
      ) {
        throw new Error('Connection rejected by user');
      }
      if (error.message.includes('timeout')) {
        throw new Error('Connection timeout. Please try again.');
      }
      throw error;
    }
    throw new Error('Failed to connect to Freighter wallet');
  }
}

export function connectAlbedo(network: NetworkType): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Albedo wallet can only be accessed in the browser');
  }

  return new Promise((resolve, reject) => {
    const networkParam = network === 'mainnet' ? 'public' : 'testnet';
    const intentUrl = `https://albedo.link/intent/public-key?network=${networkParam}`;

    const popup = window.open(
      intentUrl,
      'albedo',
      'width=500,height=600,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        reject(new Error('Connection rejected by user'));
      }
    }, 500);

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== 'https://albedo.link') {
        return;
      }

      clearInterval(checkClosed);
      window.removeEventListener('message', messageHandler);

      if (popup && !popup.closed) {
        popup.close();
      }

      if (event.data.pubkey) {
        resolve(event.data.pubkey);
      } else if (event.data.error) {
        reject(new Error(event.data.error || 'Connection rejected by user'));
      } else {
        reject(new Error('Failed to get public key from Albedo'));
      }
    };

    window.addEventListener('message', messageHandler);

    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener('message', messageHandler);
      if (popup && !popup.closed) {
        popup.close();
      }
      reject(new Error('Connection timeout. Please try again.'));
    }, 60000);
  });
}

export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const { isConnected } = await import('@stellar/freighter-api');
    return await isConnected();
  } catch {
    return false;
  }
}

export async function getFreighterNetwork(): Promise<NetworkType | null> {
  if (typeof window === 'undefined') return null;

  try {
    const { getNetwork } = await import('@stellar/freighter-api');
    const network = await getNetwork();

    if (network === 'PUBLIC') return 'mainnet';
    if (network === 'TESTNET') return 'testnet';
    return null;
  } catch (error) {
    console.error('Error getting Freighter network:', error);
    return null;
  }
}

export async function fetchBalance(
  publicKey: string,
  _network?: NetworkType
): Promise<WalletBalance> {
  try {
    const horizonUrl = networkConfig.horizonUrl;
    const response = await fetch(`${horizonUrl}/accounts/${publicKey}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { xlm: '0.0000000', usdc: '0.0000000' };
      }
      throw new Error('Failed to fetch account balance');
    }

    const account = (await response.json()) as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
    };

    let xlmBalance = '0.0000000';
    let usdcBalance = '0.0000000';
    const usdcIssuer = networkConfig.usdcIssuer;

    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        xlmBalance = balance.balance;
      } else if (balance.asset_code === USDC_ASSET_CODE && balance.asset_issuer === usdcIssuer) {
        usdcBalance = balance.balance;
      }
    }

    return { xlm: xlmBalance, usdc: usdcBalance };
  } catch (error) {
    console.error('Error fetching balance:', error);
    return { xlm: '0.0000000', usdc: '0.0000000' };
  }
}

export function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0.00';
  return num.toFixed(7).replace(/\.?0+$/, '');
}

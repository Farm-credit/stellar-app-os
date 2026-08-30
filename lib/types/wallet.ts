export type WalletType = 'freighter' | 'albedo' | 'custodial';

export type NetworkType = 'testnet' | 'mainnet';

export interface WalletBalance {
  xlm: string;
  usdc: string;
}

export interface WalletConnection {
  type: WalletType;
  publicKey: string;
  network: NetworkType;
  isConnected: boolean;
  balance: WalletBalance;
}

export interface WalletContextValue {
  wallet: WalletConnection | null;

  connect: (type: WalletType, network?: NetworkType) => Promise<void>;
  disconnect: () => void;

  switchNetwork: (network: NetworkType) => Promise<void>;
  refreshBalance: () => Promise<void>;

  signTransaction: (transactionXdr: string, networkPassphrase: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
  loadPersistedConnection: () => void;
}

export interface WalletConnectionProps {
  onConnectionChange?: (connection: WalletConnection | null) => void;
  /** Heading shown before a wallet is connected. */
  title?: string;
  /** Supporting copy shown before a wallet is connected. */
  description?: string;
  /** Heading shown once a wallet is connected. */
  connectedTitle?: string;
  /** Supporting copy shown once a wallet is connected. */
  connectedDescription?: string;
}

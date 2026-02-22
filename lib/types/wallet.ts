export type WalletType = "freighter" | "albedo" | "custodial";

export type NetworkType = "testnet" | "mainnet";

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
  isLoading: boolean;
  error: string | null;
}

export interface WalletConnectionProps {
  onConnectionChange?: (connection: WalletConnection | null) => void;
}

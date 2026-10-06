import type {
  MintedCreditRecord,
  RegistryProtocol,
} from '../certification/types';
import type { CreditMetadata } from './credit-metadata';
import { makeMintedCreditRecord, makeTokenId } from './registry-client';
import logger from '../logger';

export type EvmNetwork = 'sepolia' | 'mainnet' | 'holesky';

export interface EvmMintParameters {
  recipient: string;
  protocolEnum: 0 | 1;
  projectId: string;
  vintage: number;
  tonnage: number;
  serialNumber: string;
  metadataUri: string;
  validationIdBytes32: string;
}

export interface MintResult {
  success: boolean;
  tokenId: string;
  txHash: string;
  contractAddress: string;
  network: 'testnet' | 'mainnet';
  metadataUri: string;
  record: MintedCreditRecord;
  error?: { code: string; message: string; retryable: boolean };
}

export interface BlockchainMintClient {
  readonly network: 'testnet' | 'mainnet';
  readonly contractAddress: string;

  mintVerifiedCredit(params: {
    recipientWallet: string;
    protocol: RegistryProtocol;
    projectId: string;
    vintage: number | null;
    tonnage: number;
    serialNumber: string;
    metadataUri: string;
    validationId: string;
  }): Promise<MintResult>;

  checkSerialMinted(
    protocol: RegistryProtocol,
    serialNumber: string
  ): Promise<boolean>;
}

export function protocolToEnum(protocol: RegistryProtocol): 0 | 1 {
  return protocol === 'verra' ? 0 : 1;
}

export function toBytes32(hexLike: string): string {
  if (hexLike.startsWith('0x') && hexLike.length === 66) return hexLike.toLowerCase();
  const stripped = hexLike.replace(/^0x/, '');
  const padded = stripped.padEnd(64, '0').slice(0, 64);
  return `0x${padded}`;
}

function isEvmContractConfigured(network: 'testnet' | 'mainnet'): boolean {
  const key =
    network === 'mainnet'
      ? 'EVM_CARBON_CREDIT_NFT_MAINNET'
      : 'EVM_CARBON_CREDIT_NFT_TESTNET';
  const pk =
    network === 'mainnet'
      ? 'EVM_MINTER_PRIVATE_KEY_MAINNET'
      : 'EVM_MINTER_PRIVATE_KEY_TESTNET';
  const rpc =
    network === 'mainnet' ? 'EVM_RPC_URL_MAINNET' : 'EVM_RPC_URL_TESTNET';
  return Boolean(process.env[key] && (process.env[pk] || process.env.EVM_MINTER_SIGNER_URL) && process.env[rpc]);
}

export class EvmCarbonCreditClient implements BlockchainMintClient {
  readonly network: 'testnet' | 'mainnet';
  readonly contractAddress: string;
  private readonly rpcUrl: string;
  private readonly privateKey?: string;
  private readonly signerUrl?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(params: {
    network: 'testnet' | 'mainnet';
    contractAddress: string;
    rpcUrl: string;
    privateKey?: string;
    signerUrl?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.network = params.network;
    this.contractAddress = params.contractAddress;
    this.rpcUrl = params.rpcUrl;
    this.privateKey = params.privateKey;
    this.signerUrl = params.signerUrl;
    this.fetchImpl = params.fetchImpl ?? fetch;
  }

  static fromEnv(
    network: 'testnet' | 'mainnet',
    fetchImpl?: typeof fetch
  ): EvmCarbonCreditClient | null {
    if (!isEvmContractConfigured(network)) return null;
    const contractAddress =
      network === 'mainnet'
        ? process.env.EVM_CARBON_CREDIT_NFT_MAINNET!
        : process.env.EVM_CARBON_CREDIT_NFT_TESTNET!;
    const rpcUrl =
      network === 'mainnet'
        ? process.env.EVM_RPC_URL_MAINNET!
        : process.env.EVM_RPC_URL_TESTNET!;
    const privateKey =
      network === 'mainnet'
        ? process.env.EVM_MINTER_PRIVATE_KEY_MAINNET
        : process.env.EVM_MINTER_PRIVATE_KEY_TESTNET;
    const signerUrl = process.env.EVM_MINTER_SIGNER_URL;
    return new EvmCarbonCreditClient({
      network,
      contractAddress,
      rpcUrl,
      privateKey,
      signerUrl,
      fetchImpl,
    });
  }

  async mintVerifiedCredit(params: {
    recipientWallet: string;
    protocol: RegistryProtocol;
    projectId: string;
    vintage: number | null;
    tonnage: number;
    serialNumber: string;
    metadataUri: string;
    validationId: string;
  }): Promise<MintResult> {
    const {
      recipientWallet,
      protocol,
      projectId,
      vintage,
      tonnage,
      serialNumber,
      metadataUri,
      validationId,
    } = params;

    const tokenId = makeTokenId(protocol, serialNumber);
    const vintageSafe = vintage ?? 1970;

    try {
      const txHash = await this.submitMintTransaction({
        recipient: recipientWallet,
        protocolEnum: protocolToEnum(protocol),
        projectId,
        vintage: vintageSafe,
        tonnage,
        serialNumber,
        metadataUri,
        validationIdBytes32: toBytes32(validationId),
      });

      const record = makeMintedCreditRecord({
        protocol,
        projectId,
        serialNumber,
        vintage,
        tonnage,
        recipientWallet,
        txHash,
        contractAddress: this.contractAddress,
        network: this.network,
        metadataUri,
        validationId,
      });

      logger.info('[EvmCarbonCreditClient] Minted credit NFT', {
        tokenId,
        protocol,
        projectId,
        serialNumber,
        txHash,
        network: this.network,
      });

      return {
        success: true,
        tokenId,
        txHash,
        contractAddress: this.contractAddress,
        network: this.network,
        metadataUri,
        record,
      };
    } catch (error) {
      logger.error('[EvmCarbonCreditClient] Mint failed', {
        tokenId,
        protocol,
        serialNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        tokenId,
        txHash: '',
        contractAddress: this.contractAddress,
        network: this.network,
        metadataUri,
        record: {} as MintedCreditRecord,
        error: {
          code: 'MINT_TRANSACTION_FAILED',
          message:
            error instanceof Error ? error.message : 'Mint transaction failed',
          retryable: this.isRetryableMintError(error),
        },
      };
    }
  }

  async checkSerialMinted(
    protocol: RegistryProtocol,
    serialNumber: string
  ): Promise<boolean> {
    try {
      const { keccak_256 } = await import('@noble/hashes/sha3');
      const functionSignature = 'isSerialMinted(uint8,string)';
      const selector =
        '0x' +
        Buffer.from(keccak_256(Buffer.from(functionSignature)))
          .slice(0, 4)
          .toString('hex');

      const head: string[] = [];
      const tail: string[] = [];
      let tailOffset = 2 * 32;

      head.push(this.abiEncodeUint(256, protocolToEnum(protocol)));
      tailOffset = this.pushString(head, tail, tailOffset, serialNumber);

      const data = selector + head.join('') + tail.join('');
      const result = await this.rpcCall('eth_call', [
        { to: this.contractAddress, data },
        'latest',
      ]);
      if (typeof result !== 'string' || result.length < 3) return false;
      return result.replace(/^0x/, '').slice(-1) === '1';
    } catch {
      return false;
    }
  }

  private async submitMintTransaction(
    params: EvmMintParameters
  ): Promise<string> {
    const data = await this.encodeMintCalldata(params);

    if (this.signerUrl) {
      const response = await this.fetchImpl(this.signerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sign_and_send',
          params: [
            {
              to: this.contractAddress,
              data,
            },
            { chainId: this.chainId() },
          ],
        }),
      });
      const body = (await response.json()) as { result?: string; error?: { message: string; code: number } };
      if (body.error) {
        throw new Error(`Signer error: ${body.error.message} (${body.error.code})`);
      }
      if (!body.result) throw new Error('Signer returned no tx hash');
      return body.result;
    }

    if (this.privateKey) {
      return this.signAndSendLocally(data);
    }

    throw new Error('No EVM signer configured (set private key or signer URL)');
  }

  private async signAndSendLocally(data: string): Promise<string> {
    const nonce = await this.rpcCall('eth_getTransactionCount', [
      await this.deriveAddress(),
      'pending',
    ]);
    const gasPrice = await this.rpcCall('eth_gasPrice', []);
    const gasEstimate = await this.rpcCall('eth_estimateGas', [
      { to: this.contractAddress, data, from: await this.deriveAddress() },
    ]);

    const tx = {
      to: this.contractAddress,
      data,
      nonce: nonce as string,
      gasPrice: gasPrice as string,
      gas: gasEstimate as string,
      chainId: this.chainIdHex(),
      value: '0x0',
    };

    const signed = await this.signTransaction(tx);
    const txHash = await this.rpcCall('eth_sendRawTransaction', [signed]);
    return txHash as string;
  }

  private async deriveAddress(): Promise<string> {
    const pk = this.privateKey?.replace(/^0x/, '');
    if (!pk) throw new Error('No private key configured');
    const { secp256k1 } = await import('@noble/curves/secp256k1');
    const { keccak_256 } = await import('@noble/hashes/sha3');
    const pub = secp256k1.getPublicKey(pk, false).slice(1);
    const hash = keccak_256(pub);
    const address = '0x' + Buffer.from(hash).slice(-20).toString('hex');
    return address.toLowerCase();
  }

  private async signTransaction(_tx: {
    to: string;
    data: string;
    nonce: string;
    gasPrice: string;
    gas: string;
    chainId: string;
    value: string;
  }): Promise<string> {
    const pk = this.privateKey?.replace(/^0x/, '');
    if (!pk) throw new Error('No private key configured');
    throw new Error(
      'Local EVM signing requires ethers/viem integration; configure EVM_MINTER_SIGNER_URL or wire in a signing library'
    );
  }

  private async encodeMintCalldata(params: EvmMintParameters): Promise<string> {
    const functionSignature =
      'mintVerifiedCredit(address,uint8,string,uint256,uint256,string,string,bytes32)';
    const { keccak_256 } = await import('@noble/hashes/sha3');
    const selector =
      '0x' + Buffer.from(keccak_256(Buffer.from(functionSignature))).slice(0, 4).toString('hex');

    const head: string[] = [];
    const tail: string[] = [];
    let tailOffset = 8 * 32;

    head.push(this.padAddress(params.recipient));
    head.push(this.abiEncodeUint(256, params.protocolEnum));

    tailOffset = this.pushString(head, tail, tailOffset, params.projectId);
    head.push(this.abiEncodeUint(256, params.vintage));
    head.push(this.abiEncodeUint(256, params.tonnage));
    tailOffset = this.pushString(head, tail, tailOffset, params.serialNumber);
    tailOffset = this.pushString(head, tail, tailOffset, params.metadataUri);
    head.push(toBytes32(params.validationIdBytes32).replace(/^0x/, ''));

    return selector + head.join('') + tail.join('');
  }

  private pushString(
    head: string[],
    tail: string[],
    tailOffset: number,
    value: string
  ): number {
    head.push(this.abiEncodeUint(256, tailOffset));
    const bytes = Buffer.from(value, 'utf8');
    const byteLen = bytes.length;
    tail.push(this.abiEncodeUint(256, byteLen));
    const hex = bytes.toString('hex');
    const padded = hex.padEnd(Math.ceil(byteLen / 32) * 64, '0');
    for (let i = 0; i < padded.length; i += 64) {
      tail.push(padded.slice(i, i + 64));
    }
    return tailOffset + 32 + Math.ceil(byteLen / 32) * 32;
  }

  private padAddress(address: string): string {
    const stripped = address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    return stripped;
  }

  private abiEncodeUint(bits: number, value: number | bigint | string): string {
    const b = BigInt(value);
    if (b < 0) throw new Error('Negative uint value');
    const width = Math.ceil(bits / 4);
    let hex = b.toString(16);
    if (hex.length > width) {
      hex = hex.slice(-width);
    }
    return hex.padStart(width, '0');
  }

  private abiEncodeString(value: string): string {
    const bytes = Buffer.from(value, 'utf8');
    const len = bytes.length;
    let result = this.abiEncodeUint(256, len);
    const padded = bytes.toString('hex').padEnd(Math.ceil(len / 32) * 64, '0');
    result += padded;
    return result;
  }

  private chainId(): number {
    if (this.network === 'mainnet') return 1;
    const fromEnv = process.env.EVM_CHAIN_ID_TESTNET;
    return fromEnv ? Number(fromEnv) : 11155111;
  }

  private chainIdHex(): string {
    return '0x' + this.chainId().toString(16);
  }

  private isRetryableMintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const low = message.toLowerCase();
    if (low.includes('nonce')) return true;
    if (low.includes('timeout')) return true;
    if (low.includes('replacement')) return true;
    if (low.includes('rate limit')) return true;
    if (low.includes('underpriced')) return true;
    return false;
  }

  private async rpcCall(
    method: string,
    params: unknown[]
  ): Promise<unknown> {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    };
    const response = await this.fetchImpl(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      result?: unknown;
      error?: { message: string; code: number };
    };
    if (body.error) {
      throw new Error(`RPC error: ${body.error.message} (${body.error.code})`);
    }
    return body.result;
  }
}

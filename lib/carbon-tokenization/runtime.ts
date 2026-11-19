import {
  getCertificationProviderConfig,
} from '../certification/config';
import { ProviderHttpClient } from '../certification/http-client';
import { VerraClient as VerraAdapter } from '../certification/providers/verra';
import { GoldStandardClient as GoldStandardAdapter } from '../certification/providers/gold-standard';
import { VerraRegistryClient } from './verra-registry-client';
import { GoldStandardRegistryClient } from './gold-standard-registry-client';
import type {
  RegistryClient,
  RegistryProtocol,
} from '../certification/types';
import {
  InMemoryMintedCreditRepository,
  type MintedCreditRepository,
} from './minted-repository';
import { CreditValidator } from './credit-validator';
import {
  EvmCarbonCreditClient,
  type BlockchainMintClient,
} from './evm-client';
import { TokenizationOrchestrator } from './tokenization-orchestrator';

const mintedRepository = new InMemoryMintedCreditRepository();
let validatorSingleton: CreditValidator | undefined;
let orchestratorSingleton: TokenizationOrchestrator | undefined;
let networkSingleton: 'testnet' | 'mainnet' | undefined;

export function registryClientFactory(
  protocol: RegistryProtocol,
  env: NodeJS.ProcessEnv = process.env
): RegistryClient | null {
  const config = getCertificationProviderConfig(protocol, env);
  if (!config) return null;
  const http = new ProviderHttpClient(config);
  if (protocol === 'verra') {
    const adapter = new VerraAdapter(http);
    return new VerraRegistryClient(adapter, http);
  }
  if (protocol === 'gold-standard') {
    const adapter = new GoldStandardAdapter(http);
    return new GoldStandardRegistryClient(adapter, http);
  }
  return null;
}

export function getMintedCreditRepository(): MintedCreditRepository {
  return mintedRepository;
}

export function getDefaultNetwork(
  env: NodeJS.ProcessEnv = process.env
): 'testnet' | 'mainnet' {
  if (networkSingleton) return networkSingleton;
  const fromEnv =
    (env.NEXT_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet' | undefined) ??
    (env.EVM_NETWORK as 'testnet' | 'mainnet' | undefined) ??
    'testnet';
  return fromEnv === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getBlockchainMintClient(
  network?: 'testnet' | 'mainnet',
  env: NodeJS.ProcessEnv = process.env
): BlockchainMintClient | null {
  const net = network ?? getDefaultNetwork(env);
  return EvmCarbonCreditClient.fromEnv(net);
}

interface StellarFallbackOptions {
  network?: 'testnet' | 'mainnet';
}

export function createCreditValidator(
  options?: {
    registryClientFactoryOverride?: (p: RegistryProtocol) => RegistryClient | null;
    mintedRepositoryOverride?: MintedCreditRepository;
    now?: () => Date;
  },
  stellar?: StellarFallbackOptions
): CreditValidator {
  const factory =
    options?.registryClientFactoryOverride ??
    ((p: RegistryProtocol) => registryClientFactory(p));
  const repo =
    options?.mintedRepositoryOverride ?? getMintedCreditRepository();
  return new CreditValidator({
    registryClientFactory: factory,
    mintedRepository: repo,
    now: options?.now,
  });
}

export function getCreditValidator(): CreditValidator {
  if (!validatorSingleton) {
    validatorSingleton = createCreditValidator();
  }
  return validatorSingleton;
}

export function createTokenizationOrchestrator(
  network?: 'testnet' | 'mainnet',
  requestOrigin?: string
): TokenizationOrchestrator {
  const validator = getCreditValidator();
  const mintClient = getBlockchainMintClient(network);
  if (!mintClient) {
    throw new Error(
      'Blockchain mint client not configured. Set EVM_CARBON_CREDIT_NFT_* and EVM_RPC_URL_* env vars.'
    );
  }
  return new TokenizationOrchestrator({
    validator,
    mintClient,
    mintedRepository: getMintedCreditRepository(),
    requestOrigin,
  });
}

export function getTokenizationOrchestrator(
  requestOrigin?: string
): TokenizationOrchestrator {
  if (!orchestratorSingleton) {
    orchestratorSingleton = createTokenizationOrchestrator(
      undefined,
      requestOrigin
    );
  }
  return orchestratorSingleton;
}

export function resetTokenizationRuntimeForTests(): void {
  validatorSingleton = undefined;
  orchestratorSingleton = undefined;
  networkSingleton = undefined;
  mintedRepository.clear();
}

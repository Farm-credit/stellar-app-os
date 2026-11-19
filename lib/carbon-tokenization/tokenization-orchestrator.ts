import {
  buildCreditMetadata,
  storeCreditMetadata,
  type MetadataUploadResult,
} from './credit-metadata';
import type {
  MintedCreditRecord,
  RegistryClient,
  RegistryProtocol,
  TokenizationRequest,
  TokenizationValidationResult,
} from '../certification/types';
import { CreditValidator } from './credit-validator';
import type { MintedCreditRepository } from './minted-repository';
import type {
  BlockchainMintClient,
  MintResult,
} from './evm-client';
import { CreditTokenizationError, ValidationInternalError } from './errors';
import logger from '../logger';

export interface TokenizeCreditResult {
  success: boolean;
  validation?: TokenizationValidationResult;
  mint?: MintResult;
  record?: MintedCreditRecord;
  errors: Array<{
    code: string;
    message: string;
    field?: string;
    expected?: string | number | null;
    actual?: string | number | null;
    retryable?: boolean;
  }>;
  metadataUri?: string;
  tokenId?: string;
}

export interface TokenizationOrchestratorDependencies {
  validator: CreditValidator;
  mintClient: BlockchainMintClient;
  mintedRepository: MintedCreditRepository;
  requestOrigin?: string;
}

export class TokenizationOrchestrator {
  constructor(private readonly deps: TokenizationOrchestratorDependencies) {}

  async tokenize(request: TokenizationRequest): Promise<TokenizeCreditResult> {
    const startTime = Date.now();
    const protocol = request.protocol;
    const serialNumber = request.serialNumber;

    logger.info('[TokenizationOrchestrator] Starting tokenization', {
      protocol,
      projectId: request.projectId,
      serialNumber,
      recipientWallet: request.recipientWallet,
    });

    const validation = await this.deps.validator.validate(request);
    if (!validation.valid) {
      logger.warn('[TokenizationOrchestrator] Validation failed', {
        protocol,
        serialNumber,
        errors: validation.errors,
        durationMs: Date.now() - startTime,
      });
      return {
        success: false,
        validation,
        errors: validation.errors.map((e) => ({
          code: e.code,
          message: e.message,
          field: e.field,
          expected: e.expected,
          actual: e.actual,
          retryable: e.retryable,
        })),
      };
    }

    if (!validation.project || !validation.retirement) {
      return {
        success: false,
        validation,
        errors: [
          {
            code: 'VALIDATION_INTERNAL_ERROR',
            message: 'Validation passed but project/retirement missing',
            retryable: true,
          },
        ],
      };
    }

    const vintage =
      validation.retirement.vintage ?? validation.project.vintage ?? 1970;
    const tonnage = validation.retirement.tonnage;

    let metadataUpload: MetadataUploadResult;
    try {
      const metadata = buildCreditMetadata({
        project: validation.project,
        retirement: validation.retirement,
        validationId: validation.validationId,
      });
      const { makeTokenId } = await import('./registry-client');
      const tokenId = makeTokenId(protocol, serialNumber);
      metadataUpload = await storeCreditMetadata({
        metadata,
        tokenId,
        requestOrigin: this.deps.requestOrigin,
      });
    } catch (error) {
      logger.error('[TokenizationOrchestrator] Metadata upload failed', {
        protocol,
        serialNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        validation,
        errors: [
          new ValidationInternalError(
            `Failed to store metadata: ${
              error instanceof Error ? error.message : String(error)
            }`
          ).toValidationError(),
        ],
      };
    }

    let mintResult: MintResult;
    try {
      mintResult = await this.deps.mintClient.mintVerifiedCredit({
        recipientWallet: request.recipientWallet,
        protocol,
        projectId: request.projectId,
        vintage,
        tonnage,
        serialNumber,
        metadataUri: metadataUpload.metadataUri,
        validationId: validation.validationId,
      });
    } catch (error) {
      logger.error('[TokenizationOrchestrator] Mint call threw', {
        protocol,
        serialNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        validation,
        metadataUri: metadataUpload.metadataUri,
        errors: [
          new ValidationInternalError(
            `Mint execution failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          ).toValidationError(),
        ],
      };
    }

    if (!mintResult.success) {
      return {
        success: false,
        validation,
        mint: mintResult,
        metadataUri: metadataUpload.metadataUri,
        tokenId: mintResult.tokenId,
        errors: mintResult.error
          ? [
              {
                code: mintResult.error.code,
                message: mintResult.error.message,
                retryable: mintResult.error.retryable,
              },
            ]
          : [
              {
                code: 'MINT_TRANSACTION_FAILED',
                message: 'Mint transaction failed without error details',
                retryable: true,
              },
            ],
      };
    }

    try {
      await this.deps.mintedRepository.save(mintResult.record);
    } catch (error) {
      logger.error(
        '[TokenizationOrchestrator] Minted record persistence failed',
        {
          protocol,
          serialNumber,
          txHash: mintResult.txHash,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }

    logger.info('[TokenizationOrchestrator] Tokenization complete', {
      protocol,
      serialNumber,
      tokenId: mintResult.tokenId,
      txHash: mintResult.txHash,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      validation,
      mint: mintResult,
      record: mintResult.record,
      metadataUri: metadataUpload.metadataUri,
      tokenId: mintResult.tokenId,
      errors: [],
    };
  }
}

import type {
  CertificationIntegrationError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderResponseError,
  ProviderTimeoutError,
  CertificationNotFoundError,
  ProviderNotConfiguredError,
} from '../certification/errors';
import type {
  CreditValidationError,
  RegistryClient,
  RegistryProtocol,
  RegistryProjectData,
  RegistryRetirementData,
  TokenizationRequest,
  TokenizationValidationResult,
} from '../certification/types';
import {
  AlreadyMintedError,
  CreditTokenizationError,
  ProjectIdMismatchError,
  ProjectNotActiveError,
  ProjectNotFoundError,
  ProjectStatusUnknownError,
  ProtocolNotSupportedError,
  RegistryApiError,
  RegistryRateLimitedError,
  RegistryTimeoutError,
  RetirementNotRetiredError,
  RetirementNotFoundError,
  RetirementSerialInvalidError,
  RetirementStatusInvalidError,
  TonnageMismatchError,
  ValidationInternalError,
  VintageMismatchError,
} from './errors';
import type { MintedCreditRepository } from './minted-repository';
import { makeValidationId } from './registry-client';
import logger from '../logger';

const VALID_PROJECT_STATUSES = ['registered', 'active'] as const;
const VALID_RETIREMENT_STATUSES = ['retired', 'active'] as const;

function isValidSerialFormat(
  protocol: RegistryProtocol,
  serialNumber: string
): boolean {
  if (!serialNumber || typeof serialNumber !== 'string') return false;
  const trimmed = serialNumber.trim();
  if (trimmed.length < 3 || trimmed.length > 500) return false;
  if (protocol === 'verra') {
    return /^[A-Za-z0-9][A-Za-z0-9_\-.:/ ]*$/.test(trimmed);
  }
  if (protocol === 'gold-standard') {
    return /^[A-Za-z0-9][A-Za-z0-9_\-.:/ ]*$/.test(trimmed);
  }
  return true;
}

function isValidWalletAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^(0x[a-fA-F0-9]{40}|G[A-Z2-7]{55})$/.test(address.trim());
}

export interface CreditValidatorDependencies {
  registryClientFactory: (protocol: RegistryProtocol) => RegistryClient | null;
  mintedRepository: MintedCreditRepository;
  now?: () => Date;
}

export class CreditValidator {
  private readonly now: () => Date;

  constructor(private readonly deps: CreditValidatorDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  async validate(
    request: TokenizationRequest
  ): Promise<TokenizationValidationResult> {
    const validatedAt = this.now().toISOString();
    const validationId = makeValidationId(
      request.protocol,
      request.projectId,
      request.serialNumber,
      validatedAt
    );

    const errors: CreditValidationError[] = [];
    let project: RegistryProjectData | null = null;
    let retirement: RegistryRetirementData | null = null;

    const baseErrors = this.validateRequestShape(request);
    errors.push(...baseErrors);

    if (!isValidWalletAddress(request.recipientWallet)) {
      errors.push({
        code: 'VALIDATION_INTERNAL_ERROR',
        message: 'Invalid recipient wallet address format',
        field: 'recipientWallet',
        expected: 'Ethereum (0x...) or Stellar (G...) public key',
        actual: request.recipientWallet,
        retryable: false,
      });
    }

    if (baseErrors.length > 0) {
      return {
        valid: false,
        project: null,
        retirement: null,
        errors,
        validationId,
        validatedAt,
      };
    }

    try {
      const registry = this.deps.registryClientFactory(request.protocol);
      if (!registry) {
        throw new ProtocolNotSupportedError(request.protocol);
      }

      try {
        project = await registry.fetchProject(request.projectId);
      } catch (error) {
        this.handleRegistryError(error, request.protocol, 'project');
        throw new ProjectNotFoundError(request.protocol, request.projectId);
      }

      if (project) {
        errors.push(
          ...this.validateProject(
            project,
            request.protocol,
            request.projectId
          )
        );
      }

      try {
        retirement = await registry.fetchRetirement(request.serialNumber);
      } catch (error) {
        this.handleRegistryError(error, request.protocol, 'retirement');
        throw new RetirementNotFoundError(
          request.protocol,
          request.serialNumber
        );
      }

      if (retirement) {
        errors.push(...this.validateRetirement(retirement, request));
      }

      const existing = await this.deps.mintedRepository.findBySerial(
        request.protocol,
        request.serialNumber
      );
      if (existing) {
        throw new AlreadyMintedError(
          request.protocol,
          request.serialNumber,
          existing.tokenId
        );
      }
    } catch (error) {
      if (error instanceof CreditTokenizationError) {
        errors.push(error.toValidationError());
      } else {
        logger.error('[CreditValidator] Unexpected validation error', {
          error,
          validationId,
          projectId: request.projectId,
          serialNumber: request.serialNumber,
        });
        errors.push(
          new ValidationInternalError(
            error instanceof Error ? error.message : String(error)
          ).toValidationError()
        );
      }
    }

    const valid = errors.length === 0;
    return {
      valid,
      project,
      retirement,
      errors,
      validationId,
      validatedAt,
    };
  }

  private validateRequestShape(
    request: TokenizationRequest
  ): CreditValidationError[] {
    const errors: CreditValidationError[] = [];

    if (!request.protocol || typeof request.protocol !== 'string') {
      errors.push({
        code: 'PROTOCOL_NOT_SUPPORTED',
        message: 'Protocol is required (verra or gold-standard)',
        field: 'protocol',
        retryable: false,
      });
    } else if (
      request.protocol !== 'verra' &&
      request.protocol !== 'gold-standard'
    ) {
      errors.push(
        new ProtocolNotSupportedError(request.protocol).toValidationError()
      );
    }

    if (
      !request.projectId ||
      typeof request.projectId !== 'string' ||
      request.projectId.trim().length === 0
    ) {
      errors.push({
        code: 'PROJECT_NOT_FOUND',
        message: 'projectId is required',
        field: 'projectId',
        retryable: false,
      });
    }

    if (
      !request.serialNumber ||
      typeof request.serialNumber !== 'string' ||
      request.serialNumber.trim().length === 0
    ) {
      errors.push({
        code: 'RETIREMENT_SERIAL_INVALID',
        message: 'serialNumber is required',
        field: 'serialNumber',
        retryable: false,
      });
    } else if (
      request.protocol &&
      !isValidSerialFormat(request.protocol, request.serialNumber)
    ) {
      errors.push(
        new RetirementSerialInvalidError(
          request.protocol,
          request.serialNumber
        ).toValidationError()
      );
    }

    if (request.vintage !== undefined && request.vintage !== null) {
      if (
        typeof request.vintage !== 'number' ||
        !Number.isInteger(request.vintage) ||
        request.vintage < 1900 ||
        request.vintage > 2200
      ) {
        errors.push({
          code: 'VINTAGE_MISMATCH',
          message: 'vintage must be a valid 4-digit year between 1900-2200',
          field: 'vintage',
          expected: 'integer year 1900-2200',
          actual: request.vintage,
          retryable: false,
        });
      }
    }

    if (request.expectedTonnage !== undefined) {
      if (
        typeof request.expectedTonnage !== 'number' ||
        request.expectedTonnage <= 0
      ) {
        errors.push({
          code: 'TONNAGE_MISMATCH',
          message: 'expectedTonnage must be a positive number',
          field: 'expectedTonnage',
          expected: 'positive number of tonnes',
          actual: request.expectedTonnage,
          retryable: false,
        });
      }
    }

    return errors;
  }

  private validateProject(
    project: RegistryProjectData,
    _protocol: RegistryProtocol,
    requestedProjectId: string
  ): CreditValidationError[] {
    const errors: CreditValidationError[] = [];

    if (project.projectId !== requestedProjectId) {
      errors.push(
        new ProjectIdMismatchError(
          requestedProjectId,
          requestedProjectId,
          project.projectId
        ).toValidationError()
      );
    }

    const status = project.projectStatus;
    if (status === 'unknown') {
      errors.push(
        new ProjectStatusUnknownError(
          project.protocol,
          project.projectId
        ).toValidationError()
      );
    } else if (!(VALID_PROJECT_STATUSES as readonly string[]).includes(status as any)) {
      errors.push(
        new ProjectNotActiveError(
          project.protocol,
          project.projectId,
          status
        ).toValidationError()
      );
    }

    return errors;
  }

  private validateRetirement(
    retirement: RegistryRetirementData,
    request: TokenizationRequest
  ): CreditValidationError[] {
    const errors: CreditValidationError[] = [];

    if (retirement.projectId !== request.projectId) {
      errors.push(
        new ProjectIdMismatchError(
          request.serialNumber,
          request.projectId,
          retirement.projectId
        ).toValidationError()
      );
    }

    const status = retirement.retirementStatus;
    if (status === 'unknown') {
      errors.push({
        code: 'RETIREMENT_STATUS_INVALID',
        message: `Retirement ${request.serialNumber} has unknown status`,
        field: 'retirementStatus',
        actual: 'unknown',
        retryable: true,
      });
    } else if (!(VALID_RETIREMENT_STATUSES as readonly string[]).includes(status)) {
      errors.push(
        new RetirementStatusInvalidError(
          request.protocol,
          request.serialNumber,
          status
        ).toValidationError()
      );
    }

    if (
      request.vintage !== undefined &&
      retirement.vintage !== null &&
      retirement.vintage !== request.vintage
    ) {
      errors.push(
        new VintageMismatchError(
          request.serialNumber,
          request.vintage,
          retirement.vintage
        ).toValidationError()
      );
    }

    if (
      request.expectedTonnage !== undefined &&
      retirement.tonnage !== request.expectedTonnage
    ) {
      errors.push(
        new TonnageMismatchError(
          request.serialNumber,
          request.expectedTonnage,
          retirement.tonnage
        ).toValidationError()
      );
    }

    return errors;
  }

  private handleRegistryError(
    error: unknown,
    protocol: RegistryProtocol,
    _resource: 'project' | 'retirement'
  ): void {
    if (error instanceof CreditTokenizationError) {
      throw error;
    }
    if (error instanceof CertificationNotFoundError) {
      return;
    }
    if (error instanceof ProviderNotConfiguredError) {
      throw new ProtocolNotSupportedError(protocol);
    }
    if (error instanceof ProviderTimeoutError) {
      throw new RegistryTimeoutError(protocol);
    }
    if (error instanceof ProviderHttpError) {
      if (error.status === 429) {
        throw new RegistryRateLimitedError(protocol);
      }
      throw new RegistryApiError(protocol, error.message, error.retryable);
    }
    if (
      error instanceof ProviderNetworkError ||
      error instanceof ProviderResponseError
    ) {
      throw new RegistryApiError(protocol, error.message, true);
    }
    if (error instanceof CertificationIntegrationError) {
      throw new RegistryApiError(protocol, error.message, true);
    }
  }
}

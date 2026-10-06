import type {
  CreditValidationErrorCode,
  CreditValidationError,
  RegistryProtocol,
} from '../certification/types';

export class CreditTokenizationError extends Error {
  constructor(
    message: string,
    readonly code: CreditValidationErrorCode,
    readonly statusCode: number,
    readonly retryable: boolean = false,
    readonly field?: string,
    readonly expected?: string | number | null,
    readonly actual?: string | number | null
  ) {
    super(message);
    this.name = new.target.name;
  }

  toValidationError(): CreditValidationError {
    return {
      code: this.code,
      message: this.message,
      field: this.field,
      expected: this.expected,
      actual: this.actual,
      retryable: this.retryable,
    };
  }
}

export class ProjectNotFoundError extends CreditTokenizationError {
  constructor(protocol: RegistryProtocol, projectId: string) {
    super(
      `Project ${projectId} not found in ${protocol} registry`,
      'PROJECT_NOT_FOUND',
      404,
      false,
      'projectId',
      projectId,
      null
    );
  }
}

export class ProjectNotActiveError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    projectId: string,
    actualStatus: string
  ) {
    super(
      `Project ${projectId} in ${protocol} registry is not active (status: ${actualStatus})`,
      'PROJECT_NOT_ACTIVE',
      422,
      false,
      'projectStatus',
      'active',
      actualStatus
    );
  }
}

export class ProjectStatusUnknownError extends CreditTokenizationError {
  constructor(protocol: RegistryProtocol, projectId: string) {
    super(
      `Project ${projectId} in ${protocol} registry has unknown status`,
      'PROJECT_STATUS_UNKNOWN',
      422,
      true,
      'projectStatus',
      'registered|active',
      'unknown'
    );
  }
}

export class RetirementNotFoundError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    serialNumber: string
  ) {
    super(
      `Retirement serial ${serialNumber} not found in ${protocol} registry`,
      'RETIREMENT_NOT_FOUND',
      404,
      false,
      'serialNumber',
      serialNumber,
      null
    );
  }
}

export class RetirementSerialInvalidError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    serialNumber: string
  ) {
    super(
      `Retirement serial ${serialNumber} is not a valid format for ${protocol}`,
      'RETIREMENT_SERIAL_INVALID',
      400,
      false,
      'serialNumber',
      null,
      serialNumber
    );
  }
}

export class RetirementNotRetiredError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    serialNumber: string,
    actualStatus: string
  ) {
    super(
      `Credit ${serialNumber} in ${protocol} registry is not retired (status: ${actualStatus})`,
      'RETIREMENT_NOT_RETIRED',
      422,
      false,
      'retirementStatus',
      'retired',
      actualStatus
    );
  }
}

export class RetirementStatusInvalidError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    serialNumber: string,
    actualStatus: string
  ) {
    super(
      `Credit ${serialNumber} in ${protocol} registry has invalid status for tokenization (status: ${actualStatus})`,
      'RETIREMENT_STATUS_INVALID',
      422,
      false,
      'retirementStatus',
      'retired|active',
      actualStatus
    );
  }
}

export class VintageMismatchError extends CreditTokenizationError {
  constructor(
    serialNumber: string,
    expected: number,
    actual: number | null
  ) {
    super(
      `Vintage mismatch for serial ${serialNumber}`,
      'VINTAGE_MISMATCH',
      422,
      false,
      'vintage',
      expected,
      actual
    );
  }
}

export class TonnageMismatchError extends CreditTokenizationError {
  constructor(
    serialNumber: string,
    expected: number,
    actual: number
  ) {
    super(
      `Tonnage mismatch for serial ${serialNumber}`,
      'TONNAGE_MISMATCH',
      422,
      false,
      'tonnage',
      expected,
      actual
    );
  }
}

export class ProjectIdMismatchError extends CreditTokenizationError {
  constructor(
    serialNumber: string,
    expected: string,
    actual: string
  ) {
    super(
      `Project ID mismatch for serial ${serialNumber}`,
      'PROJECT_ID_MISMATCH',
      422,
      false,
      'projectId',
      expected,
      actual
    );
  }
}

export class AlreadyMintedError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    serialNumber: string,
    existingTokenId: string
  ) {
    super(
      `Serial ${serialNumber} from ${protocol} has already been minted as token ${existingTokenId}`,
      'ALREADY_MINTED',
      409,
      false,
      'serialNumber',
      null,
      existingTokenId
    );
  }
}

export class ProtocolNotSupportedError extends CreditTokenizationError {
  constructor(protocol: string) {
    super(
      `Protocol ${protocol} is not supported for tokenization`,
      'PROTOCOL_NOT_SUPPORTED',
      400,
      false,
      'protocol',
      'verra|gold-standard',
      protocol
    );
  }
}

export class RegistryApiError extends CreditTokenizationError {
  constructor(
    protocol: RegistryProtocol,
    innerMessage: string,
    retryable: boolean = true
  ) {
    super(
      `${protocol} registry API error: ${innerMessage}`,
      'REGISTRY_API_ERROR',
      502,
      retryable
    );
  }
}

export class RegistryRateLimitedError extends CreditTokenizationError {
  constructor(protocol: RegistryProtocol, retryAfterSeconds?: number) {
    super(
      `${protocol} registry rate limited${retryAfterSeconds ? `, retry after ${retryAfterSeconds}s` : ''}`,
      'REGISTRY_RATE_LIMITED',
      429,
      true
    );
  }
}

export class RegistryTimeoutError extends CreditTokenizationError {
  constructor(protocol: RegistryProtocol) {
    super(
      `${protocol} registry request timed out`,
      'REGISTRY_TIMEOUT',
      504,
      true
    );
  }
}

export class ValidationInternalError extends CreditTokenizationError {
  constructor(innerMessage: string) {
    super(
      `Internal validation error: ${innerMessage}`,
      'VALIDATION_INTERNAL_ERROR',
      500,
      true
    );
  }
}

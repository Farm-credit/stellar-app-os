import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTokenizationOrchestrator,
  registryClientFactory,
} from '@/lib/carbon-tokenization/runtime';
import {
  creditVerificationRequestSchema,
  validationErrors,
} from '@/lib/certification/validation';
import logger from '@/lib/logger';
import { MemoryRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenizeRequestBodySchema = creditVerificationRequestSchema
  .extend({
    recipientWallet: z
      .string()
      .trim()
      .min(1, 'recipientWallet is required')
      .max(120, 'recipientWallet is too long')
      .regex(
        /^(0x[a-fA-F0-9]{40}|G[A-Z2-7]{55})$/,
        'recipientWallet must be a valid Ethereum (0x) or Stellar (G...) public key'
      ),
    network: z.enum(['testnet', 'mainnet']).optional(),
  })
  .strict();

type TokenizeRequestBody = z.infer<typeof tokenizeRequestBodySchema>;

const ipRateLimiter = new MemoryRateLimiter({
  windowMs: 60_000,
  maxRequests: 12,
  backoffBaseMs: 5_000,
  backoffFactor: 3,
  maxBackoffMs: 10 * 60_000,
});

const walletRateLimiter = new MemoryRateLimiter({
  windowMs: 5 * 60_000,
  maxRequests: 20,
  backoffBaseMs: 10_000,
  backoffFactor: 2,
  maxBackoffMs: 30 * 60_000,
});

const serialRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 60_000,
  maxRequests: 3,
  backoffBaseMs: 60_000,
  backoffFactor: 5,
  maxBackoffMs: 24 * 60 * 60_000,
});

function extractClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const xr = request.headers.get('x-real-ip');
  if (xr) return xr.trim();
  return 'unknown';
}

function deriveOrigin(request: Request): string | undefined {
  const host = request.headers.get('host');
  const xfh = request.headers.get('x-forwarded-host');
  const xfp = request.headers.get('x-forwarded-proto');
  const proto = xfp ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const effectiveHost = xfh ?? host;
  if (!effectiveHost) return process.env.NEXT_PUBLIC_APP_URL;
  return `${proto}://${effectiveHost}`;
}

function withRetryAfter(
  response: NextResponse,
  retryAfterSeconds: number
): NextResponse {
  response.headers.set('Retry-After', String(Math.ceil(retryAfterSeconds)));
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const txId =
    request.headers.get('x-request-id') ??
    `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const ip = extractClientIp(request);

  const ipRate = await ipRateLimiter.limit(`tokenize-credit:ip:${ip}`);
  if (!ipRate.success) {
    return withRetryAfter(
      NextResponse.json(
        {
          error: 'Too many requests from this IP',
          code: 'RATE_LIMITED',
          limit: ipRate.limit,
          remaining: ipRate.remaining,
          resetAt: new Date(ipRate.reset).toISOString(),
        },
        { status: 429 }
      ),
      ipRate.retryAfter ?? 60
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Request body must be valid JSON',
        code: 'INVALID_JSON',
      },
      { status: 400 }
    );
  }

  const parsed = tokenizeRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    const messages = validationErrors(parsed.error);
    return NextResponse.json(
      {
        error: 'Request validation failed',
        code: 'VALIDATION_ERROR',
        details: messages,
      },
      { status: 400 }
    );
  }

  const req: TokenizeRequestBody = parsed.data;

  const walletRate = await walletRateLimiter.limit(
    `tokenize-credit:wallet:${req.recipientWallet}`
  );
  if (!walletRate.success) {
    return withRetryAfter(
      NextResponse.json(
        {
          error: 'Too many tokenization requests for this wallet',
          code: 'WALLET_RATE_LIMITED',
          limit: walletRate.limit,
          remaining: walletRate.remaining,
          resetAt: new Date(walletRate.reset).toISOString(),
        },
        { status: 429 }
      ),
      walletRate.retryAfter ?? 300
    );
  }

  const serialKey = `tokenize-credit:serial:${req.protocol}:${req.serialNumber}`;
  const serialRate = await serialRateLimiter.limit(serialKey);
  if (!serialRate.success) {
    return withRetryAfter(
      NextResponse.json(
        {
          error:
            'This serial number has been submitted too many times recently',
          code: 'SERIAL_RATE_LIMITED',
          limit: serialRate.limit,
          remaining: serialRate.remaining,
          resetAt: new Date(serialRate.reset).toISOString(),
        },
        { status: 429 }
      ),
      serialRate.retryAfter ?? 3600
    );
  }

  const protocolClient = registryClientFactory(req.protocol);
  if (!protocolClient) {
    return NextResponse.json(
      {
        error: `${req.protocol} registry client is not configured. Configure ${
          req.protocol === 'verra' ? 'VERRA' : 'GOLD_STANDARD'
        }_API_BASE_URL in environment.`,
        code: 'PROTOCOL_NOT_CONFIGURED',
        field: 'protocol',
      },
      { status: 503 }
    );
  }

  try {
    const orchestrator = getTokenizationOrchestrator(deriveOrigin(request));

    const tokenizationRequest = {
      protocol: req.protocol,
      projectId: req.projectId,
      serialNumber: req.serialNumber,
      recipientWallet: req.recipientWallet,
      vintage: req.vintage,
      expectedTonnage: req.quantity,
      network: req.network,
    };

    const result = await orchestrator.tokenize(tokenizationRequest);

    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          tokenId: result.tokenId,
          txHash: result.mint?.txHash,
          contractAddress: result.mint?.contractAddress,
          network: result.mint?.network,
          metadataUri: result.metadataUri,
          validationId: result.validation?.validationId,
          record: result.record
            ? {
                id: result.record.id,
                protocol: result.record.protocol,
                projectId: result.record.projectId,
                serialNumber: result.record.serialNumber,
                vintage: result.record.vintage,
                tonnage: result.record.tonnage,
                recipientWallet: result.record.recipientWallet,
                mintedAt: result.record.mintedAt,
              }
            : undefined,
          verification: result.validation
            ? {
                id: result.validation.validationId,
                validatedAt: result.validation.validatedAt,
                project: result.validation.project
                  ? {
                      projectId: result.validation.project.projectId,
                      projectName: result.validation.project.projectName,
                      projectStatus: result.validation.project.projectStatus,
                      vintage: result.validation.project.vintage,
                      totalTonnage: result.validation.project.totalTonnage,
                    }
                  : null,
                retirement: result.validation.retirement
                  ? {
                      serialNumber: result.validation.retirement.serialNumber,
                      vintage: result.validation.retirement.vintage,
                      tonnage: result.validation.retirement.tonnage,
                      retiredAt: result.validation.retirement.retiredAt,
                      retirementStatus:
                        result.validation.retirement.retirementStatus,
                    }
                  : null,
              }
            : undefined,
        },
        {
          status: 201,
          headers: {
            'X-Request-Id': txId,
            'X-RateLimit-Limit': String(ipRate.limit),
            'X-RateLimit-Remaining': String(ipRate.remaining),
            'X-RateLimit-Reset': String(Math.ceil(ipRate.reset / 1000)),
          },
        }
      );
    }

    const firstCode = result.errors[0]?.code ?? 'TOKENIZATION_FAILED';
    const isRetryable = result.errors.some((e) => e.retryable);
    const status = isRetryable
      ? firstCode.includes('REGISTRY') || firstCode.includes('TIMEOUT')
        ? 502
        : 503
      : firstCode === 'ALREADY_MINTED'
        ? 409
        : firstCode === 'PROJECT_NOT_FOUND' || firstCode === 'RETIREMENT_NOT_FOUND'
          ? 404
          : 422;

    return NextResponse.json(
      {
        success: false,
        error: result.errors[0]?.message ?? 'Tokenization failed',
        code: firstCode,
        details: result.errors.map((e) => ({
          code: e.code,
          message: e.message,
          field: e.field,
          expected: e.expected,
          actual: e.actual,
          retryable: e.retryable,
        })),
        validationId: result.validation?.validationId,
      },
      {
        status,
        headers: {
          'X-Request-Id': txId,
          'X-RateLimit-Limit': String(ipRate.limit),
          'X-RateLimit-Remaining': String(ipRate.remaining),
        },
      }
    );
  } catch (error) {
    logger.error('[api:tokenize-credit] Unhandled error', {
      txId,
      ip,
      protocol: req.protocol,
      projectId: req.projectId,
      serialNumber: req.serialNumber,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during tokenization',
        code: 'INTERNAL_ERROR',
        requestId: txId,
      },
      { status: 500 }
    );
  }
}

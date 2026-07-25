import { createLogger, format, transports } from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// ── Request context ────────────────────────────────────────────────────────────

export const requestContext = new AsyncLocalStorage<{ txId: string }>();

export function getTxId(): string {
  return requestContext.getStore()?.txId ?? 'no-txid';
}

// ── Sensitive-key redaction ────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'authorization',
  'walletToken',
  'wallet_token',
  'mnemonic',
  'seed',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return result;
}

// ── Winston instance ───────────────────────────────────────────────────────────

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format((info) => {
      info.txId = getTxId();
      // Redact the entire log info object (splat args included)
      const splat = (info[Symbol.for('splat')] as unknown[]) ?? [];
      info[Symbol.for('splat')] = splat.map((a) => redact(a));
      return redact(info) as typeof info;
    })(),
    format.timestamp(),
    format.json()
  ),
  transports: [new transports.Console()],
});

export default logger;

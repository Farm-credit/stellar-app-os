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

const loggerTransports: any[] = [new transports.Console()];

// Add Logstash TCP transport if LOGSTASH_HOST and LOGSTASH_PORT are configured
if (process.env.LOGSTASH_HOST && process.env.LOGSTASH_PORT) {
  try {
    const logstashHost = process.env.LOGSTASH_HOST;
    const logstashPort = parseInt(process.env.LOGSTASH_PORT, 10);
    loggerTransports.push(
      new transports.Http({
        host: logstashHost,
        port: logstashPort,
        path: '/',
        ssl: false,
      })
    );
  } catch (err) {
    console.warn('[Logger] Failed to initialize Logstash transport:', err);
  }
}

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format((info) => {
      info.txId = getTxId();
      info.service = process.env.SERVICE_NAME ?? 'harvesta-app';
      info.environment = process.env.NODE_ENV ?? 'development';
      // Redact the entire log info object (splat args included)
      const splat = (info[Symbol.for('splat')] as unknown[]) ?? [];
      info[Symbol.for('splat')] = splat.map((a) => redact(a));
      // Redact in place. Returning `redact(info)` would hand winston a fresh
      // object built from Object.entries(), which drops the symbol-keyed
      // `level` the transports read — every entry would be silently discarded.
      for (const [key, value] of Object.entries(info)) {
        info[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(value);
      }
      return info;
    })(),
    format.timestamp(),
    format.json()
  ),
  transports: loggerTransports,
});

export default logger;


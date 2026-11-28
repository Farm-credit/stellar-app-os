import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class WebhookUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlValidationError';
  }
}

export interface LookupAddress {
  address: string;
  family: number;
}

export type DnsLookupFn = (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;

export interface ValidateWebhookUrlOptions {
  allowHttpLocalhost?: boolean;
  dnsLookup?: DnsLookupFn;
}

export interface ValidatedWebhookTarget {
  url: string;
  hostname: string;
  addresses: LookupAddress[];
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  );
}

function inCidr4(ipInt: number, base: string, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (ipv4ToInt(base) & mask);
}

export function isBlockedIpv4(ip: string): boolean {
  if (net.isIPv4(ip) === false) return true;
  const n = ipv4ToInt(ip);
  return (
    inCidr4(n, '0.0.0.0', 8) ||
    inCidr4(n, '10.0.0.0', 8) ||
    inCidr4(n, '100.64.0.0', 10) ||
    inCidr4(n, '127.0.0.0', 8) ||
    inCidr4(n, '169.254.0.0', 16) ||
    inCidr4(n, '172.16.0.0', 12) ||
    inCidr4(n, '192.0.0.0', 24) ||
    inCidr4(n, '192.168.0.0', 16) ||
    inCidr4(n, '198.18.0.0', 15) ||
    inCidr4(n, '224.0.0.0', 4) ||
    inCidr4(n, '240.0.0.0', 4)
  );
}

function expandIpv6ToWords(ip: string): number[] | null {
  const zoneIdx = ip.indexOf('%');
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;
  const parts = clean.split('::');
  if (parts.length > 2) return null;

  const parseSide = (side: string): number[] => {
    if (!side) return [];
    const tokens = side.split(':');
    const words: number[] = [];
    for (const token of tokens) {
      if (token.includes('.')) {
        if (!net.isIPv4(token)) return [];
        const octets = token.split('.').map(Number);
        words.push(
          ((octets[0] ?? 0) << 8) | (octets[1] ?? 0),
          ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)
        );
      } else {
        words.push(parseInt(token, 16));
      }
    }
    return words;
  };

  if (parts.length === 1) {
    const words = parseSide(parts[0] ?? '');
    return words.length === 8 ? words : null;
  }

  const left = parseSide(parts[0] ?? '');
  const right = parseSide(parts[1] ?? '');
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

export function isBlockedIpv6(ip: string): boolean {
  const words = expandIpv6ToWords(ip);
  if (!words) return true;

  const isUnspecified = words.every((w) => w === 0);
  if (isUnspecified) return true;

  const isLoopback = words.slice(0, 7).every((w) => w === 0) && words[7] === 1;
  if (isLoopback) return true;

  // IPv4-mapped ::ffff:0:0/96
  const isV4Mapped = words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff;
  if (isV4Mapped) {
    const w6 = words[6] ?? 0;
    const w7 = words[7] ?? 0;
    const ipv4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isBlockedIpv4(ipv4);
  }

  const firstWord = words[0] ?? 0;
  // fc00::/7 (ULA)
  if ((firstWord & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (link-local)
  if ((firstWord & 0xffc0) === 0xfe80) return true;

  // ff00::/8 (multicast)
  if ((firstWord & 0xff00) === 0xff00) return true;

  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isBlockedIpv4(address);
  if (ipVersion === 6) return isBlockedIpv6(address);
  return true;
}

function isLocalhostHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.localhost')
  );
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  );
}

export async function validateWebhookUrl(
  rawUrl: string,
  options: ValidateWebhookUrlOptions = {}
): Promise<ValidatedWebhookTarget> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new WebhookUrlValidationError('Webhook URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new WebhookUrlValidationError('Webhook URL must be a valid URL.');
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new WebhookUrlValidationError('Webhook URL must not contain embedded credentials.');
  }

  const rawHostname = stripIpv6Brackets(parsed.hostname);
  const allowLocalhostHttp =
    options.allowHttpLocalhost === true &&
    parsed.protocol === 'http:' &&
    isLocalhostHostname(rawHostname);

  if (parsed.protocol !== 'https:' && !allowLocalhostHttp) {
    throw new WebhookUrlValidationError('Webhook URL must use the https: protocol.');
  }

  if (!allowLocalhostHttp && parsed.port !== '' && parsed.port !== '443') {
    throw new WebhookUrlValidationError('Webhook URL must use default HTTPS port 443.');
  }

  if (!rawHostname) {
    throw new WebhookUrlValidationError('Webhook URL must include a valid hostname.');
  }

  if (!allowLocalhostHttp && isBlockedHostname(rawHostname)) {
    throw new WebhookUrlValidationError(`Webhook host "${rawHostname}" is not permitted.`);
  }

  if (net.isIP(rawHostname) !== 0) {
    if (!allowLocalhostHttp && isBlockedIpAddress(rawHostname)) {
      throw new WebhookUrlValidationError(
        `Webhook IP address "${rawHostname}" is in a blocked private or reserved range.`
      );
    }
    return {
      url: parsed.toString(),
      hostname: rawHostname,
      addresses: [{ address: rawHostname, family: net.isIP(rawHostname) }],
    };
  }

  if (allowLocalhostHttp) {
    return {
      url: parsed.toString(),
      hostname: rawHostname,
      addresses: [{ address: '127.0.0.1', family: 4 }],
    };
  }

  const dnsLookup = options.dnsLookup ?? ((host, opts) => lookup(host, opts));

  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(rawHostname, { all: true });
  } catch {
    throw new WebhookUrlValidationError(`Unable to resolve webhook hostname "${rawHostname}".`);
  }

  if (!addresses || addresses.length === 0) {
    throw new WebhookUrlValidationError(
      `Webhook hostname "${rawHostname}" resolved to no addresses.`
    );
  }

  for (const entry of addresses) {
    if (isBlockedIpAddress(entry.address)) {
      throw new WebhookUrlValidationError(
        `Webhook hostname "${rawHostname}" resolves to blocked IP address "${entry.address}".`
      );
    }
  }

  return {
    url: parsed.toString(),
    hostname: rawHostname,
    addresses,
  };
}

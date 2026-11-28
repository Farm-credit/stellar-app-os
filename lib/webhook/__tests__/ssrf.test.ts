import { describe, expect, it } from 'vitest';
import { isBlockedIpAddress, validateWebhookUrl, WebhookUrlValidationError } from '../ssrf';

const publicDns = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]);

describe('validateWebhookUrl (SSRF protection)', () => {
  it('accepts valid HTTPS URLs resolving to public IPs', async () => {
    const res = await validateWebhookUrl('https://hooks.partner.example/offsets', {
      dnsLookup: publicDns,
    });
    expect(res.hostname).toBe('hooks.partner.example');
    expect(res.addresses[0]?.address).toBe('93.184.216.34');
  });

  it('rejects non-HTTPS schemes, embedded credentials, and non-443 ports', async () => {
    await expect(
      validateWebhookUrl('http://hooks.partner.example/offsets', { dnsLookup: publicDns })
    ).rejects.toThrow(WebhookUrlValidationError);
    await expect(
      validateWebhookUrl('ftp://hooks.partner.example/offsets', { dnsLookup: publicDns })
    ).rejects.toThrow(/https/);
    await expect(
      validateWebhookUrl('https://user:pass@hooks.partner.example/offsets', {
        dnsLookup: publicDns,
      })
    ).rejects.toThrow(/credentials/);
    await expect(
      validateWebhookUrl('https://hooks.partner.example:8443/offsets', {
        dnsLookup: publicDns,
      })
    ).rejects.toThrow(/443/);
  });

  it('rejects localhost, internal hostnames, and private/metadata IPs', async () => {
    const blockedUrls = [
      'https://localhost/hook',
      'https://sub.localhost/hook',
      'https://service.local/hook',
      'https://metadata.internal/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.1/hook',
      'https://172.16.0.1/hook',
      'https://192.168.1.10/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.0.1/hook',
      'https://[::1]/hook',
      'https://[fe80::1]/hook',
      'https://[fc00::1]/hook',
      'https://[::ffff:127.0.0.1]/hook',
    ];

    for (const url of blockedUrls) {
      await expect(validateWebhookUrl(url, { dnsLookup: publicDns })).rejects.toThrow(
        WebhookUrlValidationError
      );
    }
  });

  it('rejects hostnames that resolve via DNS to private/metadata IPs', async () => {
    await expect(
      validateWebhookUrl('https://rebind.attacker.example/hook', {
        dnsLookup: () => Promise.resolve([{ address: '169.254.169.254', family: 4 }]),
      })
    ).rejects.toThrow(/blocked IP address/);
  });

  it('correctly classifies blocked vs public IP addresses', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('93.184.216.34')).toBe(false);
    expect(isBlockedIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});

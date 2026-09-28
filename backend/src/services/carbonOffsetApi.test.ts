// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Offset Embeddable API Tests
 * Issue #1415
 */

import {
  EmbedConfig,
  OffsetPurchaseRequest,
  OffsetPurchaseResponse,
  EmbedScriptConfig,
} from './carbonOffsetApi';
import {
  generateApiKey,
  hashApiKey,
  isAllowedOrigin,
  isAllowedRedirectUrl,
  isValidAllowedDomain,
} from './carbonOffsetSecurity';

describe('Carbon offset embed security', () => {
  it('generates random keys with stable, one-way hashes', () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first).toMatch(/^fc_live_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashApiKey(first)).toBe(hashApiKey(first));
    expect(hashApiKey(first)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('matches exact hosts only', () => {
    expect(isAllowedOrigin('https://shop.example.com', ['shop.example.com'])).toBe(true);
    expect(isAllowedOrigin('https://other.example.com', ['shop.example.com'])).toBe(false);
    expect(isAllowedOrigin('https://shop.example.com', ['example.com'])).toBe(false);
    expect(isAllowedOrigin('http://shop.example.com', ['shop.example.com'])).toBe(false);
  });

  it('accepts only valid domain entries and redirect origins on the allowlist', () => {
    expect(isValidAllowedDomain('shop.example.com')).toBe(true);
    expect(isValidAllowedDomain('*.example.com')).toBe(false);
    expect(isValidAllowedDomain('https://example.com/path')).toBe(false);
    expect(isAllowedRedirectUrl('https://shop.example.com/complete', ['shop.example.com'])).toBe(true);
    expect(isAllowedRedirectUrl('https://attacker.example/complete', ['shop.example.com'])).toBe(false);
  });
});

describe('Carbon Offset Embeddable API Types', () => {
  it('should have valid EmbedConfig interface', () => {
    const config: EmbedConfig = {
      apiKey: 'fc_live_test123',
      companyId: 'company-1',
      allowedDomains: ['example.com', 'shop.example.com'],
      theme: 'light',
      primaryColor: '#22c55e',
      showProjectSelector: true,
      defaultProjectId: 'proj-1',
      defaultAmount: 1,
      currency: 'USD',
      locale: 'en',
      webhookUrl: 'https://example.com/webhook',
      metadata: { source: 'checkout' },
    };
    expect(config.apiKey).toContain('fc_live_');
    expect(config.allowedDomains.length).toBe(2);
  });

  it('should have valid OffsetPurchaseRequest interface', () => {
    const request: OffsetPurchaseRequest = {
      projectId: 'proj-1',
      amount: 2.5,
      currency: 'USD',
      customerEmail: 'customer@example.com',
      customerName: 'John Doe',
      metadata: { orderId: 'ord-123' },
      returnUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };
    expect(request.amount).toBe(2.5);
    expect(request.currency).toBe('USD');
  });

  it('should have valid OffsetPurchaseResponse interface', () => {
    const response: OffsetPurchaseResponse = {
      sessionId: 'cs_test123',
      checkoutUrl: 'https://checkout.example.com/session_123',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      amount: 2.5,
      currency: 'USD',
      projectId: 'proj-1',
      projectName: 'Amazon Reforestation',
      pricePerTon: 15.50,
      totalPrice: 38.75,
    };
    expect(response.sessionId).toContain('cs_');
    expect(response.totalPrice).toBe(38.75);
  });

  it('should have valid EmbedScriptConfig interface', () => {
    const config: EmbedScriptConfig = {
      apiKey: 'fc_live_test123',
      containerId: 'farm-credit-offset',
      mode: 'widget',
      projectId: 'proj-1',
      amount: 1,
      theme: 'light',
      primaryColor: '#22c55e',
      locale: 'en',
      onSuccess: (data) => console.log('Success:', data),
      onCancel: () => console.log('Cancelled'),
      onError: (err) => console.error('Error:', err),
    };
    expect(config.mode).toBe('widget');
    expect(typeof config.onSuccess).toBe('function');
  });
});
// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Offset Embeddable API
 * 
 * Issue #1415: Embeddable API allowing companies to offer carbon offset
 * purchasing directly on their e-commerce or website. White-label solution.
 * 
 * Features:
 * - API key management with domain allowlist
 * - Purchase session creation with Stripe-ready checkout flow
 * - Embeddable JavaScript SDK with widget/button/inline modes
 * - Themeable (light/dark/auto), customizable colors
 * - Project selector, amount presets, real-time pricing
 * - Modal checkout flow
 * - Project listing API for embed configuration
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface EmbedConfig {
  apiKey: string;
  companyId: string;
  allowedDomains: string[];
  theme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  showProjectSelector: boolean;
  defaultProjectId?: string;
  defaultAmount?: number;
  currency: 'USD' | 'EUR' | 'GBP';
  locale: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
}

export interface OffsetPurchaseRequest {
  projectId: string;
  amount: number; // in tons CO2
  currency: 'USD' | 'EUR' | 'GBP';
  customerEmail: string;
  customerName?: string;
  metadata?: Record<string, string>;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface OffsetPurchaseResponse {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  amount: number;
  currency: string;
  projectId: string;
  projectName: string;
  pricePerTon: number;
  totalPrice: number;
}

export interface EmbedScriptConfig {
  apiKey: string;
  containerId?: string;
  mode: 'button' | 'widget' | 'inline';
  projectId?: string;
  amount?: number;
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;
  locale?: string;
  onSuccess?: (data: { sessionId: string; amount: number; projectId: string }) => void;
  onCancel?: () => void;
  onError?: (error: string) => void;
}

/**
 * Validate API key and return embed config
 */
export async function validateApiKey(apiKey: string): Promise<EmbedConfig | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('embed_api_keys')
    .select('*')
    .eq('key_hash', hashApiKey(apiKey))
    .eq('active', true)
    .single();

  if (error || !data) return null;

  return {
    apiKey: data.api_key,
    companyId: data.company_id,
    allowedDomains: data.allowed_domains,
    theme: data.theme,
    primaryColor: data.primary_color,
    showProjectSelector: data.show_project_selector,
    defaultProjectId: data.default_project_id,
    defaultAmount: data.default_amount,
    currency: data.currency,
    locale: data.locale,
    webhookUrl: data.webhook_url,
    metadata: data.metadata,
  };
}

/**
 * Create a new embed API key for a company
 */
export async function createEmbedApiKey(data: {
  companyId: string;
  name: string;
  allowedDomains: string[];
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;
  showProjectSelector?: boolean;
  defaultProjectId?: string;
  defaultAmount?: number;
  currency?: 'USD' | 'EUR' | 'GBP';
  locale?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
}): Promise<{ apiKey: string; config: EmbedConfig }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  const config: EmbedConfig = {
    apiKey,
    companyId: data.companyId,
    allowedDomains: data.allowedDomains,
    theme: data.theme || 'light',
    primaryColor: data.primaryColor || '#22c55e',
    showProjectSelector: data.showProjectSelector ?? true,
    defaultProjectId: data.defaultProjectId,
    defaultAmount: data.defaultAmount,
    currency: data.currency || 'USD',
    locale: data.locale || 'en',
    webhookUrl: data.webhookUrl,
    metadata: data.metadata,
  };

  const { error } = await supabase
    .from('embed_api_keys')
    .insert({
      company_id: data.companyId,
      name: data.name,
      key_hash: keyHash,
      allowed_domains: data.allowedDomains,
      theme: config.theme,
      primary_color: config.primaryColor,
      show_project_selector: config.showProjectSelector,
      default_project_id: config.defaultProjectId,
      default_amount: config.defaultAmount,
      currency: config.currency,
      locale: config.locale,
      webhook_url: config.webhookUrl,
      metadata: config.metadata,
      active: true,
      created_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create API key: ${error.message}`);
  }

  return { apiKey, config };
}

/**
 * Create a purchase session for offset credits
 */
export async function createOffsetPurchaseSession(
  config: EmbedConfig,
  request: OffsetPurchaseRequest
): Promise<OffsetPurchaseResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate project exists and is active
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, price_per_ton, currency, available_credits, status')
    .eq('id', request.projectId)
    .single();

  if (projectError || !project || project.status !== 'active') {
    throw new Error('Project not found or not available');
  }

  // Check availability
  if (project.available_credits < request.amount) {
    throw new Error('Insufficient credits available');
  }

  // Calculate total
  const pricePerTon = project.price_per_ton;
  const totalPrice = pricePerTon * request.amount;

  // Create Stripe checkout session (or payment provider)
  // For now, simulate
  const sessionId = `cs_${generateId()}`;
  const checkoutUrl = `${process.env.NEXT_PUBLIC_APP_URL}/embed/checkout/${sessionId}`;

  // Store session
  const { error: sessionError } = await supabase
    .from('embed_checkout_sessions')
    .insert({
      session_id: sessionId,
      api_key: config.apiKey,
      company_id: config.companyId,
      project_id: request.projectId,
      amount: request.amount,
      currency: request.currency,
      price_per_ton: pricePerTon,
      total_price: totalPrice,
      customer_email: request.customerEmail,
      customer_name: request.customerName,
      metadata: request.metadata,
      return_url: request.returnUrl,
      cancel_url: request.cancelUrl,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      created_at: new Date().toISOString(),
    });

  if (sessionError) {
    throw new Error(`Failed to create session: ${sessionError.message}`);
  }

  return {
    sessionId,
    checkoutUrl,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    amount: request.amount,
    currency: request.currency,
    projectId: request.projectId,
    projectName: project.name,
    pricePerTon,
    totalPrice,
  };
}

/**
 * Verify checkout session completion
 */
export async function verifyCheckoutSession(sessionId: string): Promise<{
  completed: boolean;
  session?: any;
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('embed_checkout_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error || !data) {
    return { completed: false };
  }

  // In production, would verify with payment provider (Stripe)
  // For now, check status
  return {
    completed: data.status === 'completed',
    session: data,
  };
}

/**
 * Get projects available for embedding
 */
export async function getEmbeddableProjects(companyId: string): Promise<any[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, location, country, project_type, price_per_ton, currency, available_credits, risk_rating, images')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .gt('available_credits', 0)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return data || [];
}

/**
 * Generate embed script HTML
 */
export function generateEmbedScript(config: EmbedScriptConfig): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const scriptUrl = `${baseUrl}/api/embed/script`;
  
  const params = new URLSearchParams({
    key: config.apiKey,
    mode: config.mode,
    ...(config.projectId && { project: config.projectId }),
    ...(config.amount && { amount: config.amount.toString() }),
    ...(config.theme && { theme: config.theme }),
    ...(config.primaryColor && { color: config.primaryColor.replace('#', '') }),
    ...(config.locale && { locale: config.locale }),
    ...(config.containerId && { container: config.containerId }),
  });

  return `
<!-- Farm-credit Carbon Offset Embed -->
<div id="${config.containerId || 'farm-credit-offset'}"></div>
<script>
  (function() {
    var config = ${JSON.stringify(config)};
    var script = document.createElement('script');
    script.src = '${scriptUrl}?' + new URLSearchParams(config).toString();
    script.async = true;
    script.onload = function() {
      if (window.FarmCreditOffset) {
        window.FarmCreditOffset.init(config);
      }
    };
    document.head.appendChild(script);
  })();
</script>
<!-- End Farm-credit Carbon Offset Embed -->
  `.trim();
}

/**
 * Generate embed button HTML (for simple integration)
 */
export function generateEmbedButton(config: EmbedScriptConfig): string {
  const primaryColor = config.primaryColor || '#22c55e';
  const textColor = getContrastColor(primaryColor);
  
  return `
<!-- Farm-credit Carbon Offset Button -->
<div id="${config.containerId || 'farm-credit-offset-button'}"></div>
<script>
  (function() {
    var config = ${JSON.stringify(config)};
    var style = document.createElement('style');
    style.textContent = \`
      .fc-offset-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: ${primaryColor};
        color: ${textColor};
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.1s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .fc-offset-btn:hover { opacity: 0.9; }
      .fc-offset-btn:active { transform: scale(0.98); }
      .fc-offset-btn:focus { outline: 2px solid ${primaryColor}; outline-offset: 2px; }
      .fc-offset-leaf { width: 18px; height: 18px; }
    \`;
    document.head.appendChild(style);
    
    var btn = document.createElement('button');
    btn.className = 'fc-offset-btn';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2C6.477 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>Offset Carbon Footprint';
    btn.onclick = function() { this.open(config); }.bind(window.FarmCreditOffset);
    document.getElementById('${config.containerId || 'farm-credit-offset-button'}').appendChild(btn);
  })();
</script>
<!-- End Farm-credit Carbon Offset Button -->
  `.trim();
}

function getContrastColor(hexColor: string): string {
  const color = hexColor.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function hashApiKey(apiKey: string): string {
  // In production, use proper hashing (bcrypt, argon2)
  // This is a simplified version
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    const char = apiKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'fk_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
}

function generateApiKey(): string {
  const prefix = 'fc_live_';
  const randomPart = Array.from({ length: 32 }, () => 
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
  ).join('');
  return prefix + randomPart;
}

function generateId(): string {
  return Array.from({ length: 24 }, () => 
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
}
// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Carbon Offset Embeddable API
 * 
 * Issue #1415: Embeddable API allowing companies to offer carbon offset
 * purchasing directly on their e-commerce or website. White-label solution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { generateApiKey, hashApiKey } from './carbonOffsetSecurity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  widgetTitle?: string;
  brandName?: string;
  showBranding?: boolean;
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
  const { data, error } = await supabase
    .from('embed_api_keys')
    .select('*')
    .eq('key_hash', hashApiKey(apiKey))
    .eq('active', true)
    .single();

  if (error || !data) return null;

  return {
    apiKey,
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
    widgetTitle: data.widget_title,
    brandName: data.brand_name,
    showBranding: data.show_branding ?? false,
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
  widgetTitle?: string;
  brandName?: string;
  showBranding?: boolean;
}): Promise<{ apiKey: string; config: EmbedConfig }> {
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
    widgetTitle: data.widgetTitle,
    brandName: data.brandName,
    showBranding: data.showBranding ?? false,
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
      widget_title: config.widgetTitle,
      brand_name: config.brandName,
      show_branding: config.showBranding,
      active: true,
      created_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create API key: ${error.message}`);
  }

  return { apiKey, config };
}

export async function listEmbedApiKeys(companyId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('embed_api_keys')
    .select('id, name, allowed_domains, theme, primary_color, show_project_selector, default_project_id, default_amount, currency, locale, widget_title, brand_name, show_branding, active, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list embed API keys: ${error.message}`);
  return data || [];
}

export async function revokeEmbedApiKey(companyId: string, keyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('embed_api_keys')
    .update({ active: false })
    .eq('id', keyId)
    .eq('company_id', companyId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to revoke embed API key: ${error.message}`);
  return !!data;
}

/**
 * Create an offset purchase session
 */
export async function createOffsetPurchaseSession(
  config: EmbedConfig,
  request: OffsetPurchaseRequest
): Promise<OffsetPurchaseResponse> {
  // Validate project exists and is active
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, price_per_ton, currency, available_credits, status')
    .eq('id', request.projectId)
    .eq('company_id', config.companyId)
    .single();

  if (projectError || !project || project.status !== 'active') {
    throw new Error('Project not found or not available');
  }

  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  // Check availability
  if (project.available_credits < request.amount) {
    throw new Error('Insufficient credits available');
  }

  if (
    request.currency.toUpperCase() !== config.currency.toUpperCase() ||
    request.currency.toUpperCase() !== String(project.currency).toUpperCase()
  ) {
    throw new Error('Requested currency is not available for this project');
  }

  // Calculate total
  const pricePerTon = project.price_per_ton;
  const totalPrice = pricePerTon * request.amount;
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new Error('Project price is invalid');
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error('Stripe checkout is not configured');

  const stripe = new Stripe(stripeKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured');
  const defaultReturnUrl = new URL('/', appUrl).toString();
  const { data: reserved, error: reserveError } = await supabase.rpc('reserve_embed_project_credits', {
    p_project_id: request.projectId,
    p_amount: request.amount,
  });
  if (reserveError || reserved !== true) {
    throw new Error(reserveError?.message || 'Insufficient credits available');
  }

  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: request.customerEmail,
      line_items: [
        {
          price_data: {
            currency: request.currency.toLowerCase(),
            product_data: { name: `${project.name} carbon offset` },
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: request.returnUrl || defaultReturnUrl,
      cancel_url: request.cancelUrl || defaultReturnUrl,
      metadata: {
        ...request.metadata,
        companyId: config.companyId,
        projectId: request.projectId,
        amount: String(request.amount),
        currency: request.currency,
        customerEmail: request.customerEmail,
      },
    });
  } catch (error) {
    await supabase.rpc('release_embed_project_credits', {
      p_project_id: request.projectId,
      p_amount: request.amount,
    });
    throw error;
  }

  if (!stripeSession.url) {
    await stripe.checkout.sessions.expire(stripeSession.id).catch(() => undefined);
    await supabase.rpc('release_embed_project_credits', {
      p_project_id: request.projectId,
      p_amount: request.amount,
    });
    throw new Error('Stripe did not return a checkout URL');
  }
  const sessionId = stripeSession.id;
  const checkoutUrl = stripeSession.url;
  const expiresAt = stripeSession.expires_at
    ? new Date(stripeSession.expires_at * 1000).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Store session
  const { error: sessionError } = await supabase
    .from('embed_checkout_sessions')
    .insert({
      session_id: sessionId,
      api_key_hash: hashApiKey(config.apiKey),
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
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });

  if (sessionError) {
    await stripe.checkout.sessions.expire(sessionId).catch(() => undefined);
    await supabase.rpc('release_embed_project_credits', {
      p_project_id: request.projectId,
      p_amount: request.amount,
    });
    throw new Error(`Failed to create session: ${sessionError.message}`);
  }

  return {
    sessionId,
    checkoutUrl,
    expiresAt,
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
  const { data, error } = await supabase
    .from('embed_checkout_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error || !data) {
    return { completed: false };
  }

  return {
    completed: data.status === 'completed',
    session: data,
  };
}

export async function completeOffsetPurchaseSession(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_embed_checkout', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(`Failed to complete checkout session: ${error.message}`);
  return data === true;
}

export async function expireOffsetPurchaseSession(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('expire_embed_checkout', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(`Failed to expire checkout session: ${error.message}`);
  return data === true;
}

export async function getEmbedPurchaseStatus(
  sessionId: string,
  companyId: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('embed_checkout_sessions')
    .select('session_id, project_id, amount, currency, total_price, status, created_at, completed_at')
    .eq('session_id', sessionId)
    .eq('company_id', companyId)
    .eq('api_key_hash', hashApiKey(apiKey))
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch checkout status: ${error.message}`);
  return data;
}

/**
 * Get projects available for embedding
 */
export async function getEmbeddableProjects(companyId: string): Promise<any[]> {
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

  return `
<!-- Farm-credit Carbon Offset Embed -->
<div id="${config.containerId || 'farm-credit-offset'}"></div>
<script>
  (function() {
    var config = ${JSON.stringify({ ...config, apiBase: baseUrl })};
    var script = document.createElement('script');
    script.src = ${JSON.stringify(scriptUrl)} + '?key=' + encodeURIComponent(config.apiKey);
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
    btn.innerHTML = '<svg class="fc-offset-leaf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2C6.477 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>Offset Carbon Footprint';
    btn.onclick = function() {
      if (window.FarmCreditOffset) {
        window.FarmCreditOffset.open(config);
      }
    };
    document.getElementById('${config.containerId || 'farm-credit-offset-button'}').appendChild(btn);
  })();
</script>
<!-- End Farm-credit Carbon Offset Button -->
  `.trim();
}

function getContrastColor(hexColor: string): string {
  // Remove # if present
  const color = hexColor.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

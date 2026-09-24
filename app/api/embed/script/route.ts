// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Embed JavaScript SDK
 * Issue #1415: Carbon offset API - embed on websites
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/backend/src/services/carbonOffsetApi';

const EMBED_SDK = `
/**
 * Farm-credit Carbon Offset Embed SDK
 * Version 1.0.0
 */

(function() {
  'use strict';

  var FarmCreditOffset = {
    version: '1.0.0',
    config: null,
    widget: null,
    modal: null,

    init: function(userConfig) {
      this.config = userConfig;
      this.injectStyles();
      
      if (userConfig.container) {
        this.renderWidget(userConfig.container);
      } else if (userConfig.mode === 'button') {
        this.renderButton();
      }
      
      return this;
    },

    injectStyles: function() {
      if (document.getElementById('farm-credit-offset-styles')) return;
      
      var style = document.createElement('style');
      style.id = 'farm-credit-offset-styles';
      style.textContent = \`
        .fc-offset-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 400px;
          margin: 0 auto;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          overflow: hidden;
          background: white;
        }
        .fc-offset-widget.dark { background: #1f2937; color: white; }
        .fc-offset-header { padding: 20px; text-align: center; }
        .fc-offset-header h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
        .fc-offset-header p { margin: 0; font-size: 14px; opacity: 0.7; }
        .fc-offset-project { padding: 0 20px 16px; border-bottom: 1px solid #e5e7eb; }
        .fc-offset-project.dark { border-color: #374151; }
        .fc-offset-project-name { font-weight: 600; font-size: 16px; margin-bottom: 4px; }
        .fc-offset-project-location { font-size: 13px; opacity: 0.7; }
        .fc-offset-price { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
        .fc-offset-price-amount { font-size: 24px; font-weight: 700; }
        .fc-offset-price-per { font-size: 13px; opacity: 0.7; }
        .fc-offset-amount-selector { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .fc-offset-amount-input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 16px; }
        .fc-offset-amount-input.dark { background: #374151; border-color: #4b5563; color: white; }
        .fc-offset-presets { display: flex; gap: 8px; flex-wrap: wrap; }
        .fc-offset-preset { flex: 1; min-width: 80px; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; background: white; cursor: pointer; text-align: center; transition: all 0.2s; }
        .fc-offset-preset.dark { background: #374151; border-color: #4b5563; color: white; }
        .fc-offset-preset:hover { border-color: #22c55e; }
        .fc-offset-preset.active { border-color: #22c55e; background: #f0fdf4; }
        .fc-offset-preset.active.dark { background: #14532d; }
        .fc-offset-preset-value { font-weight: 600; font-size: 14px; }
        .fc-offset-preset-label { font-size: 11px; opacity: 0.7; }
        .fc-offset-footer { padding: 16px 20px; border-top: 1px solid #e5e7eb; }
        .fc-offset-footer.dark { border-color: #374151; }
        .fc-offset-btn { width: 100%; padding: 14px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .fc-offset-btn:hover { background: #16a34a; }
        .fc-offset-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .fc-offset-powered { text-align: center; margin-top: 12px; font-size: 11px; opacity: 0.5; }
        .fc-offset-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
        .fc-offset-modal-content { background: white; border-radius: 16px; max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.2); }
        .fc-offset-modal-content.dark { background: #1f2937; }
        .fc-offset-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.5; transition: opacity 0.2s; background: #f3f4f6; border: none; }
        .fc-offset-close:hover { opacity: 1; }
        .fc-offset-close.dark { background: #374151; }
        @media (max-width: 480px) { .fc-offset-modal-content { margin: 10px; border-radius: 12px; } }
      \`;
      document.head.appendChild(style);
    },

    renderWidget: function(containerId) {
      var container = document.getElementById(containerId);
      if (!container) return;
      
      var config = this.config;
      var theme = config.theme === 'dark' ? 'dark' : (config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : '');
      var primaryColor = config.primaryColor || '#22c55e';
      
      container.innerHTML = \`
        <div class="fc-offset-widget \${theme}" style="--fc-primary: \${primaryColor}">
          <div class="fc-offset-header \${theme}">
            <h3>Offset Your Carbon Footprint</h3>
            <p>Support verified carbon reduction projects</p>
          </div>
          <div class="fc-offset-project \${theme}" id="fc-project-info">
            <div class="fc-offset-project-name">Select a project</div>
            <div class="fc-offset-project-location">Choose from verified projects</div>
          </div>
          <div class="fc-offset-price \${theme}" id="fc-price">
            <span class="fc-offset-price-amount" id="fc-total-price">$0.00</span>
            <span class="fc-offset-price-per">/ton</span>
          </div>
          <div class="fc-offset-amount-selector \${theme}">
            <input type="number" class="fc-offset-amount-input \${theme}" id="fc-amount" placeholder="Tons CO₂" min="0.1" step="0.1" value="1">
            <div class="fc-offset-presets" id="fc-presets"></div>
          </div>
          <div class="fc-offset-footer \${theme}">
            <button class="fc-offset-btn" id="fc-checkout-btn" disabled>Select Project to Continue</button>
            <p class="fc-offset-powered">Powered by Farm-credit</p>
          </div>
        </div>
      \`;
      
      this.bindWidgetEvents();
      this.loadProjects();
    },

    bindWidgetEvents: function() {
      var amountInput = document.getElementById('fc-amount');
      var checkoutBtn = document.getElementById('fc-checkout-btn');
      
      if (amountInput) {
        amountInput.addEventListener('input', function() {
          this.updatePrice();
        }.bind(this));
      }
      
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function() {
          this.openCheckout();
        }.bind(this));
      }
    },

    loadProjects: function() {
      var presets = document.getElementById('fc-presets');
      if (!presets) return;
      
      var amounts = [0.5, 1, 2, 5, 10, 25];
      presets.innerHTML = amounts.map(function(amt) {
        return '<button type="button" class="fc-offset-preset" data-amount="' + amt + '"><div class="fc-offset-preset-value">' + amt + 't</div><div class="fc-offset-preset-label">CO₂</div></button>';
      }).join('');
      
      presets.querySelectorAll('.fc-offset-preset').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.fc-offset-preset').forEach(function(b) { b.classList.remove('active'); });
          this.classList.add('active');
          var amountInput = document.getElementById('fc-amount');
          if (amountInput) { amountInput.value = this.dataset.amount; amountInput.dispatchEvent(new Event('input')); }
        });
      });
    },

    updatePrice: function() {
      var amountInput = document.getElementById('fc-amount');
      var totalPrice = document.getElementById('fc-total-price');
      var checkoutBtn = document.getElementById('fc-checkout-btn');
      
      var amount = parseFloat(amountInput?.value) || 0;
      if (amount > 0 && checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Checkout - $' + (amount * 15).toFixed(2);
      } else if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Select Project to Continue';
      }
      
      if (totalPrice && amount > 0) {
        totalPrice.textContent = '$' + (amount * 15).toFixed(2);
      }
    },

    openCheckout: function() {
      var amountInput = document.getElementById('fc-amount');
      var amount = parseFloat(amountInput?.value) || 0;
      if (amount <= 0) return;
      
      window.open('/api/embed/checkout?amount=' + amount, '_blank');
    },

    open: function(config) {
      this.config = config || this.config;
      this.openModal();
    },

    openModal: function() {
      var modal = document.createElement('div');
      modal.className = 'fc-offset-modal';
      modal.innerHTML = \`
        <div class="fc-offset-modal-content">
          <button class="fc-offset-close" id="fc-modal-close" aria-label="Close">&times;</button>
          <div id="fc-modal-widget"></div>
        </div>
      \`;
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';
      
      document.getElementById('fc-modal-close').addEventListener('click', function() {
        this.closeModal();
      }.bind(this));
      
      modal.addEventListener('click', function(e) {
        if (e.target === modal) this.closeModal();
      }.bind(this));
      
      this.renderWidget('fc-modal-widget');
    },

    closeModal: function() {
      var modal = document.querySelector('.fc-offset-modal');
      if (modal) {
        modal.remove();
        document.body.style.overflow = '';
      }
    },

    renderButton: function() {
      var config = this.config;
      var container = document.getElementById(config.containerId || 'farm-credit-offset-button');
      if (!container) return;
      
      var primaryColor = config.primaryColor || '#22c55e';
      var textColor = this.getContrastColor(primaryColor);
      
      var btn = document.createElement('button');
      btn.className = 'fc-offset-btn';
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:' + primaryColor + ';color:' + textColor + ';border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s,transform 0.1s;';
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2C6.477 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>Offset Carbon Footprint';
      btn.onclick = function() { this.open(config); }.bind(this);
      container.appendChild(btn);
    },

    getContrastColor: function(hexColor) {
      var color = hexColor.replace('#', '');
      var r = parseInt(color.substr(0, 2), 16);
      var g = parseInt(color.substr(2, 2), 16);
      var b = parseInt(color.substr(4, 2), 16);
      var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#000000' : '#ffffff';
    },
  };

  // Expose globally
  window.FarmCreditOffset = FarmCreditOffset;

  // Auto-init from script tag
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var autoConfig = currentScript.dataset.config;
  if (autoConfig) {
    try {
      var config = JSON.parse(autoConfig);
      FarmCreditOffset.init(config);
    } catch (e) { console.error('FarmCreditOffset: Invalid config', e); }
  }
})();
`;

/**
 * GET /api/embed/script
 * Serve the embed JavaScript SDK
 * Query params: ?key=API_KEY (for validation)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('key');

    // Optional: validate API key
    if (apiKey) {
      const config = await validateApiKey(apiKey);
      if (!config) {
        return new NextResponse('Invalid API key', { status: 401 });
      }
    }

    return new NextResponse(EMBED_SDK, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Serve embed script error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
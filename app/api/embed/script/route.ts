// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Embed JavaScript SDK
 * Issue #1415: Carbon offset API - embed on websites
 * 
 * This serves the client-side JavaScript for the embeddable widget
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/backend/src/services/carbonOffsetApi';

const EMBED_SDK = `
/**
 * Farm-credit Carbon Offset Embed SDK
 * Version 1.0.0
 * 
 * Usage:
 * <script src="/api/embed/script?key=YOUR_API_KEY"></script>
 * <div id="farm-credit-offset"></div>
 * <script>
 *   FarmCreditOffset.init({ key: 'YOUR_API_KEY', mode: 'widget' });
 * </script>
 */

(function() {
  'use strict';
  var sdkScriptUrl = document.currentScript && document.currentScript.src;

  var FarmCreditOffset = {
    version: '1.0.0',
    config: null,
    apiBase: null,
    widget: null,
    modal: null,

    init: function(userConfig) {
      var scriptUrl = sdkScriptUrl;
      var scriptParams = scriptUrl ? new URL(scriptUrl).searchParams : new URLSearchParams();
      this.apiBase = userConfig.apiBase || (scriptUrl ? new URL(scriptUrl).origin : window.location.origin);
      this.config = Object.assign({}, userConfig, {
        apiKey: userConfig.apiKey || userConfig.key || scriptParams.get('key')
      });
      if (!this.config.apiKey) {
        if (typeof userConfig.onError === 'function') userConfig.onError('An embed API key is required');
        return this;
      }
      this.injectStyles();
      
      if (this.config.containerId || userConfig.container) {
        this.renderWidget(this.config.containerId || userConfig.container);
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
        .fc-offset-btn { width: 100%; padding: 14px; background: var(--fc-primary, #22c55e); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: filter 0.2s; }
        .fc-offset-btn:hover { filter: brightness(.92); }
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
            <h3 id="fc-offset-title">Offset Your Carbon Footprint</h3>
            <p>Support verified carbon reduction projects</p>
          </div>
            <div class="fc-offset-project \${theme}" id="fc-project-info">
              <label class="fc-offset-project-name" for="fc-project-select">Carbon project</label>
              <select class="fc-offset-amount-input \${theme}" id="fc-project-select" aria-label="Carbon project">
                <option value="">Loading available projects...</option>
              </select>
              <div class="fc-offset-project-location" id="fc-project-location"></div>
          </div>
          <div class="fc-offset-price \${theme}" id="fc-price">
            <span class="fc-offset-price-amount" id="fc-total-price">$0.00</span>
            <span class="fc-offset-price-per">/ton</span>
          </div>
          <div class="fc-offset-amount-selector \${theme}">
              <label for="fc-customer-email">Email for your receipt</label>
              <input type="email" class="fc-offset-amount-input \${theme}" id="fc-customer-email" autocomplete="email" required>
              <label for="fc-amount">Amount (tonnes CO₂)</label>
              <input type="number" class="fc-offset-amount-input \${theme}" id="fc-amount" placeholder="Tonnes CO₂" min="0.1" step="0.1" value="1">
            <div class="fc-offset-presets" id="fc-presets"></div>
          </div>
          <div class="fc-offset-footer \${theme}">
            <button class="fc-offset-btn" id="fc-checkout-btn" disabled>Select Project to Continue</button>
              <p class="fc-offset-powered" id="fc-offset-brand" hidden></p>
          </div>
        </div>
      \`;
      
      this.bindWidgetEvents();
      this.loadProjects();
    },

    bindWidgetEvents: function() {
      var amountInput = document.getElementById('fc-amount');
      var projectSelect = document.getElementById('fc-project-select');
      var emailInput = document.getElementById('fc-customer-email');
      var checkoutBtn = document.getElementById('fc-checkout-btn');
      [amountInput, projectSelect, emailInput].forEach(function(input) {
        if (input) input.addEventListener('input', function() { this.updatePrice(); }.bind(this));
        if (input && input.tagName === 'SELECT') input.addEventListener('change', function() { this.updatePrice(); }.bind(this));
      }, this);
      if (checkoutBtn) checkoutBtn.addEventListener('click', function() { this.openCheckout(); }.bind(this));
    },

    loadProjects: function() {
      var select = document.getElementById('fc-project-select');
      if (!select) return;
      fetch(this.apiBase + '/api/embed/projects', {
        headers: { 'Authorization': 'Bearer ' + this.config.apiKey }
      }).then(function(response) {
        if (!response.ok) throw new Error('Unable to load available carbon projects');
        return response.json();
      }).then(function(result) {
        var localConfig = this.config;
        this.config = Object.assign({}, localConfig, result.config || {}, {
          apiKey: localConfig.apiKey,
          apiBase: this.apiBase,
          containerId: localConfig.containerId,
          projectId: localConfig.projectId || (result.config && result.config.defaultProjectId),
          onSuccess: localConfig.onSuccess,
          onCancel: localConfig.onCancel,
          onError: localConfig.onError,
          returnUrl: localConfig.returnUrl,
          cancelUrl: localConfig.cancelUrl
        });
        var title = document.getElementById('fc-offset-title');
        var brand = document.getElementById('fc-offset-brand');
        var widget = select.closest('.fc-offset-widget');
        if (title) title.textContent = this.config.widgetTitle || 'Offset Your Carbon Footprint';
        if (widget) {
          var prefersDark = this.config.theme === 'dark' || (this.config.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          widget.classList.toggle('dark', prefersDark);
          widget.style.setProperty('--fc-primary', /^#[0-9a-fA-F]{6}$/.test(this.config.primaryColor || '') ? this.config.primaryColor : '#22c55e');
          ['fc-offset-project', 'fc-offset-price', 'fc-offset-amount-selector', 'fc-offset-footer'].forEach(function(className) {
            var element = widget.querySelector('.' + className);
            if (element) element.classList.toggle('dark', prefersDark);
          });
          widget.querySelectorAll('.fc-offset-amount-input').forEach(function(element) {
            element.classList.toggle('dark', prefersDark);
          });
        }
        if (brand) {
          brand.textContent = 'Powered by ' + (this.config.brandName || 'Farm-credit');
          brand.hidden = this.config.showBranding !== true;
        }
        var projects = result.projects || [];
        select.textContent = '';
        if (!projects.length) {
          select.add(new Option('No projects currently available', ''));
          this.updatePrice();
          return;
        }
        select.add(new Option('Choose a project', ''));
        projects.forEach(function(project) {
          var label = project.name + (project.location || project.country ? ' - ' + (project.location || project.country) : '');
          var option = new Option(label, project.id);
          option.dataset.price = String(project.price_per_ton);
          option.dataset.currency = project.currency || this.config.currency;
          select.add(option);
        }, this);
        if (this.config.projectId) select.value = this.config.projectId;
        if (!this.config.showProjectSelector && select.value) {
          document.getElementById('fc-project-info').style.display = 'none';
        }
        var amountInput = document.getElementById('fc-amount');
        if (amountInput && this.config.defaultAmount) amountInput.value = this.config.defaultAmount;
        this.updatePrice();
      }.bind(this)).catch(function(error) {
        select.textContent = '';
        select.add(new Option('Projects could not be loaded', ''));
        var checkoutBtn = document.getElementById('fc-checkout-btn');
        if (checkoutBtn) checkoutBtn.textContent = 'Projects unavailable';
        if (typeof this.config.onError === 'function') this.config.onError(error.message);
      }.bind(this));

      var presets = document.getElementById('fc-presets');
      if (!presets) return;
      var amounts = [0.5, 1, 2, 5, 10, 25];
      presets.innerHTML = amounts.map(function(amt) {
        return '<button type="button" class="fc-offset-preset" data-amount="\${amt}"><div class="fc-offset-preset-value">\${amt}t</div><div class="fc-offset-preset-label">CO₂</div></button>';
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
      var projectSelect = document.getElementById('fc-project-select');
      var emailInput = document.getElementById('fc-customer-email');
      var totalPrice = document.getElementById('fc-total-price');
      var checkoutBtn = document.getElementById('fc-checkout-btn');
      var amount = parseFloat(amountInput?.value) || 0;
      var option = projectSelect && projectSelect.options[projectSelect.selectedIndex];
      var price = option ? Number(option.dataset.price) : 0;
      var currency = option ? option.dataset.currency : this.config.currency || 'USD';
      var emailValid = emailInput && emailInput.checkValidity();
      var formattedPrice = new Intl.NumberFormat(this.config.locale || undefined, {
        style: 'currency', currency: currency || 'USD'
      }).format(amount * price);
      if (totalPrice) totalPrice.textContent = formattedPrice;
      if (checkoutBtn) {
        checkoutBtn.disabled = !(amount > 0 && price > 0 && emailValid);
        checkoutBtn.textContent = checkoutBtn.disabled ? 'Enter details to continue' : 'Continue to checkout - ' + formattedPrice;
      }
    },

    openCheckout: function() {
      var amountInput = document.getElementById('fc-amount');
      var projectSelect = document.getElementById('fc-project-select');
      var emailInput = document.getElementById('fc-customer-email');
      var amount = parseFloat(amountInput?.value) || 0;
      if (amount <= 0 || !projectSelect || !projectSelect.value || !emailInput || !emailInput.checkValidity()) return;
      var option = projectSelect.options[projectSelect.selectedIndex];
      var button = document.getElementById('fc-checkout-btn');
      if (button) { button.disabled = true; button.textContent = 'Preparing secure checkout...'; }
      fetch(this.apiBase + '/api/embed/purchase', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.config.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectSelect.value,
          amount: amount,
          currency: option.dataset.currency || this.config.currency || 'USD',
          customerEmail: emailInput.value.trim(),
          metadata: this.config.metadata || {},
          returnUrl: this.config.returnUrl,
          cancelUrl: this.config.cancelUrl
        })
      }).then(function(response) {
        return response.json().then(function(result) {
          if (!response.ok) throw new Error(result.error || 'Could not start checkout');
          return result;
        });
      }).then(function(result) {
        if (typeof this.config.onSuccess === 'function') this.config.onSuccess(result);
        window.location.assign(result.checkoutUrl);
      }.bind(this)).catch(function(error) {
        if (button) this.updatePrice();
        if (typeof this.config.onError === 'function') this.config.onError(error.message);
        else window.alert(error.message);
      }.bind(this));
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
      if (!config._brandLoaded && !config.primaryColor) {
        config._brandLoaded = true;
        fetch(this.apiBase + '/api/embed/projects', {
          headers: { 'Authorization': 'Bearer ' + config.apiKey }
        }).then(function(response) {
          if (!response.ok) throw new Error('Unable to load widget branding');
          return response.json();
        }).then(function(result) {
          this.config = Object.assign({}, result.config || {}, this.config);
        }.bind(this)).catch(function(error) {
          if (typeof config.onError === 'function') config.onError(error.message);
        }).then(function() {
          this.renderButton();
        }.bind(this));
        return;
      }

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
  var currentScript = document.currentScript || scripts[scripts.length - 1];
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
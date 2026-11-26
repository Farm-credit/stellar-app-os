/**
 * FarmCredit White-Label Sponsor Impact Widget SDK
 * Version: 1.0.0
 * 
 * Embeddable vanilla JavaScript widget displaying live funded tree counts,
 * community rewards distributed (CARBON tokens, NFT certificates), and
 * on-chain Stellar verification.
 */
(function() {
  'use strict';

  var currentScript = document.currentScript;
  var scriptUrl = currentScript && currentScript.src;
  var defaultApiBase = scriptUrl ? new URL(scriptUrl).origin : window.location.origin;

  var FarmCreditSponsorWidget = {
    version: '1.0.0',
    instances: [],

    init: function(userConfig) {
      userConfig = userConfig || {};
      var sponsor = userConfig.sponsor || (currentScript && currentScript.dataset.sponsor);
      if (!sponsor) {
        console.error('FarmCreditSponsorWidget: sponsor address or slug is required.');
        if (typeof userConfig.onError === 'function') userConfig.onError(new Error('Sponsor is required'));
        return null;
      }

      var config = {
        sponsor: sponsor,
        container: userConfig.container || userConfig.target || null,
        apiBase: userConfig.apiBase || defaultApiBase,
        layout: userConfig.layout || (currentScript && currentScript.dataset.layout) || 'card', // card, compact, banner, badge
        theme: userConfig.theme || (currentScript && currentScript.dataset.theme) || 'auto', // light, dark, auto
        primaryColor: userConfig.primaryColor || (currentScript && currentScript.dataset.accent) || null,
        showBranding: userConfig.showBranding !== undefined ? userConfig.showBranding : (currentScript && currentScript.dataset.showBranding !== 'false'),
        title: userConfig.title || (currentScript && currentScript.dataset.title) || null,
        showRecentRewards: userConfig.showRecentRewards !== undefined ? userConfig.showRecentRewards : true,
        onLoad: userConfig.onLoad || null,
        onError: userConfig.onError || null,
      };

      this.injectStyles();

      // Resolve container DOM element
      var containerEl = null;
      if (typeof config.container === 'string') {
        containerEl = document.querySelector(config.container);
      } else if (config.container && config.container.nodeType) {
        containerEl = config.container;
      } else {
        // Create adjacent container to script if script tag is used
        containerEl = document.createElement('div');
        containerEl.className = 'fc-sw-auto-container';
        if (currentScript && currentScript.parentNode) {
          currentScript.parentNode.insertBefore(containerEl, currentScript.nextSibling);
        } else {
          document.body.appendChild(containerEl);
        }
      }

      var instance = new WidgetInstance(config, containerEl);
      this.instances.push(instance);
      instance.mount();
      return instance;
    },

    injectStyles: function() {
      if (document.getElementById('fc-sponsor-widget-styles')) return;
      var style = document.createElement('style');
      style.id = 'fc-sponsor-widget-styles';
      style.textContent = `
        .fc-sw-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          box-sizing: border-box;
          line-height: 1.5;
          color: #0f172a;
          -webkit-font-smoothing: antialiased;
        }
        .fc-sw-root *, .fc-sw-root *::before, .fc-sw-root *::after {
          box-sizing: inherit;
        }
        .fc-sw-dark {
          color: #f8fafc;
        }
        .fc-sw-card {
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
          overflow: hidden;
          padding: 20px;
          max-width: 440px;
          width: 100%;
          transition: all 0.2s ease;
        }
        .fc-sw-dark .fc-sw-card {
          background: #0f172a;
          border-color: #1e293b;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .fc-sw-compact {
          max-width: 340px;
          padding: 16px;
        }
        .fc-sw-banner {
          max-width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          padding: 16px 24px;
        }
        .fc-sw-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .fc-sw-logo {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          object-fit: cover;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 18px;
          color: #10b981;
          flex-shrink: 0;
        }
        .fc-sw-dark .fc-sw-logo {
          background: #1e293b;
          border-color: #334155;
        }
        .fc-sw-brand-info {
          flex: 1;
          min-width: 0;
        }
        .fc-sw-brand-name {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fc-sw-subtitle {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0 0 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .fc-sw-dark .fc-sw-subtitle {
          color: #94a3b8;
        }
        .fc-sw-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: #059669;
          background: #ecfdf5;
          padding: 3px 8px;
          border-radius: 9999px;
          border: 1px solid #a7f3d0;
        }
        .fc-sw-dark .fc-sw-badge {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.3);
        }
        .fc-sw-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .fc-sw-stat-box {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          padding: 12px;
        }
        .fc-sw-dark .fc-sw-stat-box {
          background: #1e293b;
          border-color: #334155;
        }
        .fc-sw-stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .fc-sw-dark .fc-sw-stat-label {
          color: #94a3b8;
        }
        .fc-sw-stat-val {
          font-size: 22px;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
        }
        .fc-sw-dark .fc-sw-stat-val {
          color: #f8fafc;
        }
        .fc-sw-rewards-section {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(59, 130, 246, 0.06));
          border: 1px solid rgba(16, 185, 129, 0.15);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .fc-sw-rewards-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #059669;
          margin: 0 0 10px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .fc-sw-rewards-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fc-sw-reward-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }
        .fc-sw-reward-name {
          color: #475569;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fc-sw-dark .fc-sw-reward-name {
          color: #cbd5e1;
        }
        .fc-sw-reward-amount {
          font-weight: 700;
          color: #0f172a;
        }
        .fc-sw-dark .fc-sw-reward-amount {
          color: #f8fafc;
        }
        .fc-sw-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid #f1f5f9;
          font-size: 11px;
          color: #94a3b8;
        }
        .fc-sw-dark .fc-sw-footer {
          border-color: #1e293b;
        }
        .fc-sw-link {
          color: #10b981;
          text-decoration: none;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .fc-sw-link:hover {
          text-decoration: underline;
        }
        .fc-sw-loading, .fc-sw-error {
          padding: 24px;
          text-align: center;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .fc-sw-dark .fc-sw-loading, .fc-sw-dark .fc-sw-error {
          background: #0f172a;
          border-color: #1e293b;
        }
        .fc-sw-spinner {
          display: inline-block;
          width: 28px;
          height: 28px;
          border: 3px solid rgba(16, 185, 129, 0.2);
          border-radius: 50%;
          border-top-color: #10b981;
          animation: fc-sw-spin 0.8s linear infinite;
        }
        @keyframes fc-sw-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  };

  function WidgetInstance(config, container) {
    this.config = config;
    this.container = container;
    this.data = null;
    this.isDark = config.theme === 'dark' || (config.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  WidgetInstance.prototype.mount = function() {
    this.renderLoading();
    this.fetchData();
  };

  WidgetInstance.prototype.fetchData = function() {
    var self = this;
    var url = this.config.apiBase + '/api/v1/sponsor/widget-data?sponsor=' + encodeURIComponent(this.config.sponsor);
    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('Failed to load sponsor widget data (' + res.status + ')');
        return res.json();
      })
      .then(function(json) {
        self.data = json;
        self.render();
        if (typeof self.config.onLoad === 'function') self.config.onLoad(json);
      })
      .catch(function(err) {
        self.renderError(err.message);
        if (typeof self.config.onError === 'function') self.config.onError(err);
      });
  };

  WidgetInstance.prototype.renderLoading = function() {
    var themeClass = this.isDark ? 'fc-sw-dark' : '';
    this.container.innerHTML = `
      <div class="fc-sw-root ${themeClass}">
        <div class="fc-sw-loading">
          <div class="fc-sw-spinner"></div>
          <div style="margin-top: 10px; font-size: 13px; color: #64748b;">Loading live sponsor impact...</div>
        </div>
      </div>
    `;
  };

  WidgetInstance.prototype.renderError = function(message) {
    var self = this;
    var themeClass = this.isDark ? 'fc-sw-dark' : '';
    this.container.innerHTML = `
      <div class="fc-sw-root ${themeClass}">
        <div class="fc-sw-error">
          <div style="font-size: 14px; font-weight: 600; color: #ef4444; margin-bottom: 6px;">Unable to load impact data</div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">${message}</div>
          <button style="padding: 6px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: transparent; cursor: pointer; font-size: 12px;" id="fc-sw-retry-btn">Retry</button>
        </div>
      </div>
    `;
    var btn = this.container.querySelector('#fc-sw-retry-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        self.mount();
      });
    }
  };

  WidgetInstance.prototype.render = function() {
    var d = this.data;
    if (!d) return;

    var themeClass = this.isDark ? 'fc-sw-dark' : '';
    var accentColor = this.config.primaryColor || d.sponsor.primaryColor || '#10b981';
    var title = this.config.title || (d.sponsor.brandName + ' Ecological Impact');
    var isCompact = this.config.layout === 'compact';
    var isBanner = this.config.layout === 'banner';
    var layoutClass = isBanner ? 'fc-sw-banner' : (isCompact ? 'fc-sw-compact' : 'fc-sw-card');

    var logoHtml = d.sponsor.logoUrl
      ? `<img src="${d.sponsor.logoUrl}" alt="${d.sponsor.brandName}" class="fc-sw-logo" />`
      : `<div class="fc-sw-logo" style="color: ${accentColor}">${d.sponsor.brandName.charAt(0)}</div>`;

    var brandingHtml = this.config.showBranding
      ? `<span class="fc-sw-powered">Powered by <a href="https://farmcredit.org" target="_blank" rel="noopener" class="fc-sw-link">FarmCredit</a></span>`
      : `<span>Stellar Testnet</span>`;

    var html = `
      <div class="fc-sw-root ${themeClass}">
        <div class="fc-sw-card ${layoutClass}">
          <div class="fc-sw-header">
            ${logoHtml}
            <div class="fc-sw-brand-info">
              <h3 class="fc-sw-brand-name">${title}</h3>
              <div class="fc-sw-subtitle">
                <span class="fc-sw-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Stellar Verified
                </span>
                <span>• Live Escrow</span>
              </div>
            </div>
          </div>

          <div class="fc-sw-stats-grid">
            <div class="fc-sw-stat-box">
              <div class="fc-sw-stat-label">Trees Funded</div>
              <div class="fc-sw-stat-val" style="color: ${accentColor}">${Number(d.metrics.fundedTreesCount).toLocaleString()}</div>
            </div>
            <div class="fc-sw-stat-box">
              <div class="fc-sw-stat-label">Carbon Sequestered</div>
              <div class="fc-sw-stat-val">${Number(d.metrics.co2OffsetTonnes).toLocaleString()} <span style="font-size: 13px; font-weight: normal; color: #64748b;">tCO₂e</span></div>
            </div>
          </div>

          ${this.config.showRecentRewards ? `
          <div class="fc-sw-rewards-section">
            <div class="fc-sw-rewards-title">
              <span>Community Rewards Distributed</span>
              <span style="font-size: 11px; font-weight: 600; color: ${accentColor}">Stellar Soroban</span>
            </div>
            <div class="fc-sw-rewards-list">
              <div class="fc-sw-reward-row">
                <span class="fc-sw-reward-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>
                  CARBON Reward Tokens
                </span>
                <span class="fc-sw-reward-amount">${Number(d.communityRewards.carbonTokensDistributed).toLocaleString()} CARBON</span>
              </div>
              <div class="fc-sw-reward-row">
                <span class="fc-sw-reward-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  NFT Impact Certificates
                </span>
                <span class="fc-sw-reward-amount">${Number(d.communityRewards.nftCertificatesIssued).toLocaleString()} Minted</span>
              </div>
              <div class="fc-sw-reward-row">
                <span class="fc-sw-reward-name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  Stewards & Farmers Paid
                </span>
                <span class="fc-sw-reward-amount">${d.communityRewards.farmersRewardedCount + d.communityRewards.stewardsRewardedCount} Stewards</span>
              </div>
            </div>
          </div>
          ` : ''}

          <div class="fc-sw-footer">
            ${brandingHtml}
            <a href="${d.sponsor.stellarExplorerUrl}" target="_blank" rel="noopener noreferrer" class="fc-sw-link">
              Verify On-Chain &rarr;
            </a>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  };

  // Expose to window
  window.FarmCreditSponsorWidget = FarmCreditSponsorWidget;

  // Auto-init if dataset attributes are present on script tag
  if (currentScript && currentScript.dataset.sponsor) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        FarmCreditSponsorWidget.init();
      });
    } else {
      FarmCreditSponsorWidget.init();
    }
  }
})();

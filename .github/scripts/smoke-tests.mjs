// @ts-check
/**
 * Smoke tests -- run after every production deploy.
 * Checks that critical pages and API routes return expected status codes.
 * Also runs Lighthouse audits on key pages to ensure scores remain >90.
 */

import fetch from 'node-fetch';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
if (!BASE) {
  console.error('BASE_URL env var is required');
  process.exit(1);
}

/** @type {Array<{ path: string; expectedStatus: number; bodyContains?: string }> */
const CHECKS = [
  { path: '/', expectedStatus: 200, bodyContains: 'FarmCredit' },
  { path: '/impact', expectedStatus: 200, bodyContains: 'Trees Planted' },
  { path: '/marketplace', expectedStatus: 200 },
  { path: '/api/health', expectedStatus: 200, bodyContains: 'ok' },
  { path: '/api/impact', expectedStatus: 200, bodyContains: 'treesPlanted' },
  { path: '/not-a-real-page-xyz', expectedStatus: 404 },
];

/** Pages to run Lighthouse audits on */
const LIGHTHOUSE_PATHS = ['/', '/impact', '/marketplace'];
const LIGHTHOUSE_CATEGORIES = ['performance', 'accessibility', 'best-practices'];
const LIGHTHOUSE_FORM_FACTORS = ['mobile', 'desktop'];
const SCORE_THRESHOLD = 90; // strict >90

let passed = 0;
let failed = 0;

/** @param {string= formFactor */
function getLighthouseConfig(formFactor) {
  const isMobile = formFactor === 'mobile';
  return {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: LIGHTHOUSE_CATEGORIES,
      formFactor,
      screenEmulation: {
        mobile: isMobile,
        width: isMobile ? 360 : 1024,
        height: isMobile ? 640 : 768,
        deviceScaleFactor: isMobile ? 2 : 1,
      },
      throttling: isMobile
        ? { rttMs: 150, throughputKpbs: 1638.4, cpuSlowdownMultiplier: 4 }
        : { rttMs: 40, throughputKpbs: 10240, cpuSlowdownMultiplier: 1 },
    },
  };
}

/** @param {string= url @tparam {object} config */
async function runLighthouse(url, config) {
  const chrome = await launch({ chromeFlags: ['--headless', '--no-sandbox'] });
  try {
    const flags = { port: chrome.port, output: 'json' };
    const result = await lighthouse(url, flags, config);
    if (!result || !result.lhr || !result.lhr.categories) {
      throw new Error('Lighthouse did not return a valid report');
    }
    return result.lhr.categories;
  } finally {
    await chrome.kill();
  }
}

// HTTP smoke checks
for (const check of CHECKS) {
  const url = `${BASE}${check.path}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();

    const statusOk = res.status === check.expectedStatus;
    const bodyOk = !check.bodyContains || body.includes(check.bodyContains);

    if (statusOk && bodyOk) {
      console.log(`✅ `  ${check.path} -- ${res.status}`);
      passed++;
    } else {
      const reason = !statusOk
        ? `expected ${check.expectedStatus}, got ${res.status}`
        : `body missing "${check.bodyContains}"`;
      console.error(`✌  ${check.path} - ${reason}`);
      failed++;
    }
  } catch (err) {
    console.error(`✌  ${check.path} - fetch error: ${err.message}`);
    failed++;
  }
}

// Lighthouse performance audits
for (const path of LIGHTHOUSE_PATHS) {
  for (const formFactor of LIGHTHOUSE_FORM_FACTORS) {
    const url = `${BASE}${path}`;
    let categories;
    try {
      categories = await runLighthouse(url, getLighthouseConfig(formFactor));
    } catch (err) {
      console.error(`Ȝ  ${path} (${formFactor}) - Lighthouse error: ${err.message}`);
      failed++;
      continue;
    }

    for (const category of LIGHTHOUSE_CATEGORIES) {
      const categoryData = categories[category];
      if (!categoryData || typeof categoryData.score !== 'number') {
        console.error(`✀  ${path} (${formFactor}) - ${category} score not available`);
        failed++;
        continue;
      }

      const score = Math.round(categoryData.score * 100);
      const label = `${path} (${formFactor}) ${category} score is ${score}`;
      if (score > SCORE_THRESHOLD) {
        console.log(`⌀‍  ${label}`);
        passed++;
      } else {
        console.error(`Ȝ  ${label} - expected >${SCORE_THRESHOLD}, got ${score}`);
        failed++;
      }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

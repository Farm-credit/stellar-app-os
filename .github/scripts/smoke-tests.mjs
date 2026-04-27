// @ts-check
/**
 * Smoke tests — run after every production deploy.
 * Checks that critical pages and API routes return expected status codes.
 */

import fetch from 'node-fetch';

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
if (!BASE) {
  console.error('BASE_URL env var is required');
  process.exit(1);
}

/** @type {Array<{ path: string; expectedStatus: number; bodyContains?: string }>} */
const CHECKS = [
  { path: '/', expectedStatus: 200, bodyContains: 'FarmCredit' },
  { path: '/impact', expectedStatus: 200, bodyContains: 'Trees Planted' },
  { path: '/marketplace', expectedStatus: 200 },
  { path: '/api/health', expectedStatus: 200, bodyContains: 'ok' },
  { path: '/api/impact', expectedStatus: 200, bodyContains: 'treesPlanted' },
  { path: '/not-a-real-page-xyz', expectedStatus: 404 },
];

let passed = 0;
let failed = 0;

for (const check of CHECKS) {
  const url = `${BASE}${check.path}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();

    const statusOk = res.status === check.expectedStatus;
    const bodyOk = !check.bodyContains || body.includes(check.bodyContains);

    if (statusOk && bodyOk) {
      console.log(`✅  ${check.path} — ${res.status}`);
      passed++;
    } else {
      const reason = !statusOk
        ? `expected ${check.expectedStatus}, got ${res.status}`
        : `body missing "${check.bodyContains}"`;
      console.error(`❌  ${check.path} — ${reason}`);
      failed++;
    }
  } catch (err) {
    console.error(`❌  ${check.path} — fetch error: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

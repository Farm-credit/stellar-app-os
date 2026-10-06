/**
 * /api/v2/offset-aggregation — Issue #1364
 *
 * Compatibility entry point for portfolio managers looking for the named
 * offset aggregation API. The portfolio route remains the canonical handler
 * so validation, filtering, and source-failure behaviour cannot diverge.
 */

export const runtime = 'nodejs';
export { GET, POST } from '../portfolio/offsets/route';

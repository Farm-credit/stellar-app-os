import client from 'prom-client';
import { RequestHandler, Request, Response } from 'express';
import { NextRequest, NextResponse } from 'next/server';
import { MemoryRateLimiter } from '@/lib/rate-limit';
import { proxy } from './proxy';
import { handleCorsPreflight, getCorsHeaders } from './lib/cors';

export const runtime = 'edge';

// Create a registry
const register = new client.Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Define custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestCounter);

// Middleware to collect metrics for each request
export const metricsMiddleware: RequestHandler = (req: Request, res: Response, next) => {
  const startTime = process.hrtime.bigint();
  const route = req.route?.path || req.path;

  res.on('finish', () => {
    const durationInSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const labels = { method: req.method, route, status: res.statusCode.toString() };

    httpRequestDuration.labels(labels.method, labels.route, labels.status).observe(durationInSeconds);
    httpRequestCounter.labels(labels.method, labels.route, labels.status).inc();
  });

  next();
};

// Endpoint handler for Prometheus to scrape
export const metricsEndpoint = async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

const limiter = new MemoryRateLimiter();

export async function middleware(req: NextRequest) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const auth = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');
  const key = auth ? `user:$${auth}` : apiKey ? `apikey:${apiKey}` : `ip:${ip}`;

  const res = await limiter.limit(key, { windowMs: 60000, maxRequests: 100 });
  if (!res.success) {
    const errorResponse = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(res.retryAfter ?? 60) } }
    );
    const cors = getCorsHeaders(req.headers.get('origin'));
    for (const [k, v] of Object.entries(cors)) errorResponse.headers.set(k, v);
    return errorResponse;
  }

  const response = await proxy(req);
  const cors = getCorsHeaders(req.headers.get('origin'));
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  response.headers.set('X-RateLimit-Remaining', String(res.remaining));
  return response;
}

export const config = { matcher: '/api/:path*' };

export default register;
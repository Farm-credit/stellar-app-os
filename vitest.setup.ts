// Minimal Vitest setup to make tests deterministic and provide simple polyfills
if (typeof (globalThis as any).scrollIntoView === 'undefined') {
  (globalThis as any).scrollIntoView = () => {};
}

process.env.NODE_ENV ??= 'test';

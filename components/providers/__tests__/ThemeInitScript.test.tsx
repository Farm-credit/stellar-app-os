import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeInitScript } from '@/components/providers/ThemeInitScript';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Extracts the inline script body from the rendered <script> element and
 * evaluates it against a fresh document. This exercises the *actual* string
 * that ships to the browser, so a regression in the script text fails here.
 */
function runInitScript(): void {
  const { container } = render(<ThemeInitScript />);
  const script = container.querySelector('script#theme-init');
  expect(script).not.toBeNull();
  const body = script?.textContent ?? '';
  expect(body.length).toBeGreaterThan(0);

  // Reset the classes/attributes the script is expected to control.
  document.documentElement.className = '';
  delete document.documentElement.dataset.theme;

  // Intentionally executing the shipped script body against the test document.
  new Function(body)();
}

/**
 * Overrides `window.matchMedia` directly.
 *
 * `vi.stubGlobal` cannot reliably replace it because `vitest.setup.ts` defines
 * it via `Object.defineProperty` (non-configurable by default); we redefine it
 * the same way so the shipped script always observes the intended state.
 */
function stubMatchMedia(prefersDark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

/** Simulates an environment where `window.matchMedia` is not implemented. */
function unsetMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

/**
 * Installs a real Map-backed localStorage. Needed because the global vitest
 * setup replaces localStorage with a vi.fn() mock whose getItem always
 * returns undefined, which would make the script's stored-preference branch
 * untestable.
 */
function stubLocalStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  const fake = {
    getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
  };
  vi.stubGlobal('localStorage', fake);
  return store;
}

describe('ThemeInitScript (FOUC prevention)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  it('renders a blocking script in the document head', () => {
    const { container } = render(<ThemeInitScript />);
    const script = container.querySelector('script#theme-init');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('type')).toBeNull(); // classic script, executes on parse
  });

  it('applies the dark class for a stored "dark" preference', () => {
    stubLocalStorage({ theme: 'dark' });
    stubMatchMedia(false); // system prefers light — stored choice must win
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies no dark class for a stored "light" preference even when the system prefers dark', () => {
    stubLocalStorage({ theme: 'light' });
    stubMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('follows the system preference for a stored "system" preference', () => {
    stubLocalStorage({ theme: 'system' });
    stubMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    stubMatchMedia(false);
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('defaults to the system preference when nothing is stored', () => {
    stubLocalStorage();
    stubMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined(); // no stored choice to mirror
  });

  it('treats an empty stored value as "follow system"', () => {
    stubLocalStorage({ theme: '' });
    stubMatchMedia(false);
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('suppresses transitions on first paint', () => {
    stubLocalStorage();
    stubMatchMedia(false);
    runInitScript();
    expect(document.documentElement.classList.contains('no-transitions')).toBe(true);
  });

  it('does not throw when localStorage is unavailable', () => {
    stubLocalStorage();
    stubMatchMedia(true);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError: storage disabled');
      },
    });

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(true); // falls back to system
  });

  it('does not throw when matchMedia is unavailable', () => {
    stubLocalStorage();
    unsetMatchMedia();

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false); // light default
  });

  it('mirrors the storage key used by lib/theme.ts', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });
});

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTheme } from '@/hooks/useTheme';
import { THEME_STORAGE_KEY } from '@/lib/theme';

describe('useTheme hook', () => {
  let listeners: ((e: any) => void)[] = [];
  let matchesDark = false;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
    listeners = [];
    matchesDark = false;

    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      return {
        matches: matchesDark,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: any) => {
          if (event === 'change') {
            listeners.push(cb);
          }
        }),
        removeEventListener: vi.fn((event: string, cb: any) => {
          if (event === 'change') {
            listeners = listeners.filter((l) => l !== cb);
          }
        }),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with system theme and resolves to light when OS prefers light', () => {
    matchesDark = false;
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('system');
  });

  it('initializes with system theme and resolves to dark when OS prefers dark', () => {
    matchesDark = true;
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('respects stored theme in localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('allows manual override via setTheme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.isDark).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('allows toggling between light and dark', () => {
    const { result } = renderHook(() => useTheme());

    // Initially light
    expect(result.current.isDark).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isDark).toBe(true);
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isDark).toBe(false);
    expect(result.current.theme).toBe('light');
  });

  it('reacts dynamically to OS prefers-color-scheme change event when in system mode', () => {
    matchesDark = false;
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');

    // Simulate system preference changing to dark
    matchesDark = true;
    act(() => {
      listeners.forEach((listener) => listener({ matches: true }));
    });

    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

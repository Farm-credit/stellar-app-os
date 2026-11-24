'use client';

import { type JSX } from 'react';

/**
 * ThemeInitScript
 *
 * Renders a tiny blocking script in <head> that applies the persisted theme
 * (or the system preference when no choice is stored) to the document element
 * *before first paint*.
 *
 * Why: the theme class is otherwise applied from `useTheme` inside a
 * `useEffect`, which only runs after hydration. Users with a stored `dark`
 * preference (or a dark `prefers-color-scheme`) would see a white flash on
 * every page load (FOUC).
 *
 * The script is intentionally:
 *   - server-rendered so it executes before any paint,
 *   - dependency-free and defensive (browsers without localStorage/matchMedia
 *     simply keep the light default),
 *   - mirrors the exact keys/logic of `lib/theme.ts` (`theme` storage key,
 *     `dark` class, `no-transitions` suppression on first paint).
 *
 * NOTE: this file is authored as `.tsx` so Next.js inlines it via JSX; the
 * script body is a plain string with no external dependencies. Keep the
 * string in sync with `THEME_STORAGE_KEY` / `applyThemeToDocument` in
 * `lib/theme.ts` (the script cannot import server modules).
 */

const THEME_INIT_SCRIPT = `(function(){try{var k='theme';var v=null;try{v=window.localStorage.getItem(k);}catch(e){}var d=!!(v==='dark'||((v==null||v==='system'||v==='')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches));var el=document.documentElement;el.classList.toggle('dark',d);if(v){el.dataset.theme=v;}el.classList.add('no-transitions');}catch(e){}})();`;

export function ThemeInitScript(): JSX.Element {
  return <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}

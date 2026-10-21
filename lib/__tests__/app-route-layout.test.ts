import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';

it('keeps pages and handlers at distinct public URLs, including route groups', () => {
  const app = resolve(process.cwd(), 'app');
  const urls = new Map<string, string[]>();
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('_') && !entry.name.startsWith('@')) walk(path);
      } else if (/^(page|route)\.[jt]sx?$/.test(entry.name)) {
        const parts = relative(app, directory)
          .split(sep)
          .filter((part) => part && !part.startsWith('('));
        const url = '/' + parts.join('/');
        urls.set(url, [...(urls.get(url) ?? []), relative(app, path)]);
      }
    }
  }
  walk(app);
  expect([...urls.entries()].filter(([, files]) => files.length > 1)).toEqual([]);
});

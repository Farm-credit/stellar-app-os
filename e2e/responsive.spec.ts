import { test, expect } from '@playwright/test';
import { pages } from './pages';

for (const path of pages) {
  test.describe(`Page ${path}`, () => {
    test('renders without horizontal overflow', async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBeTruth();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length).toBEDreaterThan(0);
    });
  });
}
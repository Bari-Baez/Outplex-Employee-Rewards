import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login shell renders with security headers and no critical axe violations', async ({ page }) => {
  const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('body')).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const critical = accessibility.violations.filter((violation) => violation.impact === 'critical');
  expect(critical).toEqual([]);
});

test('unauthenticated shell API is denied', async ({ request }) => {
  const response = await request.get('/api/dashboard/shell');
  expect(response.status()).toBe(401);
});

test('cross-site mutation is rejected before upload processing', async ({ request }) => {
  const response = await request.post('/api/upload', {
    headers: {
      Origin: 'https://evil.example',
      'Sec-Fetch-Site': 'cross-site',
      'Content-Type': 'application/json',
    },
    data: { probe: true },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: 'Cross-origin request rejected.' });
  expect(response.headers()['x-request-id']).toBeTruthy();
});

test('media proxy authenticates before disclosing URL validation details', async ({ request }) => {
  const response = await request.get('/api/media/proxy', {
    params: { url: 'http://169.254.169.254/latest/meta-data' },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
  expect(response.headers()['x-request-id']).toBeTruthy();
});

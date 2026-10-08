import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { open, signIn } from './helpers';

// Signed in as the principal (principal.setup.ts). The principal reads; the administrator configures.
test('the principal sees the connector types but cannot add one', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/connectors');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connectors');
  await page.getByRole('tab', { name: 'Available types' }).click();
  await expect(page.getByTestId('conn-types')).toContainText('Outbound webhook');
  await expect(page.getByTestId('conn-add-webhook_out')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the administrator adds an outbound webhook, then removes it', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL: process.env.ERP_URL ?? 'http://localhost:3000', storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await signIn(page, 'admin@demo.kinetix.in');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await open(page, '/connectors');

  await page.getByRole('tab', { name: 'Available types' }).click();
  await page.getByTestId('conn-add-webhook_out').click();
  const dlg = dialog(page, 'Outbound webhook');
  const name = uniq('School site');
  await fillForm(page, dlg, { name, c_url: 'https://example.com/kinetix-hook', c_secret: 'a-long-signing-secret-1234', enabled: 'No' });
  await submitForm(dlg);

  await page.getByRole('tab', { name: 'My connectors' }).click();
  const row = page.getByTestId('conn-list').getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Outbound webhook');
  await expect(row.getByRole('button', { name: 'Switch on' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delivery log' })).toBeVisible();

  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByTestId('conn-list').getByRole('row').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test.describe('only the principal and administrator', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/connectors');
    await expect(page).toHaveURL(/\/$/);
  });
});

import { expect, test } from '@playwright/test';
import { watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts). The demo seed has no exam sessions, so this covers the session picker
// and the guarded links; the examiner flow needs scanned scripts and is covered by the API tests.
test('the evaluation desk opens on the session picker', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/evaluation');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('On-screen evaluation');
  await expect(page.getByTestId('ev-sessions').or(page.getByTestId('ev-sessions-empty'))).toBeVisible();
  expect(errors).toEqual([]);
});

test('a link to a session that does not exist shows an error, not a broken page', async ({ page }) => {
  await page.goto('/evaluation?session=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('On-screen evaluation');
  await expect(page.getByRole('link', { name: 'Back to sessions' })).toBeVisible();
  await expect(page.getByText('Not found')).toBeVisible();
});

test.describe('only the principal and administrator', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/evaluation');
    await expect(page).toHaveURL(/\/$/);
  });
});

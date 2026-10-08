import { expect, test } from '@playwright/test';
import { watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the audit log lists entries, filters them by action and offers a CSV download', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/audit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit log');
  const table = page.getByTestId('audit-table');
  await expect(table).toBeVisible();
  const total = page.getByTestId('audit-total');
  await expect(total).toHaveText(/^[\d,]+ entries$/);
  await expect(total).not.toHaveText('0 entries');
  await expect(page.getByTestId('audit-export')).toHaveAttribute('href', /\/api\/export\?path=%2Fv1%2Faudit%2Fexport/);

  // A filter nothing matches empties the list; the filter stays in the URL.
  await page.getByLabel('Action (end with * for a prefix)').fill('nothing.matches.this');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/action=nothing\.matches\.this/);
  await expect(page.getByTestId('audit-total')).toHaveText('0 entries');
  await expect(page.getByLabel('Action (end with * for a prefix)')).toHaveValue('nothing.matches.this');

  // A prefix finds the sign-ins the setup just made.
  await page.getByLabel('Action (end with * for a prefix)').fill('auth.*');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByTestId('audit-total')).not.toHaveText('0 entries');
  expect(errors).toEqual([]);
});

test.describe('only the principal and administrator', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/audit');
    await expect(page).toHaveURL(/\/$/);
  });
});

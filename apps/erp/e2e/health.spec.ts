import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal opens a health record and logs a nurse visit', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/health');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Health records');
  await page.getByTestId('hl-children').getByRole('button', { name: 'Open record' }).first().click();
  const detail = page.getByTestId('hl-detail');
  await expect(detail).toBeVisible();

  await page.getByRole('button', { name: 'Log a nurse visit' }).click();
  const dlg = dialog(page, 'Log a nurse visit');
  const complaint = uniq('Headache');
  await fillForm(page, dlg, { complaint, action: 'Rested and given water', sentHome: 'No' });
  await submitForm(dlg);
  await expect(detail).toContainText(complaint);
  await page.getByRole('button', { name: 'Close' }).last().click();

  await page.getByRole('tab', { name: 'Nurse visits' }).click();
  await expect(page.getByTestId('hl-visits')).toContainText(complaint);
  expect(errors).toEqual([]);
});

test.describe('only the principal, administrator and counsellor', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/health');
    await expect(page).toHaveURL(/\/$/);
  });
});

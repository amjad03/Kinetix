import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal opens a giving campaign and records a donation to it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/alumni');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alumni giving');
  await page.getByTestId('alm-new-campaign').click();
  const dlg = dialog(page, 'New campaign');
  const name = uniq('Library fund');
  await fillForm(page, dlg, { name, goal: '50000', receiptNote: 'Section 80G registered' });
  await submitForm(dlg);

  const row = page.getByTestId('alm-campaigns').getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.locator('[data-testid^="alm-donate-"]').click();
  const donate = dialog(page, new RegExp(`Record donation: ${name}`));
  await fillForm(page, donate, { donorName: 'Ramesh Kulkarni', amount: '2500', mode: 'Cash' });
  await submitForm(donate);

  await page.getByRole('tab', { name: 'Donations' }).click();
  const donations = page.getByTestId('alm-donations');
  await expect(donations).toContainText('Ramesh Kulkarni');
  await expect(donations.getByRole('row').filter({ hasText: 'Ramesh Kulkarni' }).first().getByRole('link', { name: 'Receipt (PDF)' }).or(donations.getByRole('button', { name: 'Receipt (PDF)' }).first())).toBeVisible();
  expect(errors).toEqual([]);
});

test('the volunteering tab opens', async ({ page }) => {
  await open(page, '/alumni');
  await page.getByRole('tab', { name: 'Volunteering' }).click();
  await expect(page.getByTestId('alm-volunteering').or(page.getByTestId('alm-volunteering-empty'))).toBeVisible();
});

test.describe('only roles that can open alumni giving', () => {
  test.use({ storageState: 'e2e/.auth/librarian.json' });
  test('the library desk is sent back to the library', async ({ page }) => {
    await open(page, '/alumni');
    await expect(page).toHaveURL(/\/library$/);
  });
});

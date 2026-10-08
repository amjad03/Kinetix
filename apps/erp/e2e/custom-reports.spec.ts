import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal builds a custom report, runs it and deletes it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/reports/custom');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Custom reports');
  await page.getByTestId('rb-new').click();
  const dlg = dialog(page, 'New report');
  const name = uniq('Student list');
  await fillForm(page, dlg, { name, description: 'Everyone on the roll' });
  await dlg.getByTestId('f-dataset').getByRole('combobox').click();
  await page.getByRole('option').first().click();
  await submitForm(dlg);

  const row = page.getByTestId('rb-list').getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await page.getByTestId(/^rb-run-/).first().waitFor();
  await row.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('rb-result').or(page.getByTestId('rb-result-empty'))).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).last().click();

  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('rb-list').getByRole('row').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a report needs a name', async ({ page }) => {
  await open(page, '/reports/custom');
  await page.getByTestId('rb-new').click();
  await page.getByTestId('ops-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test.describe('only roles that can open Reports', () => {
  test.use({ storageState: 'e2e/.auth/librarian.json' });
  test('the library desk is sent back to the library', async ({ page }) => {
    await open(page, '/reports/custom');
    await expect(page).toHaveURL(/\/library$/);
  });
});

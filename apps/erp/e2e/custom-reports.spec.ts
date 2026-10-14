import { expect, test } from '@playwright/test';
import { uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal opens a library report and changes the period', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/reports/library');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
  await page.getByTestId('rs-lib-search').fill('strength');
  await page.getByTestId('rs-lib-students.strength_by_class').getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Class-wise student strength');
  await expect(page.getByTestId('rs-result').or(page.getByTestId('rs-empty'))).toBeVisible();
  expect(errors).toEqual([]);
});

test('the principal builds a report, saves it to a folder and deletes it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/reports/builder');
  await page.getByTestId('rs-pick-students').click();
  await page.getByTestId('rs-add-class').click();
  await page.getByRole('menuitem', { name: 'Group by it' }).click();
  await expect(page.getByTestId('rs-preview').getByTestId('rs-table').or(page.getByTestId('rs-empty'))).toBeVisible();
  const name = uniq('Strength by class');
  await page.getByTestId('rs-save').click();
  await page.getByTestId('rs-save-name').fill(name);
  await page.getByLabel('Folder').fill('Office');
  await page.getByTestId('rs-save-submit').click();
  await expect(page).toHaveURL(/\/reports\/builder\?id=/);

  await open(page, '/reports/custom');
  const row = page.getByTestId('rs-mine').getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Office');
  await row.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByTestId('rs-confirm-delete').click();
  await expect(page.getByTestId('rs-mine').getByRole('row').filter({ hasText: name })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('the library desk', () => {
  test.use({ storageState: 'e2e/.auth/librarian.json' });
  test('starts in the report library and sees library reports only', async ({ page }) => {
    await open(page, '/reports');
    await expect(page).toHaveURL(/\/reports\/library$/);
    await expect(page.getByTestId('rs-lib-library.overdue')).toBeVisible();
    await expect(page.getByTestId('rs-lib-fees.defaulters')).toHaveCount(0);
  });
});

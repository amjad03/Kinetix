import { expect, test } from '@playwright/test';
import { dialog, submitForm, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal builds a course file and marks it reviewed', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/course-files');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Course files');
  const build = page.getByTestId('cf-build');
  await expect(build).toBeEnabled();
  await build.click();
  const dlg = dialog(page, 'Build a course file');
  await dlg.getByTestId('f-pick').getByRole('combobox').click();
  await page.getByRole('option').first().click();
  await submitForm(dlg);

  const files = page.getByTestId('cf-files');
  await expect(files).toBeVisible();
  const row = files.getByRole('row').filter({ hasText: 'Not reviewed' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Mark reviewed' }).click();
  const review = page.getByRole('dialog', { name: /Review course file/ });
  await review.getByTestId('f-remark').locator('textarea:not([aria-hidden="true"]), input:not([aria-hidden="true"])').first().fill('Checked against the syllabus');
  await submitForm(review);
  await expect(files).toContainText('Reviewed by Dr. Meera Rao');
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/course-files');
    await expect(page).toHaveURL(/\/$/);
  });
});

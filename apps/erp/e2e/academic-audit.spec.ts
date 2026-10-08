import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal writes an audit template and starts a department audit from it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/academic-audit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Academic audit');
  await expect(page.getByTestId('au-summary')).toBeVisible();

  await page.getByRole('tab', { name: /^Templates/ }).click();
  const name = uniq('Teaching records');
  await createVia(page, 'New template', 'New audit template', {
    name,
    items: 'Records | Attendance register is up to date\nRecords | Lesson plans are filed',
  });
  const templates = page.getByTestId('au-templates');
  const trow = templates.getByRole('row').filter({ hasText: name });
  await expect(trow).toBeVisible();

  await page.getByRole('tab', { name: /^Audits/ }).click();
  const title = uniq('Commerce audit');
  await page.getByRole('button', { name: 'Start audit' }).click();
  const dlg = page.getByRole('dialog', { name: 'Start a department audit' });
  await dlg.getByTestId('f-templateId').getByRole('combobox').click();
  await page.getByRole('option', { name }).click();
  await dlg.getByTestId('f-departmentId').getByRole('combobox').click();
  await page.getByRole('option').first().click();
  await dlg.getByTestId('f-title').locator('input:not([aria-hidden="true"])').fill(title);
  await dlg.getByTestId('ops-submit').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('au-audits')).toContainText(title);

  await page.getByRole('tab', { name: /^Templates/ }).click();
  await trow.getByRole('button', { name: 'Archive' }).click();
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/academic-audit');
    await expect(page).toHaveURL(/\/$/);
  });
});

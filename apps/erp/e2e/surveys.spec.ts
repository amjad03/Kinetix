import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal builds a survey, opens it for answers and sees the empty results', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/surveys');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Surveys');
  const title = uniq('Library hours');
  await createVia(page, 'New survey', 'New survey', {
    title,
    audience: 'Staff',
    questions: 'single: Which evening suits you? | Monday; Friday\nrating: How was the term?\ntext?: Anything else?',
  });
  const row = page.getByTestId('surveys-table').getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('Draft');
  await expect(row).toContainText('Staff');

  await row.getByRole('button', { name: 'Open for answers' }).click();
  await expect(row).toContainText('Open');
  await expect(page.getByTestId('sv-open')).not.toHaveText('0');

  await row.getByRole('button', { name: 'Results' }).click();
  await expect(page.getByTestId('survey-results')).toContainText('0 responses');
  await expect(page.getByTestId('survey-results')).toContainText('Which evening suits you?');
  await page.getByRole('button', { name: 'Close' }).last().click();

  await row.getByRole('button', { name: 'Close' }).click();
  await expect(row).toContainText('Closed');
  expect(errors).toEqual([]);
});

test('a survey needs a title and questions', async ({ page }) => {
  await open(page, '/surveys');
  await page.getByRole('button', { name: 'New survey' }).click();
  await page.getByTestId('ops-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/surveys');
    await expect(page).toHaveURL(/\/$/);
  });
});

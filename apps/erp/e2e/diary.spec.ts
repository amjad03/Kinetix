import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal writes a diary entry for a class and families can be checked for reads', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/diary');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('School diary');
  await expect(page.getByTestId('dy-section')).toBeVisible();
  const note = uniq('Revise chapter 4');
  await createVia(page, 'Write a diary entry', 'Write a diary entry', {
    classwork: 'Journal entries and the trial balance',
    homeworkNote: note,
    notice: 'Bring the calculator tomorrow',
  });
  const entries = page.getByTestId('dy-entries');
  await expect(entries).toContainText(note);
  await expect(entries).toContainText('Bring the calculator tomorrow');

  await entries.getByRole('row').filter({ hasText: note }).getByRole('button', { name: 'Who has read it' }).click();
  await expect(page.getByTestId('dy-acks')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/diary');
    await expect(page).toHaveURL(/\/$/);
  });
});

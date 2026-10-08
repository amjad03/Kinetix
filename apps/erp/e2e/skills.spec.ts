import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal adds a skill and it shows in the skills list', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/skills');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Skills and impact');
  const name = uniq('Public speaking');
  const code = `PS${Date.now().toString(36).toUpperCase()}`;
  await createVia(page, 'Add skill', 'Add skill', { code, name, description: 'Speaks clearly to a group' });
  const row = page.getByTestId('sk-skills').getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(code);
  await expect(page.getByTestId('sk-skills-count')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('the passport and SDG tabs open', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/skills');
  await page.getByRole('tab', { name: 'Outcome passport' }).click();
  await expect(page.getByRole('tab', { name: 'Outcome passport' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'SDG impact' }).click();
  await expect(page.getByTestId('sk-sdg')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/skills');
    await expect(page).toHaveURL(/\/$/);
  });
});

import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal loads the milestones and records an observation for a child', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/early-years');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Early years');
  const load = page.getByRole('button', { name: 'Load the standard milestones' });
  if (await load.isVisible()) {
    await load.click();
    await expect(load).toBeHidden();
  }
  const children = page.getByTestId('ey-children');
  await expect(children).toBeVisible();

  await children.getByRole('button', { name: 'Open' }).first().click();
  const detail = page.getByTestId('ey-detail');
  await expect(detail).toBeVisible();
  await page.getByRole('button', { name: 'Add an observation' }).click();
  const dlg = dialog(page, 'Add an observation');
  const note = uniq('Shared the blocks');
  await fillForm(page, dlg, { note, domain: 'Social and emotional development' });
  await submitForm(dlg);
  await expect(detail).toContainText(note);
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/early-years');
    await expect(page).toHaveURL(/\/$/);
  });
});

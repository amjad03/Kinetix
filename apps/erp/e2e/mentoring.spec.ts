import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal assigns a mentor to a whole class and the mentees appear', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/mentoring');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentoring');
  await expect(page.getByTestId('mn-mentees')).toBeVisible();
  await expect(page.getByTestId('mn-at-risk')).toBeVisible();
  await expect(page.getByTestId('mn-plans')).toBeVisible();

  await page.getByRole('tab', { name: /^Mentees/ }).click();
  await page.getByRole('button', { name: 'Assign by class' }).click();
  const dlg = dialog(page, 'Assign mentors to a class');
  await fillForm(page, dlg, { sectionId: 'BCom Sem 3 A', mentor1: 'Anita Sharma' });
  await submitForm(dlg);
  const list = page.getByTestId('mn-mentees-list');
  await expect(list).toContainText('Anita Sharma');
  await expect(list.getByRole('button', { name: 'Sessions' }).first()).toBeVisible();
  await expect(page.getByTestId('mn-mentees')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('the three tabs open without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/mentoring');
  for (const name of [/^At risk/, /^Mentees/, /^Plans/]) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  }
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/mentoring');
    await expect(page).toHaveURL(/\/$/);
  });
});

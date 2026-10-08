import { expect, test } from '@playwright/test';
import { dialog, fillForm, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal offers a course in the term and it shows in the list', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/course-registration');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Course registration');
  await expect(page.getByTestId('cr-term')).toBeVisible();

  // Offer the first subject not already on offer in the term (earlier runs may have offered some).
  await page.getByRole('button', { name: 'Offer a course' }).click();
  const dlg = dialog(page, 'Offer a course');
  await fillForm(page, dlg, { credits: '4', seatCap: '35' });
  let subject = '';
  for (let i = 0; i < 8; i++) {
    await dlg.getByTestId('f-subjectId').getByRole('combobox').click();
    const option = page.getByRole('option').nth(i);
    subject = ((await option.textContent()) ?? '').trim();
    await option.click();
    await dlg.getByTestId('ops-submit').click();
    await Promise.race([dlg.waitFor({ state: 'hidden' }), dlg.getByRole('alert').waitFor()]);
    if (!(await dlg.isVisible())) break;
    await expect(dlg.getByRole('alert')).toContainText('already offered');
  }
  await expect(dlg).toBeHidden();

  const list = page.getByTestId('cr-list');
  await expect(list).toContainText(subject);
  await expect(list).toContainText('35');
  expect(errors).toEqual([]);
});

test('the approvals and window tabs open', async ({ page }) => {
  await open(page, '/course-registration');
  await page.getByRole('tab', { name: 'Approvals' }).click();
  await expect(page.getByTestId('cr-approvals').or(page.getByTestId('cr-approvals-empty'))).toBeVisible();
  await page.getByRole('tab', { name: 'Window and limits' }).click();
  await expect(page.getByRole('tab', { name: 'Window and limits' })).toHaveAttribute('aria-selected', 'true');
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/course-registration');
    await expect(page).toHaveURL(/\/$/);
  });
});

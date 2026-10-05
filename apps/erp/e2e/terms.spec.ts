import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the principal (principal.setup.ts). The demo seed has "Odd semester 2026"
// (1 Aug – 15 Dec 2026, every program); each test puts things back.
test.describe.configure({ mode: 'serial' });

const NAME = `E2E even semester ${Date.now() % 100000}`;

test('the calendar lists the terms; the principal adds, edits and deletes one', async ({ page }) => {
  await open(page, '/calendar');
  const terms = page.getByTestId('terms');
  await expect(terms.getByRole('heading', { name: 'Terms and semesters' })).toBeVisible();
  await expect(terms.getByTestId('term-row').filter({ hasText: 'Odd semester 2026' })).toContainText('Sat, 1 Aug – Tue, 15 Dec · All programs · Academic year 2026-27');

  // A term for every program overlaps the odd semester: the dialog says so before saving.
  await page.getByTestId('term-add').click();
  let dialog = page.getByRole('dialog', { name: 'Add term' });
  await dialog.getByTestId('term-name').fill(NAME);
  await dialog.getByTestId('term-starts').fill('2026-12-01');
  await dialog.getByTestId('term-ends').fill('2027-05-31');
  await dialog.getByTestId('term-submit').click();
  await expect(dialog).toContainText('Overlaps another term for the same programs');
  await dialog.getByTestId('term-starts').fill('2027-01-04');
  await dialog.getByRole('radio', { name: 'Only some programs' }).check();
  await dialog.getByTestId('term-programs').click();
  await page.getByRole('option', { name: 'BCom' }).click();
  await page.keyboard.press('Escape');
  await dialog.getByTestId('term-submit').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Added ${NAME}`)).toBeVisible();
  const row = terms.getByTestId('term-row').filter({ hasText: NAME });
  await expect(row).toContainText('Mon, 4 Jan – Mon, 31 May · For BCom');
  await shot(page, 'calendar-terms');

  // The API also refuses dates outside the academic year.
  await row.getByRole('button', { name: `Edit ${NAME}` }).click();
  dialog = page.getByRole('dialog', { name: 'Edit term' });
  await dialog.getByTestId('term-ends').fill('2027-07-15');
  await dialog.getByTestId('term-submit').click();
  await expect(dialog.getByRole('alert')).toContainText('within the academic year');
  await dialog.getByTestId('term-ends').fill('2027-05-15');
  await dialog.getByTestId('term-submit').click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Mon, 4 Jan – Sat, 15 May');

  await row.getByRole('button', { name: `Delete ${NAME}` }).click();
  await expect(page.getByRole('dialog', { name: `Delete ${NAME}?` })).toContainText('no longer be deleted automatically');
  await page.getByTestId('term-delete-confirm').click();
  await expect(terms.getByTestId('term-row').filter({ hasText: NAME })).toHaveCount(0);
});

test('Settings keeps class recordings a set number of days after the semester', async ({ page }) => {
  await open(page, '/settings');
  const card = page.getByTestId('retention');
  await expect(card.getByTestId('retention-summary')).toHaveText('Keep class recordings until 7 days after the semester ends');
  await expect(card.getByTestId('retention-overview')).toContainText('Deleted in the next 30 days');
  await shot(page, 'settings-retention');

  const days = card.getByTestId('retention-days');
  await days.fill('91');
  await expect(card).toContainText('Enter a whole number of days from 0 to 90');
  await expect(card.getByTestId('retention-save')).toBeDisabled();
  await days.fill('14');
  await card.getByTestId('retention-save').click();
  await expect(page.getByText('Saved: recordings are kept 14 days after the semester ends')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('retention-summary')).toHaveText('Keep class recordings until 14 days after the semester ends');

  await page.getByTestId('retention-days').fill('7');
  await page.getByTestId('retention-save').click();
  await expect(page.getByTestId('retention')).toHaveAttribute('data-grace', '7');
});

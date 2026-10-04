import { expect, test } from '@playwright/test';
import { addDays, open, schoolToday, shot } from './helpers';

// Signed in as the principal (principal.setup.ts). The demo seed has the 2026-27 calendar:
// Gandhi Jayanti (2 Oct), Dasara holidays (19–21 Oct), Kannada Rajyotsava (1 Nov), BCom
// mid-semester exams (16–20 Nov), the sports day (12 Dec) and Christmas.
test.describe.configure({ mode: 'serial' });

const TITLE = `E2E holiday ${Date.now() % 100000}`;

test('the month shows the seeded holidays, and the list the year ahead', async ({ page }) => {
  await open(page, '/calendar?month=2026-10');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calendar');
  await expect(page.getByTestId('calendar-month')).toHaveText('October 2026');
  const oct2 = page.locator('[data-testid="calendar-day"][data-date="2026-10-02"]');
  await expect(oct2.getByTestId('calendar-chip')).toHaveText('Gandhi Jayanti');
  await expect(oct2.getByTestId('calendar-chip')).toHaveAttribute('data-kind', 'holiday');
  // A three-day holiday shows on each day.
  for (const d of ['19', '20', '21']) await expect(page.locator(`[data-testid="calendar-day"][data-date="2026-10-${d}"]`)).toContainText('Dasara holidays');
  await expect(page.getByTestId('calendar-list')).toContainText('Holiday · Mon, 19 Oct – Wed, 21 Oct · 3 days · Whole institution');
  await shot(page, 'calendar-month');

  await page.getByTestId('calendar-next').click();
  await expect(page.getByTestId('calendar-month')).toHaveText('November 2026');
  await expect(page.getByTestId('calendar-list').getByTestId('calendar-entry').filter({ hasText: 'Mid-semester exams' })).toContainText('For BCom');

  await page.getByTestId('calendar-view-list').click();
  await expect(page).toHaveURL(/view=list/);
  const list = page.getByTestId('calendar-entry');
  await expect(list.filter({ hasText: 'Annual sports day' })).toHaveAttribute('data-kind', 'event');
  await expect(list.filter({ hasText: 'Christmas' })).toBeVisible();
  await shot(page, 'calendar-list');
});

test('the principal adds a holiday for today; Today and Classes show it instead of missed classes', async ({ page }) => {
  const today = schoolToday();
  await open(page, '/calendar');
  await page.getByTestId('calendar-add').click();
  const dialog = page.getByRole('dialog', { name: 'Add to calendar' });
  await expect(dialog.getByTestId('calendar-kind-holiday')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('calendar-notify')).toBeChecked();
  // The last day can't be before the first.
  await dialog.getByTestId('calendar-title').fill(TITLE);
  await dialog.getByTestId('calendar-starts').fill(today);
  await dialog.getByTestId('calendar-ends').fill(addDays(today, -1));
  await dialog.getByTestId('calendar-submit').click();
  await expect(dialog).toContainText('The last day must be on or after the first day');
  await dialog.getByTestId('calendar-ends').fill(today);
  await shot(page, 'calendar-add');
  await dialog.getByTestId('calendar-submit').click();
  await expect(page.getByText(`${TITLE} added to the calendar`)).toBeVisible();
  await expect(page.locator(`[data-testid="calendar-day"][data-date="${today}"]`)).toContainText(TITLE);

  await open(page, '/');
  await expect(page.getByTestId('holiday-banner')).toContainText(`Holiday · ${TITLE}`);
  await expect(page.getByTestId('holiday-banner')).toContainText('none are counted as missed');
  await expect(page.getByTestId('no-classes-holiday')).toContainText(`No classes: ${TITLE}`);
  await expect(page.getByTestId('stat-classes')).toContainText('Nothing scheduled');
  await shot(page, 'today-holiday');
  await open(page, '/classes');
  await expect(page.getByTestId('holiday-banner')).toContainText(TITLE);
});

test('the principal edits the entry for some programs, then deletes it', async ({ page }) => {
  const today = schoolToday();
  await open(page, '/calendar');
  const entry = page.getByTestId('calendar-entry').filter({ hasText: TITLE });
  await entry.getByRole('button', { name: `Edit ${TITLE}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit calendar entry' });
  await dialog.getByTestId('calendar-kind-event').click();
  await dialog.getByTestId('calendar-title').fill(`${TITLE} (event)`);
  await dialog.getByRole('radio', { name: 'Some programs' }).check();
  await dialog.getByTestId('calendar-submit').click();
  await expect(dialog).toContainText('Choose at least one program');
  await dialog.getByRole('combobox', { name: 'Programs' }).click();
  await page.getByRole('option', { name: 'BCA' }).click();
  await page.keyboard.press('Escape');
  await dialog.getByTestId('calendar-notify').uncheck();
  await dialog.getByTestId('calendar-submit').click();
  await expect(page.getByText(`${TITLE} (event) saved`)).toBeVisible();
  const edited = page.getByTestId('calendar-entry').filter({ hasText: `${TITLE} (event)` });
  await expect(edited).toHaveAttribute('data-kind', 'event');
  await expect(edited).toContainText('For BCA');

  // An event is not a holiday: Today has no banner.
  await open(page, '/');
  await expect(page.getByTestId('holiday-banner')).toHaveCount(0);

  await open(page, '/calendar');
  await page.getByTestId('calendar-entry').filter({ hasText: `${TITLE} (event)` }).getByRole('button', { name: /^Delete/ }).click();
  await page.getByTestId('calendar-delete-confirm').click();
  await expect(page.getByText(`${TITLE} (event) deleted`)).toBeVisible();
  await expect(page.locator(`[data-testid="calendar-day"][data-date="${today}"]`)).not.toContainText(TITLE);
});

test.describe('read-only for the accounts office', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });

  test('sees the calendar without add, edit or delete', async ({ page }) => {
    await open(page, '/calendar?month=2026-10');
    await expect(page.getByTestId('calendar-month')).toHaveText('October 2026');
    await expect(page.getByTestId('calendar-list')).toContainText('Gandhi Jayanti');
    await expect(page.getByTestId('calendar-add')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  });
});

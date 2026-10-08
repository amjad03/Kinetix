import { expect, test, type Page } from '@playwright/test';
import { open, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('dialog').getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test('add a period, catch clashes, move it and remove it', async ({ page }) => {
  // The first class opens by default.
  await open(page, '/timetable');
  await expect(page.getByRole('combobox', { name: 'Class or teacher' })).toHaveText('BCA Sem 1 A');
  await expect(page.getByTestId('timetable-title')).toHaveText('BCA Sem 1 A');
  await expect(page.getByTestId('timetable-summary')).toContainText('15 periods a week');
  const saturday = page.getByTestId('day-6');
  await expect(saturday.getByTestId('slot')).toHaveCount(2);
  await shot(page, 'timetable');

  // Add: Saturday 15:00, after the day's periods. The class has several subjects (the seed links the whole BU syllabus), so the subject is picked.
  await page.getByRole('button', { name: 'Add period' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Add a period' });
  await pick(page, 'Subject', 'Discrete Mathematics');
  await expect(dialog.getByRole('combobox', { name: 'Subject' })).toContainText('Discrete Mathematics');
  await pick(page, 'Teacher', 'Ravi Kumar');
  await pick(page, 'Day', 'Saturday');
  await dialog.getByLabel('Starts').fill('15:00');
  await expect(dialog.getByLabel('Ends')).toHaveValue('15:55');
  await dialog.getByRole('button', { name: 'Add period' }).click();
  await expect(page.getByText('Added Discrete Mathematics on Saturday 15:00–15:55')).toBeVisible();
  await expect(saturday.getByTestId('slot')).toHaveCount(3);
  await expect(page.getByRole('columnheader', { name: '15:00–15:55' })).toBeVisible();

  // Clash: the class already has a period at 10:00 on Saturday.
  await page.getByRole('button', { name: 'Add period' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Add a period' });
  await pick(page, 'Subject', 'Discrete Mathematics');
  await pick(page, 'Teacher', 'Ravi Kumar');
  await pick(page, 'Day', 'Saturday');
  await dialog.getByLabel('Starts').fill('10:00');
  await dialog.getByRole('button', { name: 'Add period' }).click();
  await expect(dialog.getByTestId('period-error')).toHaveText('BCA Sem 1 A already has a period at 10:00–10:55 that day');
  await shot(page, 'timetable-clash');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Edit: a teacher clash first (Anita teaches BCom at 09:00 on Saturday), then move it to 16:00.
  await saturday.getByTestId('slot').filter({ hasText: 'Discrete Mathematics' }).last().click();
  dialog = page.getByRole('dialog', { name: 'Change period' });
  await expect(dialog.getByLabel('Starts')).toHaveValue('15:00');
  await pick(page, 'Teacher', 'Anita Sharma');
  await dialog.getByLabel('Starts').fill('09:00');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByTestId('period-error')).toHaveText('This teacher is already teaching at 09:00–09:55 that day');
  await pick(page, 'Teacher', 'Ravi Kumar');
  await dialog.getByLabel('Starts').fill('16:00');
  await expect(dialog.getByLabel('Ends')).toHaveValue('16:55');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Changed Discrete Mathematics to Saturday 16:00–16:55')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '15:00–15:55' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: '16:00–16:55' })).toBeVisible();
  await expect(saturday.getByTestId('slot')).toHaveCount(3);

  // Remove.
  await saturday.getByRole('button', { name: /Saturday 16:00–16:55/ }).click();
  await page.getByRole('dialog', { name: 'Change period' }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog', { name: 'Remove this period?' }).getByRole('button', { name: 'Remove period' }).click();
  await expect(page.getByText('Removed Discrete Mathematics on Saturday 16:00')).toBeVisible();
  await expect(saturday.getByTestId('slot')).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: '16:00–16:55' })).toHaveCount(0);
  await expect(page.getByTestId('timetable-summary')).toContainText('15 periods a week');
});

test("a teacher's week shows their classes", async ({ page }) => {
  await open(page, '/timetable');
  await page.getByTestId('timetable-of').click();
  await page.getByRole('option', { name: 'Anita Sharma' }).click();
  await expect(page).toHaveURL(/\?teacher=/);
  await expect(page.getByTestId('timetable-title')).toHaveText('Anita Sharma');
  await expect(page.getByTestId('timetable-summary')).toContainText('15 periods a week');
  await expect(page.getByTestId('slot').first()).toContainText('BCom Sem 3 A');
  await page.getByTestId('timetable-of').click();
  await page.getByRole('option', { name: 'BCom Sem 3 A' }).click();
  await expect(page).toHaveURL(/\?class=/);
  await expect(page.getByTestId('timetable-title')).toHaveText('BCom Sem 3 A');
  await shot(page, 'timetable-teacher');
});

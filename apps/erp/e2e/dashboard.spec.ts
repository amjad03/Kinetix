import { expect, test } from '@playwright/test';
import { futureSunday, lastSchoolDay, signInAsPrincipal } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInAsPrincipal(page);
});

test('Today shows the stat tiles and the school name', async ({ page }) => {
  await expect(page.getByTestId('school-name')).toHaveText('KINETIX Demo College of Commerce & Science');
  for (const id of ['stat-classes', 'stat-attendance', 'stat-absent', 'stat-homework', 'stat-boards', 'stat-messages']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
});

test('Today on a school day lists the classes with their status', async ({ page }) => {
  const day = lastSchoolDay();
  await page.goto(`/?date=${day}`);
  const timeline = page.getByTestId('class-timeline');
  await expect(timeline.getByRole('listitem').first()).toBeVisible();
  await expect(timeline).toContainText('Corporate Accounting');
  await expect(timeline).toContainText('Anita Sharma');
  await expect(timeline.locator('[data-status="taught"]').first()).toBeVisible();
  await expect(page.getByTestId('stat-attendance')).toContainText('%');
});

test('date navigation moves a day at a time and back to Today', async ({ page }) => {
  const day = lastSchoolDay();
  await page.goto(`/?date=${day}`);
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page).not.toHaveURL(new RegExp(`date=${day}`));
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
});

test('a Sunday explains there are no classes and offers Saturday and Monday', async ({ page }) => {
  await page.goto(`/?date=${futureSunday()}`);
  const empty = page.getByTestId('no-classes');
  await expect(empty).toContainText('No classes on Sundays');
  await empty.getByRole('link', { name: /View Mon/ }).click();
  await expect(page.getByTestId('class-timeline')).toBeVisible();
});

test('Classes shows a filterable table', async ({ page }) => {
  await page.goto(`/classes?date=${lastSchoolDay()}`);
  const table = page.getByTestId('classes-table');
  await expect(table).toBeVisible();
  const all = await table.locator('tbody tr').count();
  expect(all).toBeGreaterThan(0);
  await page.getByTestId('filter-upcoming').click();
  await expect(page.getByText('No classes match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(all);
});

test('Attendance shows each class and the absentees', async ({ page }) => {
  await page.goto(`/attendance?date=${lastSchoolDay()}`);
  const table = page.getByTestId('attendance-table');
  await expect(table).toContainText('BCom Sem 3 A');
  await expect(table).toContainText('BCA Sem 1 A');
  await expect(page.getByTestId('att-rate')).toContainText('%');
  await expect(page.getByText(/^Absent students · \d+$/)).toBeVisible();
});

test('Homework lists recent assignments and switches range', async ({ page }) => {
  await page.goto('/homework');
  await expect(page.getByTestId('homework-table')).toContainText('Anita Sharma');
  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/days=30/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Homework');
});

test('Messages: circulate a message and see it in the sent list', async ({ page }) => {
  await page.goto('/messages');
  const title = `E2E notice ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Message').fill('Please ignore: automated test of the dashboard.');
  await page.getByTestId('priority-important').click();
  await expect(page.getByTestId('priority-help')).toContainText('until the teacher dismisses it');
  await page.getByRole('button', { name: 'Classes' }).click();
  await page.getByLabel('Classes').click();
  await page.getByRole('option', { name: 'BCom Sem 3 A' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Circulate', exact: true }).click();
  const item = page.getByTestId('sent-message').filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText('To BCom Sem 3 A');
  await expect(item.getByTestId('delivery')).toContainText('notified in apps');
  await item.getByRole('button', { name: 'Clear' }).click();
  await expect(item).toContainText('Cleared');
});

test('Messages: an emergency asks for confirmation first', async ({ page }) => {
  await page.goto('/messages');
  await page.getByLabel('Title').fill('E2E emergency (cancelled)');
  await page.getByLabel('Message').fill('Not sent.');
  await page.getByTestId('priority-emergency').click();
  await page.getByRole('button', { name: 'Circulate emergency' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Send an emergency alert?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('sent-message').filter({ hasText: 'E2E emergency (cancelled)' })).toHaveCount(0);
});

test('Boards lists the boards and adding one shows an enrolment code', async ({ page }) => {
  await page.goto('/boards');
  await expect(page.getByTestId('boards-table')).toContainText('Room 204 Board');
  await page.getByRole('button', { name: 'Add board' }).click();
  await page.getByLabel('Board name').fill(`E2E Board ${Date.now() % 100000}`);
  await page.getByRole('button', { name: 'Get code' }).click();
  await expect(page.getByTestId('enrollment-code')).toHaveText(/^[A-Z0-9-]{8,}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('boards-table')).toContainText('E2E Board');
});

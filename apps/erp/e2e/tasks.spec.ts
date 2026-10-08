import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open, signIn } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal gives Anita a task and moves it through its statuses', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
  const title = uniq('Collect lab keys');
  await createVia(page, 'New task', 'New task', { title, assigneeId: 'Anita Sharma', priority: 'High' });

  await page.getByRole('tab', { name: 'Assigned by me' }).click();
  const row = page.getByTestId('tasks-assigned').getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('Anita Sharma');
  await expect(row).toContainText('High');
  await expect(row).toContainText('Open');

  await row.getByRole('button', { name: 'Start' }).click();
  await expect(row).toContainText('In progress');
  await row.getByRole('button', { name: 'Mark done' }).click();
  // Finished tasks leave the list of open work.
  await expect(page.getByTestId('tasks-assigned').getByRole('row').filter({ hasText: title })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a task needs a title and someone to do it', async ({ page }) => {
  await open(page, '/tasks');
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByTestId('ops-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test.describe('a teacher has no ERP', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('Anita is not let into Tasks', async ({ page }) => {
    await signIn(page, 'anita@demo.kinetix.in');
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/login/);
  });
});

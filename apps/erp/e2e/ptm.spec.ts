import { expect, test } from '@playwright/test';
import { createVia, inDays, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal adds a parent-teacher meeting and gives a teacher time slots', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/ptm');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parent-teacher meetings');
  const title = uniq('Term 1 meeting');
  await createVia(page, 'Add a meeting', 'Add a meeting', { title, eventDate: inDays(14), location: 'Seminar hall' });
  const row = page.getByTestId('pt-events').getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('Seminar hall');
  await expect(row).toContainText('Open');
  await expect(page.getByTestId('pt-open-count')).not.toHaveText('0');

  await page.getByRole('tab', { name: 'Time slots' }).click();
  await page.getByTestId('pt-event').click();
  await page.getByRole('option', { name: new RegExp(title) }).click();
  await createVia(page, 'Add time slots', 'Add time slots', { teacherId: 'Anita Sharma', from: '10:00', to: '11:00', durationMinutes: '20' });
  const slots = page.getByTestId('pt-slots');
  await expect(slots).toContainText('Anita Sharma');
  await expect(slots.getByRole('row')).toHaveCount(4); // header plus three 20-minute slots
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/ptm');
    await expect(page).toHaveURL(/\/$/);
  });
});

import { expect, test } from '@playwright/test';
import { createVia, inDays, uniq, watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal adds a club, a committee and an event', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/campus-life');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Campus life');

  const club = uniq('Chess club');
  await createVia(page, 'Add club', 'Add club', { name: club, description: 'Weekly games' });
  await expect(page.getByTestId('cl-clubs').getByRole('row').filter({ hasText: club })).toBeVisible();

  await page.getByRole('tab', { name: /^Committees/ }).click();
  const committee = uniq('Cultural committee');
  await createVia(page, 'Add committee', 'Add committee', { name: committee, statutory: 'No' });
  await expect(page.getByTestId('cl-committees').getByRole('row').filter({ hasText: committee })).toBeVisible();

  await page.getByRole('tab', { name: /^Events/ }).click();
  const event = uniq('Founders day');
  await createVia(page, 'Add event', 'Add event', {
    title: event,
    venue: 'Main hall',
    capacity: '120',
    startsAt: `${inDays(10)}T10:00`,
    endsAt: `${inDays(10)}T12:00`,
  });
  const row = page.getByTestId('cl-events').getByRole('row').filter({ hasText: event });
  await expect(row).toContainText('Main hall');
  await expect(row).toContainText('Draft');
  await row.getByRole('button', { name: 'Publish' }).click();
  await expect(row).toContainText('Published');
  await expect(page.getByTestId('cl-upcoming')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('opening a club shows its members and activities', async ({ page }) => {
  await open(page, '/campus-life');
  const club = uniq('Debate club');
  await createVia(page, 'Add club', 'Add club', { name: club });
  await page.getByTestId('cl-clubs').getByRole('row').filter({ hasText: club }).getByRole('button', { name: 'Open' }).click();
  const dlg = page.getByRole('dialog', { name: club });
  await createVia(page, 'Add activity', 'Add activity', { title: 'Opening game', activityOn: inDays(3), points: '5' });
  await expect(dlg.getByTestId('cl-activities')).toContainText('Opening game');
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/campus-life');
    await expect(page).toHaveURL(/\/$/);
  });
});

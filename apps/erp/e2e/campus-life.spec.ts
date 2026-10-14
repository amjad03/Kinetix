import { expect, type Page, test } from '@playwright/test';
import { createVia, inDays, uniq, watchErrors } from './desk';
import { open } from './helpers';

/** Adds a record through the record kit's own form (Add <thing>), filling text fields by label. */
async function kitAdd(page: Page, button: string, values: Record<string, string>, choices: Record<string, string> = {}) {
  await page.getByRole('button', { name: button }).first().click();
  const dlg = page.getByRole('dialog', { name: button });
  await expect(dlg).toBeVisible();
  for (const [label, value] of Object.entries(values)) await dlg.getByLabel(label, { exact: false }).first().fill(value);
  for (const [label, option] of Object.entries(choices)) {
    await dlg.getByRole('combobox', { name: new RegExp(`^${label}`) }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  await dlg.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dlg).toBeHidden();
}

/** Opens a row's actions menu and picks an item. */
async function rowAction(page: Page, list: string, text: string, item: string) {
  await page.getByTestId(list).getByRole('row').filter({ hasText: text }).getByRole('button', { name: 'Actions for this row' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

// Signed in as the principal (principal.setup.ts).
test('the principal adds a club, a committee and an event', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/campus-life');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Campus life');

  const club = uniq('Chess club');
  await kitAdd(page, 'Add club', { Name: club, Description: 'Weekly games' }, { Category: 'General' });
  await expect(page.getByTestId('cl-clubs').getByRole('row').filter({ hasText: club })).toBeVisible();

  await page.getByRole('tab', { name: /^Committees/ }).click();
  const committee = uniq('Cultural committee');
  await kitAdd(page, 'Add committee', { Name: committee });
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
  await rowAction(page, 'cl-events', event, 'Publish');
  await expect(row).toContainText('Published');
  await expect(page.getByTestId('cl-upcoming')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('opening a club shows its members and activities', async ({ page }) => {
  await open(page, '/campus-life');
  const club = uniq('Debate club');
  await kitAdd(page, 'Add club', { Name: club }, { Category: 'General' });
  await rowAction(page, 'cl-clubs', club, 'Open');
  const dlg = page.getByRole('dialog', { name: club });
  await createVia(page, 'Add activity', 'Add activity', { title: 'Opening game', activityOn: inDays(3), points: '5' });
  await expect(dlg.getByTestId('cl-activities')).toContainText('Opening game');
});

test('every campus life tab opens without errors', async ({ page }) => {
  const errors = watchErrors(page);
  for (const tab of ['units', 'achievements', 'outreach', 'claims', 'elections', 'awards', 'reports']) {
    await open(page, `/campus-life?tab=${tab}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Campus life');
  }
  expect(errors).toEqual([]);
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/campus-life');
    await expect(page).toHaveURL(/\/$/);
  });
});

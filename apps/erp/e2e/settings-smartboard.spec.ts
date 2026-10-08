import { expect, test } from '@playwright/test';
import { watchErrors } from './desk';
import { open } from './helpers';

// Signed in as the principal (principal.setup.ts). The test puts the training link and announcements back.
test.describe.configure({ mode: 'serial' });

test('the principal sets the training link and an announcement, and they are kept after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/settings');
  const card = page.getByTestId('board-content');
  await expect(card).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smartboard' })).toBeVisible();

  await card.getByTestId('training-url').fill('https://training.demo.kinetix.in/book');
  await card.getByTestId('training-contact').fill('Front office, ext 12');
  await card.getByTestId('whats-new-add').click();
  await card.getByLabel('Title').first().fill('New smartboard timetable');
  await card.getByLabel('Message').first().fill('Check the board profile for your periods.');
  await card.getByTestId('board-content-save').click();
  await expect(page.getByText('Setting saved')).toBeVisible();

  await page.reload({ waitUntil: 'networkidle' });
  const again = page.getByTestId('board-content');
  await expect(again.getByTestId('training-url')).toHaveValue('https://training.demo.kinetix.in/book');
  await expect(again.getByTestId('training-contact')).toHaveValue('Front office, ext 12');
  await expect(again.getByLabel('Title').first()).toHaveValue('New smartboard timetable');

  // Put it back.
  await again.getByTestId('training-url').fill('');
  await again.getByTestId('training-contact').fill('');
  while ((await again.getByRole('button', { name: 'Remove' }).count()) > 0) await again.getByRole('button', { name: 'Remove' }).first().click();
  await again.getByTestId('board-content-save').click();
  await expect(page.getByText('Setting saved')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('board-content').getByTestId('training-url')).toHaveValue('');
  await expect(page.getByTestId('board-content').getByLabel('Title')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the principal pastes past exam questions and they are imported', async ({ page }) => {
  await open(page, '/settings');
  const card = page.getByTestId('board-content');
  await expect(card.getByTestId('past-exams-import')).toBeDisabled();
  await card.getByTestId('past-exams-csv').fill('question,exam,year,marks\n"What is goodwill?",BU BCom Sem 3,2024,5');
  await card.getByTestId('past-exams-import').click();
  await expect(page.getByText(/Imported 1 questions/)).toBeVisible();
  await expect(card.getByTestId('past-exams-csv')).toHaveValue('');
});

test.describe('only the principal and administrator', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/settings');
    await expect(page).toHaveURL(/\/$/);
  });
});

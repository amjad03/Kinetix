import { expect, test } from '@playwright/test';
import { open } from './helpers';

// Signed in as the principal: the library desk can lend to any student from the class rosters.
test('the principal can open the library and find any student', async ({ page }) => {
  await open(page, '/library');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library');
  await page.getByRole('button', { name: 'Issue a book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue a book' });
  await expect(dialog).toContainText('20 students');
  await dialog.getByRole('combobox', { name: 'Student' }).fill('kavya');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('Kavya Reddy');
  await expect(page.getByRole('option')).toContainText('BCA Sem 1 A');
  await page.keyboard.press('Escape');
});

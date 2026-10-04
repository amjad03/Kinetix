import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the library desk (library@demo.kinetix.in) by principal.setup.ts.
test.describe.configure({ mode: 'serial' });

test('the library desk sees only Library and the calendar', async ({ page }) => {
  await open(page, '/');
  await expect(page).toHaveURL(/\/library$/);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
  await open(page, '/timetable');
  await expect(page).toHaveURL(/\/library$/);
  await open(page, '/fees');
  await expect(page).toHaveURL(/\/library$/);
});

test('issue a book to a student, then take back an overdue one with its fine', async ({ page }) => {
  await open(page, '/library');
  const rows = page.getByTestId('loan-row');
  const before = await rows.count();
  // The seed: Diya Patel's book is overdue.
  const diya = rows.filter({ hasText: 'Diya Patel' });
  await expect(diya.locator('[data-status="overdue"]')).toBeVisible();
  await expect(diya).toHaveAttribute('data-overdue', 'true');
  await shot(page, 'library-loans');

  await page.getByRole('button', { name: 'Issue a book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue a book' });
  await dialog.getByRole('combobox', { name: 'Book' }).fill('Wings');
  await page.getByRole('option', { name: /Wings of Fire/ }).click();
  // Any student, searched on the server by name, roll number or class.
  await dialog.getByRole('combobox', { name: 'Student' }).fill('ananya');
  await page.getByRole('option', { name: /Ananya Gowda/ }).click();
  await expect(dialog).toContainText('U03BC002 · BCom Sem 3 A');
  await expect(dialog).toContainText('Due in 14 days');
  await shot(page, 'library-issue');
  await dialog.getByRole('button', { name: 'Issue', exact: true }).click();
  await expect(page.getByText(/Issued “Wings of Fire” to Ananya Gowda · due /)).toBeVisible();
  await expect(rows).toHaveCount(before + 1);
  await expect(rows.filter({ hasText: 'Wings of Fire' })).toContainText('Due in 14 days');

  // Return Diya's overdue book: ₹2 for each day late.
  const late = Number((await diya.textContent())!.match(/(\d+) days? late/)![1]);
  const fine = `₹${late * 2}`;
  await expect(diya.getByTestId('loan-fine')).toHaveText(fine);
  await diya.getByRole('button', { name: 'Return' }).click();
  const ret = page.getByRole('dialog', { name: 'Return this book?' });
  await expect(ret).toContainText(`A late fine of ${fine} will be recorded`);
  await ret.getByRole('button', { name: 'Mark returned' }).click();
  const done = page.getByRole('dialog', { name: 'Book returned' });
  await expect(done.getByTestId('return-fine')).toContainText('Late fine to collect');
  await expect(done.getByTestId('return-fine')).toContainText(fine);
  await expect(done.getByTestId('return-fine-status')).toHaveText('Unpaid');
  await expect(done.getByRole('button', { name: `Mark ${fine} paid` })).toBeVisible();
  await shot(page, 'library-returned');
  await done.getByRole('button', { name: 'Collect later' }).click();
  await expect(rows).toHaveCount(before);
  await expect(rows.filter({ hasText: 'Diya Patel' })).toHaveCount(0);
  await expect(page.getByTestId('lib-overdue')).toContainText('Nothing is overdue');
  await expect(page.getByTestId('lib-fines')).toContainText(fine);

  // Collect it at the desk from Unpaid fines.
  await page.getByTestId('tab-fines').click();
  const row = page.getByTestId('fine-row').filter({ hasText: 'Diya Patel' });
  await expect(row).toContainText(fine);
  await expect(row.locator('[data-status="unpaid"]')).toBeVisible();
  await shot(page, 'library-fines');
  await row.getByRole('button', { name: 'Mark paid' }).click();
  const paid = page.getByRole('dialog', { name: 'Mark this fine paid?' });
  await expect(paid).toContainText(fine);
  await expect(paid).toContainText('Diya Patel');
  await paid.getByRole('button', { name: `Mark ${fine} paid` }).click();
  await expect(page.getByText(`${fine} fine from Diya Patel marked paid`)).toBeVisible();
  await expect(page.getByTestId('fine-row')).toHaveCount(0);
  await expect(page.getByTestId('no-fines')).toBeVisible();
  await expect(page.getByTestId('lib-fines')).toContainText('All fines collected');
});

test('the catalogue shows availability and takes new books', async ({ page }) => {
  await open(page, '/library?tab=catalogue');
  const books = page.getByTestId('book-row');
  await expect(books.filter({ hasText: 'Wings of Fire' }).locator('[data-available]')).toHaveText('1 of 2 available');
  await expect(books.filter({ hasText: 'Discrete Mathematics' }).locator('[data-available]')).toHaveText('2 of 2 available');
  const title = `E2E Atlas ${Date.now() % 100000}`;
  await page.getByRole('button', { name: 'Add book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a book' });
  await dialog.getByRole('textbox', { name: 'Title' }).fill(title);
  await dialog.getByRole('textbox', { name: 'Author' }).fill('Oxford');
  await dialog.getByRole('textbox', { name: 'Call number' }).fill('912 OXF');
  await dialog.getByRole('textbox', { name: 'Copies' }).fill('3');
  await dialog.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByText(`Added “${title}” · 3 copies`)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search the catalogue' }).fill('atlas');
  await expect(books).toHaveCount(1);
  await expect(books.first()).toContainText('3 of 3 available');
  await page.getByRole('textbox', { name: 'Search the catalogue' }).fill('');
  await shot(page, 'library-catalogue');

  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/library');
  await expect(page.getByTestId('loans-list')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await shot(page, 'library-390');
});

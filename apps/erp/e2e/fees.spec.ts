import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the accounts office (accounts@demo.kinetix.in) by principal.setup.ts.
test.describe.configure({ mode: 'serial' });

const FEE = `E2E Library fee ${Date.now() % 100000}`;

test('the accounts office sees only Fees and the calendar', async ({ page }) => {
  await open(page, '/');
  await expect(page).toHaveURL(/\/fees$/);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Fees' })).toHaveAttribute('aria-current', 'page');
  await open(page, '/boards');
  await expect(page).toHaveURL(/\/fees$/);
});

test('Fees overview shows totals in rupees and every class', async ({ page }) => {
  await open(page, '/fees');
  await expect(page.getByTestId('fee-billed')).toContainText('₹');
  await expect(page.getByTestId('fee-billed')).toContainText(/₹\d{1,2},\d{2},\d{3}/); // lakh grouping
  await expect(page.getByTestId('fee-overdue')).toContainText('₹');
  await expect(page.getByTestId('fee-overdue')).toContainText('invoices past the due date');
  await expect(page.getByTestId('fee-classes')).toContainText('BCom Sem 3 A');
  await expect(page.getByTestId('fee-classes')).toContainText('BCA Sem 1 A');
  await shot(page, 'fees-overview');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('fee-billed')).toBeVisible();
  await shot(page, 'fees-overview-390');
});

test('issue a fee, take a counter payment and print the receipt', async ({ page }) => {
  await open(page, '/fees');
  await page.getByRole('button', { name: 'Issue fee' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue a fee to a class' });
  await dialog.getByRole('combobox', { name: 'Class' }).click();
  await page.getByRole('option', { name: 'BCA Sem 1 A' }).click();
  await dialog.getByRole('textbox', { name: 'Fee' }).fill(FEE);
  await dialog.getByRole('textbox', { name: 'Amount per student' }).fill('1,250');
  await expect(dialog).toContainText('₹1,250');
  await shot(page, 'fees-issue');
  await dialog.getByRole('button', { name: 'Issue' }).click();
  await expect(page.getByText(`Issued “${FEE}” to 8 students of BCA Sem 1 A`)).toBeVisible();

  await page.getByTestId('fee-class-row').filter({ hasText: 'BCA Sem 1 A' }).getByRole('link', { name: /Invoices/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices · BCA Sem 1 A');
  await page.getByRole('textbox', { name: 'Search invoices' }).fill(FEE);
  await expect(page.getByTestId('invoice-row')).toHaveCount(8);
  await shot(page, 'fees-invoices');

  const row = page.getByTestId('invoice-row').filter({ hasText: 'Diya Patel' });
  await row.getByRole('button', { name: 'Record payment' }).click();
  const pay = page.getByRole('dialog', { name: 'Record a payment' });
  await expect(pay.getByRole('textbox', { name: 'Amount received' })).toHaveValue('1250');
  await pay.getByRole('button', { name: 'UPI' }).click();
  await expect(pay.getByRole('button', { name: 'Record payment' })).toBeDisabled(); // UPI needs its transaction id
  await pay.getByRole('textbox', { name: 'UPI transaction ID' }).fill('UPI 5521 0098 1123');
  await shot(page, 'fees-payment');
  await pay.getByRole('button', { name: 'Record payment' }).click();

  const done = page.getByRole('dialog', { name: 'Payment recorded' });
  await expect(done.getByTestId('receipt-amount')).toHaveText('₹1,250');
  await expect(done.getByTestId('receipt-no')).toHaveText(/^RCPT\/\d{4}-\d{2}\/\d{5}$/);
  await expect(done.getByTestId('receipt')).toContainText('UPI · UPI 5521 0098 1123');
  await expect(done.getByTestId('receipt')).toContainText('Nil · fully paid');
  await shot(page, 'fees-receipt-dialog');
  const href = await done.getByRole('link', { name: 'Print receipt' }).getAttribute('href');
  expect(href).toMatch(/^\/fees\/receipts\/[0-9a-f-]{36}$/);
  await done.getByRole('button', { name: 'Done' }).click();
  // Paid invoices leave the Due list.
  await expect(page.getByTestId('invoice-row')).toHaveCount(7);

  await open(page, href!);
  const receipt = page.getByTestId('receipt');
  await expect(receipt).toContainText('Fee receipt');
  await expect(receipt).toContainText('KINETIX Demo College of Commerce & Science');
  await expect(receipt).toContainText('Diya Patel');
  await expect(receipt).toContainText('Rupees One Thousand Two Hundred Fifty only');
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await shot(page, 'fees-receipt');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await shot(page, 'fees-receipt-print');
});

test('cancel an unpaid invoice; paid ones show their receipts', async ({ page }) => {
  await open(page, '/fees/invoices?status=all');
  await page.getByRole('textbox', { name: 'Search invoices' }).fill(FEE);
  const row = page.getByTestId('invoice-row').filter({ hasText: 'Rohan Desai' });
  await row.getByTestId('invoice-menu').click();
  await page.getByRole('menuitem', { name: 'Cancel invoice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this invoice?' });
  await dialog.getByRole('button', { name: 'Cancel invoice' }).click();
  await expect(row.locator('[data-status="cancelled"]')).toBeVisible();

  const paid = page.getByTestId('invoice-row').filter({ hasText: 'Diya Patel' });
  await expect(paid.locator('[data-status="paid"]')).toBeVisible();
  await paid.getByTestId('invoice-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Cancel invoice' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Payments and receipts' }).click();
  await expect(page.getByRole('dialog', { name: 'Payments and receipts' })).toContainText('₹1,250 · UPI');

  await page.keyboard.press('Escape');
  await open(page, '/fees/invoices?status=overdue');
  await expect(page.getByTestId('invoice-row').first().locator('[data-status="overdue"]')).toBeVisible();
});

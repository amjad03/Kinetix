import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the principal. The seed has Rajesh Patel asking Anita Sharma about Aarav.
test('Parent messages lists threads without their text; opening one is audited and read-only', async ({ page }) => {
  await open(page, '/conversations');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parent messages');
  await expect(page.getByTestId('audit-note')).toContainText('recorded in the audit log');
  const row = page.getByTestId('thread-row').filter({ hasText: 'Rajesh Patel ↔ Anita Sharma' });
  await expect(row).toContainText('About Aarav Patel · BCom Sem 3 A');
  // No message text in the list.
  await expect(page.getByText('Exercise 4.2')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search conversations' }).fill('nobody here');
  await expect(page.getByTestId('thread-row')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search conversations' }).fill('anita');
  await expect(row).toBeVisible();
  await shot(page, 'conversations');

  await row.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rajesh Patel and Anita Sharma');
  await expect(page.getByTestId('audit-note')).toContainText('has been recorded in the audit log');
  const msgs = page.getByTestId('message');
  await expect(msgs).toHaveCount(2);
  await expect(msgs.first()).toHaveAttribute('data-side', 'family');
  await expect(msgs.first()).toContainText('Rajesh Patel · parent');
  await expect(msgs.last()).toHaveAttribute('data-side', 'staff');
  await expect(msgs.last()).toContainText('Exercise 4.2');
  // Read-only: nothing to type into.
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await shot(page, 'conversation');
});

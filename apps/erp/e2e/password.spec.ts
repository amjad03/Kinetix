import { expect, test } from '@playwright/test';
import { apiLogin, API_URL } from './board-sim';
import { signIn } from './helpers';

/**
 * Forced change of a temporary password: the demo principal adds a vice principal (staff import)
 * and resets their password through the API (POST /v1/admin/users/:id/reset-password); the vice
 * principal signs in with it, cannot open anything but Change password, chooses a new one and
 * reaches Today.
 */
test('a temporary password must be changed before anything else', async ({ page }) => {
  const principal = await apiLogin('principal@demo.kinetix.in');
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `vp-${tag}@demo.kinetix.in`;
  const fullName = `Vice Principal ${tag}`;
  const auth = { authorization: `Bearer ${principal}` };

  const imported = await fetch(`${API_URL}/v1/admin/import/staff`, { method: 'POST', headers: { ...auth, 'content-type': 'text/csv' }, body: `full_name,email,roles\n${fullName},${email},principal\n` });
  expect(imported.status).toBe(200);
  const staff = (await (await fetch(`${API_URL}/v1/admin/staff`, { headers: auth })).json()) as { id: string; fullName: string }[];
  const vp = staff.find((s) => s.fullName === fullName)!;
  const reset = await fetch(`${API_URL}/v1/admin/users/${vp.id}/reset-password`, { method: 'POST', headers: auth });
  expect(reset.status).toBe(200);
  const { temporaryPassword } = (await reset.json()) as { temporaryPassword: string };

  await signIn(page, email, undefined, temporaryPassword);
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'Temporary password' })).toBeVisible();
  await expect(page.getByTestId('password-rules')).toContainText('have at least 10 characters');
  await expect(page.getByTestId('password-rules')).toContainText(`not contain your email name (vp-${tag})`);

  // Nothing else opens until the password is changed.
  await page.goto('/timetable');
  await expect(page).toHaveURL(/\/account\/password$/);

  const fill = async (current: string, next: string, confirm = next) => {
    await page.locator('input[name=current]').fill(current);
    await page.locator('input[name=new]').fill(next);
    await page.locator('input[name=confirm]').fill(confirm);
    await page.getByRole('button', { name: 'Change password' }).click();
  };
  // Checked in the ERP before sending…
  await fill(temporaryPassword, 'Blue-mango-tree-42', 'Blue-mango-tree-43');
  await expect(page.getByTestId('password-error')).toHaveText('The two new passwords are not the same.');
  // …and by the API, shown by error code.
  await fill('not-the-temporary-one', 'Blue-mango-tree-42');
  await expect(page.getByTestId('password-error')).toHaveText('Your current password is wrong.');
  await fill(temporaryPassword, 'password123');
  await expect(page.getByTestId('password-error')).toHaveText('This password is too easy to guess. Choose another one.');

  await fill(temporaryPassword, 'Blue-mango-tree-42');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('school-name')).toBeVisible();

  // Change password stays in the account menu.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByTestId('change-password').click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'Current password' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByTestId('school-name')).toBeVisible();
});

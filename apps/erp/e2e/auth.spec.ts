import { expect, test } from '@playwright/test';
import { signIn, signInAsPrincipal } from './helpers';

test('a teacher is refused with a clear message', async ({ page }) => {
  await signIn(page, 'anita@demo.kinetix.in');
  await expect(page.getByRole('alert')).toContainText('for principals, administrators and heads of department');
  await expect(page).toHaveURL(/\/login/);
  // No session was created: the dashboard still sends us to sign in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('a wrong password is rejected', async ({ page }) => {
  await signIn(page, 'principal@demo.kinetix.in', 'demo-college', 'not-the-password');
  await expect(page.getByRole('alert')).toContainText('Wrong institution code, login or password');
});

test('the session cookie is httpOnly and the token never reaches the page', async ({ page, context }) => {
  await signInAsPrincipal(page);
  const session = (await context.cookies()).find((c) => c.name === 'kx_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('kx_session');
  expect(await page.content()).not.toContain(session!.value);
});

test('a head of department can sign in but cannot add boards', async ({ page }) => {
  await signIn(page, 'ravi@demo.kinetix.in');
  await expect(page.getByTestId('school-name')).toBeVisible();
  await page.goto('/boards');
  await expect(page.getByRole('button', { name: 'Add board' })).toBeDisabled();
});

test('signing out returns to the sign-in page', async ({ page }) => {
  await signInAsPrincipal(page);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed-out/);
  await page.goto('/classes');
  await expect(page).toHaveURL(/\/login/);
});

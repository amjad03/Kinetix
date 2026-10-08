import { expect, test as setup } from '@playwright/test';
import { signIn, signInAsPrincipal } from './helpers';

export const PRINCIPAL_STATE = 'e2e/.auth/principal.json';
export const ACCOUNTANT_STATE = 'e2e/.auth/accountant.json';
export const LIBRARIAN_STATE = 'e2e/.auth/librarian.json';

// Sign in once: the API allows 10 logins a minute per account.
setup('sign in as the principal', async ({ page }) => {
  await signInAsPrincipal(page);
  await page.context().storageState({ path: PRINCIPAL_STATE });
});

setup('sign in as the accounts office', async ({ page }) => {
  await signIn(page, 'accounts@demo.kinetix.in');
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: ACCOUNTANT_STATE });
});

setup('sign in as the library desk', async ({ page }) => {
  await signIn(page, 'library@demo.kinetix.in');
  await expect(page).toHaveURL(/\/library$/);
  await page.context().storageState({ path: LIBRARIAN_STATE });
});

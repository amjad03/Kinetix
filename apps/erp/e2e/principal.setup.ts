import { test as setup } from '@playwright/test';
import { signInAsPrincipal } from './helpers';

export const PRINCIPAL_STATE = 'e2e/.auth/principal.json';

// Sign in once: the API allows 10 logins a minute per account.
setup('sign in as the principal', async ({ page }) => {
  await signInAsPrincipal(page);
  await page.context().storageState({ path: PRINCIPAL_STATE });
});

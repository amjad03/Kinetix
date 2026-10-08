import { expect, test } from '@playwright/test';
import { createVia, uniq, watchErrors } from './desk';
import { open, signIn } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal adds a route, raises a request on it and withdraws it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/workflows');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workflows');
  const type = `e2e${Date.now().toString(36)}`;
  const route = uniq('Lab purchase');

  await page.getByRole('tab', { name: 'Routes' }).click();
  await createVia(page, 'Add a route', 'Add a route', {
    requestType: type,
    name: route,
    description: 'Buy small lab items',
    fields: 'reason | Reason | text | required',
    steps: 'Administrator sign-off | role:tenant_admin | 0 | 1000000 | 24',
  });
  await expect(page.getByTestId('wf-defs')).toContainText(route);

  await page.getByRole('tab', { name: 'My requests' }).click();
  const title = uniq('Beakers');
  await page.getByTestId(`wf-start-${type}`).click();
  const form = page.getByRole('dialog', { name: route });
  await form.getByTestId('f-title').locator('input').fill(title);
  await form.getByTestId('f-amount').locator('input').fill('1500');
  await form.getByTestId('f-f_reason').locator('input').fill('Replace broken ones');
  await form.getByTestId('ops-submit').click();
  await expect(form).toBeHidden();
  const mine = page.getByTestId('wf-mine').getByRole('row').filter({ hasText: title });
  await expect(mine).toBeVisible();
  await expect(page.getByTestId('wf-open-count')).not.toHaveText('0');

  await mine.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('wf-timeline')).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw request' }).click();
  await expect(page.getByTestId('wf-detail')).toBeHidden();
  await expect(page.getByTestId('wf-mine').getByRole('row').filter({ hasText: title })).toContainText(/Withdrawn|Cancelled/);
  expect(errors).toEqual([]);
});

test('the inbox tab opens with its count', async ({ page }) => {
  await open(page, '/workflows');
  await expect(page.getByTestId('wf-inbox-count')).toBeVisible();
  await expect(page.getByTestId('wf-inbox').or(page.getByTestId('wf-inbox-empty'))).toBeVisible();
});

test.describe('a teacher has no ERP', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('Anita is not let into Workflows', async ({ page }) => {
    await signIn(page, 'anita@demo.kinetix.in');
    await page.goto('/workflows');
    await expect(page).toHaveURL(/\/login/);
  });
});

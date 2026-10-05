import { expect, test } from '@playwright/test';
import { open, setLanguageCookie, TENANT } from './helpers';

// Signed in as the principal (principal.setup.ts), against an API with PAYMENTS_PROVIDER=razorpay
// and RAZORPAY_FAKE=true (or demo): Razorpay's API is faked, a key secret starting with "wrong"
// fails the connection test. Expects a fresh seed: the demo college has no Razorpay keys yet.
test.describe.configure({ mode: 'serial' });

const KEY_ID = 'rzp_live_DemoCollege01';
const KEY_SECRET = 'kx-e2e-key-secret-7Hq2';
const WEBHOOK_SECRET = 'kx-e2e-webhook-secret-Zp4';

test('the principal connects the college\'s own Razorpay account; secrets never come back', async ({ page }) => {
  await open(page, '/settings');
  const card = page.getByTestId('razorpay');
  await expect(page.getByText('Online payments (Razorpay)', { exact: true })).toBeVisible();
  await expect(card).toContainText("go directly to your institution's own Razorpay account");
  await expect(card).toHaveAttribute('data-configured', 'false');
  await expect(card.getByTestId('razorpay-status')).toContainText('Not set up');
  await expect(card.getByTestId('razorpay-webhook-url')).toHaveValue(new RegExp(`/v1/fees/webhooks/razorpay/${TENANT}$`));
  await expect(card.getByTestId('razorpay-test')).toBeDisabled();

  await card.getByTestId('razorpay-key-id').fill('pk_live_nope');
  await card.getByTestId('razorpay-save').click();
  await expect(card).toContainText('Enter the key id from Razorpay');
  await card.getByTestId('razorpay-key-id').fill(KEY_ID);
  await card.getByTestId('razorpay-save').click();
  await expect(card).toContainText('Enter the key secret and the webhook secret.');
  await card.getByTestId('razorpay-key-secret').fill(KEY_SECRET);
  await card.getByTestId('razorpay-webhook-secret').fill(WEBHOOK_SECRET);
  await card.getByTestId('razorpay-save').click();
  await expect(page.getByText('Razorpay keys saved')).toBeVisible();
  await expect(card).toHaveAttribute('data-configured', 'true');
  await expect(card.getByTestId('razorpay-mode')).toHaveText('Live mode: real payments');
  await expect(card.getByTestId('razorpay-key-secret')).toHaveValue('');
  await expect(card).toContainText('Saved (ending 7Hq2)');

  await page.reload();
  await expect(page.getByTestId('razorpay')).toHaveAttribute('data-configured', 'true');
  await expect(page.getByTestId('razorpay-key-id')).toHaveValue(KEY_ID);
  const html = await page.content();
  expect(html).not.toContain(KEY_SECRET);
  expect(html).not.toContain(WEBHOOK_SECRET);

  await page.getByTestId('razorpay-test').click();
  await expect(page.getByTestId('razorpay-test-result')).toHaveText('Connected: Razorpay accepted the keys.');
});

test('a wrong key secret fails the connection test; the right one fixes it', async ({ page }) => {
  await open(page, '/settings');
  const card = page.getByTestId('razorpay');
  await card.getByTestId('razorpay-key-secret').fill('wrong-secret-1234');
  await card.getByTestId('razorpay-save').click();
  await expect(card).toContainText('Saved (ending 1234)');
  await card.getByTestId('razorpay-test').click();
  await expect(card.getByTestId('razorpay-test-result')).toContainText('Razorpay did not accept the key id and key secret');
  await card.getByTestId('razorpay-key-secret').fill(KEY_SECRET);
  await card.getByTestId('razorpay-save').click();
  await expect(card).toContainText('Saved (ending 7Hq2)');
  await card.getByTestId('razorpay-test').click();
  await expect(card.getByTestId('razorpay-test-result')).toHaveText('Connected: Razorpay accepted the keys.');
});

test('the section is in Hindi and Kannada too', async ({ page }) => {
  await setLanguageCookie(page, 'hi');
  await open(page, '/settings');
  await expect(page.getByText('ऑनलाइन भुगतान (Razorpay)', { exact: true })).toBeVisible();
  await expect(page.getByTestId('razorpay-test')).toHaveText('कनेक्शन जाँचें');
  await setLanguageCookie(page, 'kn');
  await page.reload();
  await expect(page.getByText('ಆನ್‌ಲೈನ್ ಪಾವತಿಗಳು (Razorpay)', { exact: true })).toBeVisible();
  await setLanguageCookie(page, 'en');
});

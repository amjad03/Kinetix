import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the principal (principal.setup.ts). Each test puts the setting back.
test.describe.configure({ mode: 'serial' });

test('the principal turns PIN sign-in on and off; it is kept after a reload', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  // Seed: live view on, the viewing sign on, class audio and PIN sign-in off.
  await expect(page.getByTestId('setting-liveViewEnabled')).toHaveAttribute('data-checked', 'true');
  await expect(page.getByTestId('setting-liveViewIndicator')).toHaveAttribute('data-checked', 'true');
  await expect(page.getByTestId('setting-classroomAudioToViewers')).toHaveAttribute('data-checked', 'false');
  await expect(page.getByTestId('audio-privacy')).toContainText('voices of teachers and students');
  const pin = page.getByTestId('setting-pinFallbackEnabled');
  await expect(pin).toHaveAttribute('data-checked', 'false');
  await shot(page, 'settings');

  await pin.getByRole('switch').click();
  await expect(page.getByText('Setting saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('setting-pinFallbackEnabled')).toHaveAttribute('data-checked', 'true');
  await page.getByTestId('setting-pinFallbackEnabled').getByRole('switch').click();
  await expect(page.getByTestId('setting-pinFallbackEnabled')).toHaveAttribute('data-checked', 'false');
  await page.reload();
  await expect(page.getByTestId('setting-pinFallbackEnabled')).toHaveAttribute('data-checked', 'false');
});

test('letting leaders hear classes asks first; cancelling leaves it off', async ({ page }) => {
  await open(page, '/settings');
  await page.getByTestId('setting-classroomAudioToViewers').getByRole('switch').click();
  const dialog = page.getByRole('dialog', { name: 'Let leaders hear classes?' });
  await expect(dialog).toContainText('Tell teachers before you turn this on');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('setting-classroomAudioToViewers')).toHaveAttribute('data-checked', 'false');
});

test('turning live view off greys out the viewing sign and class audio', async ({ page }) => {
  await open(page, '/settings');
  await page.getByTestId('setting-liveViewEnabled').getByRole('switch').click();
  await expect(page.getByTestId('setting-liveViewEnabled')).toHaveAttribute('data-checked', 'false');
  await expect(page.getByTestId('setting-liveViewIndicator').getByRole('switch')).toBeDisabled();
  await expect(page.getByTestId('setting-classroomAudioToViewers')).toContainText('Turn on live view first.');
  await page.getByTestId('setting-liveViewEnabled').getByRole('switch').click();
  await expect(page.getByTestId('setting-liveViewEnabled')).toHaveAttribute('data-checked', 'true');
  await expect(page.getByTestId('setting-liveViewIndicator').getByRole('switch')).toBeEnabled();
});

test('the principal names the grievance officer, then removes them', async ({ page }) => {
  await open(page, '/settings');
  const card = page.getByTestId('grievance-officer');
  await expect(card).toHaveAttribute('data-saved', 'false');
  await expect(card.getByTestId('grievance-not-set')).toBeVisible();
  await card.getByTestId('grievance-name').fill('Dr. Kavya Rao');
  await expect(card.getByTestId('grievance-name')).toHaveValue('Dr. Kavya Rao');
  await card.getByTestId('grievance-email').fill('not-an-email');
  await card.getByTestId('grievance-save').click();
  await expect(card).toContainText('Enter a valid email address, or leave it empty');
  await card.getByTestId('grievance-email').fill('grievance@demo.kinetix.in');
  await card.getByTestId('grievance-phone').fill('+91 80 4000 1234');
  await card.getByTestId('grievance-save').click();
  await expect(card).toHaveAttribute('data-saved', 'true');
  await expect(card.getByTestId('grievance-not-set')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('grievance-name')).toHaveValue('Dr. Kavya Rao');
  await expect(page.getByTestId('grievance-email')).toHaveValue('grievance@demo.kinetix.in');
  await expect(page.getByTestId('grievance-phone')).toHaveValue('+91 80 4000 1234');
  await expect(page.getByTestId('grievance-not-set')).toHaveCount(0);

  await page.getByTestId('grievance-remove').click();
  await expect(page.getByTestId('grievance-officer')).toHaveAttribute('data-saved', 'false');
  await page.reload();
  await expect(page.getByTestId('grievance-name')).toHaveValue('');
  await expect(page.getByTestId('grievance-not-set')).toBeVisible();
});

test('the privacy & consent summary counts answers per purpose', async ({ page }) => {
  await open(page, '/settings');
  const summary = page.getByTestId('consent-summary');
  await expect(summary.getByTestId('consent-version')).toHaveText('Privacy notice version 2026-10');
  await expect(summary.getByTestId('consent-students')).toHaveText('20 active students');
  const rows = summary.getByTestId('consent-row');
  await expect(rows).toHaveCount(4);
  // Seed: Aarav agreed to data processing and AI; Diya's father agreed to data processing.
  const data = summary.locator('[data-purpose="data_processing"]');
  await expect(data.getByTestId('consent-granted')).toHaveText('2');
  await expect(data.getByTestId('consent-withdrawn')).toHaveText('0');
  await expect(data.getByTestId('consent-not-asked')).toHaveText('18');
  const ai = summary.locator('[data-purpose="ai_features"]');
  await expect(ai).toContainText('KINETIX AI');
  await expect(ai.getByTestId('consent-granted')).toHaveText('1');
  await expect(ai.getByTestId('consent-not-asked')).toHaveText('19');
  await expect(summary.locator('[data-purpose="photos"]').getByTestId('consent-not-asked')).toHaveText('20');

  await summary.getByTestId('consent-notice-toggle').click();
  await expect(summary.getByTestId('consent-notice')).toContainText('All data and all AI processing stay in India');
  await shot(page, 'settings-consent');
});

test.describe('only the principal and administrator', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/settings');
    await expect(page).toHaveURL(/\/fees$/);
  });
});

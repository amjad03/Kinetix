import { expect, test } from '@playwright/test';
import { open } from './helpers';

// Settings → Board kiosk mode (docs/hardware/kiosk-mode.md). Signed in as the principal
// (principal.setup.ts). Puts everything back: kiosk mode on, no IT PIN.
test.describe.configure({ mode: 'serial' });

const API_URL = process.env.KINETIX_API_URL ?? 'http://localhost:4000';

test('the principal sets the IT PIN; it is never shown again, and boards get only its hash', async ({ page, request }) => {
  await open(page, '/settings');
  const card = page.getByTestId('kiosk');
  await expect(card).toHaveAttribute('data-enabled', 'true');
  await expect(card).toHaveAttribute('data-pin-set', 'false');
  await expect(card.getByTestId('kiosk-pin-status')).toContainText('No IT PIN yet');

  // Checked as it is typed, like the API checks it.
  const save = card.getByTestId('kiosk-pin-save');
  await expect(save).toBeDisabled();
  await card.getByTestId('kiosk-pin').fill('123');
  await expect(card).toContainText('Use 4 to 8 digits');
  await expect(save).toBeDisabled();
  await card.getByTestId('kiosk-pin').fill('482915');
  await card.getByTestId('kiosk-pin-confirm').fill('482916');
  await expect(card).toContainText('The two PINs are not the same');
  await expect(save).toBeDisabled();
  await card.getByTestId('kiosk-pin-confirm').fill('482915');
  await expect(save).toBeEnabled();

  // The PIN goes to the server once, in the save request, and comes back nowhere.
  const bodies: string[] = [];
  page.on('response', async (r) => {
    if (r.request().method() !== 'GET' && r.url().includes('/settings')) bodies.push(await r.text().catch(() => ''));
  });
  await save.click();
  await expect(page.getByText('IT PIN saved')).toBeVisible();
  await expect(card).toHaveAttribute('data-pin-set', 'true');
  await expect(card.getByTestId('kiosk-pin')).toHaveValue('');
  await expect(card.getByTestId('kiosk-pin-status')).toContainText('An IT PIN is set');
  expect(bodies.join('\n')).not.toContain('482915');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-pin-set', 'true');
  expect(await page.content()).not.toContain('482915');
  await expect(page.getByTestId('kiosk-pin-save')).toHaveText('Change PIN');

  // What a board gets: a salted hash and its parameters.
  const login = await request.post(`${API_URL}/v1/auth/login`, { data: { tenant: 'demo-college', login: 'principal@demo.kinetix.in', password: 'kinetix123' } });
  const token = (await login.json()).accessToken as string;
  const settings = await (await request.get(`${API_URL}/v1/admin/settings`, { headers: { authorization: `Bearer ${token}` } })).json();
  expect(settings.boardKiosk).toMatchObject({ enabled: true, pinSet: true });
  expect(JSON.stringify(settings)).not.toContain('482915');
});

test('turning kiosk mode off and on is kept after a reload', async ({ page }) => {
  await open(page, '/settings');
  const toggle = page.getByTestId('kiosk').getByRole('switch');
  await toggle.click();
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-enabled', 'false');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-enabled', 'false');
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-pin-set', 'true');
  await page.getByTestId('kiosk').getByRole('switch').click();
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-enabled', 'true');
});

test('the principal removes the PIN', async ({ page }) => {
  await open(page, '/settings');
  await page.getByTestId('kiosk-pin-remove').click();
  await expect(page.getByText('IT PIN removed')).toBeVisible();
  await expect(page.getByTestId('kiosk')).toHaveAttribute('data-pin-set', 'false');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('kiosk-pin-status')).toContainText('No IT PIN yet');
  await expect(page.getByTestId('kiosk-pin-remove')).toHaveCount(0);
});

test('the section is translated', async ({ page }) => {
  await page.context().addCookies([{ name: 'kx_lang', value: 'hi', url: page.url() === 'about:blank' ? (process.env.ERP_URL ?? 'http://localhost:3000') : page.url() }]);
  await open(page, '/settings');
  await expect(page.getByTestId('kiosk')).toContainText('बोर्ड को KINETIX Board पर लॉक करें');
  await page.context().addCookies([{ name: 'kx_lang', value: 'en', url: process.env.ERP_URL ?? 'http://localhost:3000' }]);
});

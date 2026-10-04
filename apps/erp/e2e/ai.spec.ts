import { expect, test } from '@playwright/test';
import { API_URL, apiLogin } from './board-sim';
import { open, shot } from './helpers';

// Signed in as the principal by principal.setup.ts.
test('KINETIX AI usage shows requests by task and outcome', async ({ page }) => {
  await open(page, '/ai');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('KINETIX AI usage');
  if (await page.getByTestId('no-ai-usage').isVisible()) await shot(page, 'ai-usage-empty');

  // Ask KINETIX AI something (without a model server the API answers with a preview).
  const token = await apiLogin('principal@demo.kinetix.in');
  for (const [path, body] of [
    ['explain', { question: 'What is underwriting of shares?' }],
    ['explain', { question: 'Explain goodwill valuation by the super profit method.' }],
    ['quiz', { topic: 'Valuation of goodwill', count: 3 }],
  ] as const) {
    const res = await fetch(`${API_URL}/v1/ai/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    expect(res.ok, `${path}: ${res.status}`).toBe(true);
  }

  await open(page, '/ai');
  await expect(page.getByTestId('ai-requests')).toContainText(/\d/);
  const table = page.getByTestId('ai-usage-table');
  await expect(table.getByTestId('ai-task-row').filter({ hasText: 'Explain' })).toBeVisible();
  await expect(table.getByTestId('ai-task-row').filter({ hasText: 'Quiz' })).toBeVisible();
  await shot(page, 'ai-usage');
});

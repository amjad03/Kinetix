import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

const API = process.env.KINETIX_API_URL ?? 'http://localhost:4000';

test.describe.configure({ mode: 'serial' });

test('Results shows the seeded unit test with its class average', async ({ page }) => {
  await open(page, '/results');
  await expect(page.getByRole('combobox', { name: 'Class' })).toHaveText('BCom Sem 3 A');
  const row = page.getByTestId('assessment-row').filter({ hasText: 'Unit test 1: Underwriting of shares' });
  await expect(row).toContainText('Corporate Accounting');
  await expect(row.getByTestId('assessment-entered')).toHaveText('12 of 12');
  await expect(row.getByTestId('assessment-average')).toContainText('18.7 / 25');
  await expect(row.locator('[data-status="published"]')).toBeVisible();
  await shot(page, 'results');

  await row.getByRole('link', { name: /Marks for/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unit test 1: Underwriting of shares');
  await expect(page.getByTestId('stat-average')).toContainText('18.7');
  await expect(page.getByTestId('stat-average')).toContainText('74.8%');
  await expect(page.getByTestId('stat-highest')).toContainText('24');
  await expect(page.getByTestId('stat-lowest')).toContainText('11.5');
  await expect(page.getByTestId('stat-absent')).toContainText('1');
  await expect(page.getByTestId('stat-absent')).toContainText('11 of 12 marked');
  await expect(page.getByTestId('mark-row')).toHaveCount(12);
  await expect(page.getByTestId('mark-row').filter({ hasText: 'Harsh Jain' }).locator('[data-status="absent"]')).toBeVisible();
  const bands = page.getByTestId('distribution').locator('[data-band]');
  await expect(bands).toHaveCount(7);
  await expect(page.getByTestId('distribution').locator('[data-band="90–100%"]')).toHaveAttribute('data-count', '3');
  // Already published: nothing to publish.
  await expect(page.getByRole('button', { name: 'Publish marks' })).toHaveCount(0);
  await shot(page, 'results-detail');
});

test('the principal publishes marks a teacher has entered', async ({ page, request }) => {
  // Anita sets a quiz from the Teacher App and enters two marks, without publishing.
  const login = await request.post(`${API}/v1/auth/login`, { data: { tenant: 'demo-college', login: 'anita@demo.kinetix.in', password: 'kinetix123' } });
  expect(login.ok()).toBe(true);
  const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const classes: { section: { id: string }; subject: { id: string; name: string } }[] = await (await request.get(`${API}/v1/teacher/classes`, { headers })).json();
  const costing = classes.find((c) => c.subject.name === 'Cost Accounting')!;
  const title = `E2E Quiz ${Date.now() % 100000}`;
  const created = await request.post(`${API}/v1/assessments`, {
    headers,
    data: { sectionId: costing.section.id, subjectId: costing.subject.id, title, kind: 'test', maxMarks: 10, heldOn: new Date().toISOString().slice(0, 10) },
  });
  expect(created.ok()).toBe(true);
  const quiz: { id: string; students: { id: string }[] } = await created.json();
  const marked = await request.put(`${API}/v1/assessments/${quiz.id}/marks`, {
    headers,
    data: { entries: [{ studentId: quiz.students[0].id, marks: 9 }, { studentId: quiz.students[1].id, marks: 3 }] },
  });
  expect(marked.ok()).toBe(true);

  await open(page, `/results?class=${costing.section.id}`);
  const row = page.getByTestId('assessment-row').filter({ hasText: title });
  await expect(row.locator('[data-status="draft"]')).toBeVisible();
  await expect(row.getByTestId('assessment-entered')).toHaveText('2 of 12');
  await expect(row.getByTestId('assessment-average')).toContainText('6 / 10');
  await row.getByRole('link', { name: /Marks for/ }).click();
  await expect(page.getByTestId('stat-absent')).toContainText('10 not entered');
  await expect(page.getByTestId('distribution').locator('[data-band="90–100%"]')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('distribution').locator('[data-band="Below 40%"]')).toHaveAttribute('data-count', '1');

  await page.getByRole('button', { name: 'Publish marks' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish these marks?' });
  await expect(dialog).toContainText('10 students have no marks yet');
  await shot(page, 'results-publish');
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Marks published. Families have been notified.')).toBeVisible();
  await expect(page.locator('[data-status="published"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish marks' })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { dialog, fillForm, submitForm, uniq, watchErrors } from './desk';
import { ERP_URL, open, signIn } from './helpers';

// Signed in as the principal (principal.setup.ts).
test('the principal adds a question and a blueprint, then generates a paper', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await open(page, '/question-bank');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Question bank');

  await page.getByTestId('qb-add').click();
  const q = dialog(page, 'Add question');
  await q.getByTestId('f-subject').getByRole('combobox').click();
  const first = page.getByRole('option').first();
  const subject = ((await first.textContent()) ?? '').replace(/ \(no outcome\)$/, '').trim();
  await first.click();
  const topic = uniq('Sets');
  await fillForm(page, q, { topic, bloom: 'Remember', difficulty: 'Easy', type: 'Short answer', marks: '5', text: `Define a set and give two examples (${topic}).` });
  await submitForm(q);
  await expect(page.getByTestId('qb-questions')).toContainText(topic);

  // Maker and checker are different people: the administrator reviews and approves the principal's question.
  const adminCtx = await browser.newContext({ baseURL: ERP_URL, storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
  const adminPage = await adminCtx.newPage();
  await signIn(adminPage, 'admin@demo.kinetix.in');
  await adminPage.waitForURL((u) => !u.pathname.startsWith('/login'));
  await open(adminPage, '/question-bank');
  const adminRow = adminPage.getByTestId('qb-questions').getByRole('row').filter({ hasText: topic });
  await adminRow.getByRole('button', { name: 'Mark reviewed' }).click();
  await adminRow.getByRole('button', { name: 'Approve' }).click();
  await expect(adminRow).not.toContainText('Draft');
  await adminCtx.close();

  await page.getByRole('tab', { name: /^Blueprints/ }).click();
  await page.getByTestId('qb-add-blueprint').click();
  const b = dialog(page, 'Add blueprint');
  const bpTitle = uniq('Internal test');
  await fillForm(page, b, { subjectId: subject, title: bpTitle, totalMarks: '5', durationMinutes: '30', sections: 'Section A; 1; 5' });
  await submitForm(b);
  await expect(page.getByTestId('qb-blueprints')).toContainText(bpTitle);

  await page.getByRole('tab', { name: /^Papers/ }).click();
  await page.getByTestId('qb-generate').click();
  const p = dialog(page, 'Generate paper');
  const paperTitle = uniq('Paper');
  await p.getByTestId('f-blueprintId').getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(bpTitle) }).click();
  await fillForm(page, p, { title: paperTitle });
  await submitForm(p);
  await expect(page.getByTestId('qb-papers')).toContainText(paperTitle);
  expect(errors).toEqual([]);
});

test('a question needs its details', async ({ page }) => {
  await open(page, '/question-bank');
  await page.getByTestId('qb-add').click();
  await page.getByTestId('ops-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test.describe('only leaders and heads of department', () => {
  test.use({ storageState: 'e2e/.auth/accountant.json' });
  test('the accounts office is sent back to Fees', async ({ page }) => {
    await open(page, '/question-bank');
    await expect(page).toHaveURL(/\/$/);
  });
});

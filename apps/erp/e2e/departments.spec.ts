import { expect, test, type Page } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the principal (principal.setup.ts). Adds a department, edits it, looks at it and
// deletes it, leaving the seed's departments as they were.
test.describe.configure({ mode: 'serial' });

const card = (page: Page, name: string) => page.getByTestId('department-card').filter({ has: page.getByTestId('department-name').getByText(name, { exact: true }) });

test('the principal sets up a department: name, head, subjects and staff, then deletes it', async ({ page }) => {
  const name = `E2E Humanities ${Date.now() % 100000}`;
  await open(page, '/departments');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Departments');
  await expect(card(page, 'Commerce').getByTestId('department-head')).toHaveText('Head: Ravi Kumar');
  await expect(card(page, 'Commerce').getByTestId('department-subjects')).toContainText('Corporate Accounting');
  await expect(card(page, 'Computer Science').getByTestId('department-head')).toHaveText('No head of department');
  await shot(page, 'departments');

  // Add.
  await page.getByRole('button', { name: 'Add department' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Add department' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, name).getByTestId('department-head')).toHaveText('No head of department');

  // Its view before it has subjects.
  await card(page, name).getByRole('link', { name: `View ${name}` }).click();
  await expect(page.getByTestId('dept-picker')).toBeVisible();
  await expect(page.getByTestId('no-subjects')).toContainText('No subjects in this department yet');
  await open(page, '/departments');

  // Edit: rename, Ravi as head (only HOD staff are offered), Discrete Mathematics (moves it from Computer Science), Anita as staff.
  await card(page, name).getByRole('button', { name: `Edit ${name}` }).click();
  dialog = page.getByRole('dialog', { name: `Edit ${name}` });
  await dialog.getByLabel('Name').fill(`${name} and Arts`);
  await dialog.getByTestId('head-select').click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['No head', 'Ravi Kumar']);
  await page.getByRole('option', { name: 'Ravi Kumar' }).click();
  await dialog.getByLabel('Subjects').click();
  await page.getByRole('option', { name: /Discrete Mathematics/ }).click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByTestId('subjects-moving')).toContainText('Discrete Mathematics from Computer Science');
  await dialog.getByLabel('Staff').click();
  await page.getByRole('option', { name: 'Anita Sharma' }).click();
  await page.keyboard.press('Escape');
  await shot(page, 'departments-edit');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const edited = card(page, `${name} and Arts`);
  await expect(edited.getByTestId('department-head')).toHaveText('Head: Ravi Kumar');
  await expect(edited.getByTestId('department-subjects')).toContainText('Discrete Mathematics');
  await expect(edited.getByTestId('department-staff')).toContainText('Anita Sharma');
  await expect(card(page, 'Computer Science').getByTestId('department-subjects')).toContainText('No subjects yet');

  // The principal can open any department: its class is BCA Sem 1 A, taught by Ravi.
  await edited.getByRole('link', { name: `View ${name} and Arts` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} and Arts`);
  await expect(page.getByTestId('dept-classes')).toContainText('BCA Sem 1 A');
  await expect(page.getByTestId('dept-teachers')).toContainText('Ravi Kumar');
  await shot(page, 'department-principal');

  // Delete, with a confirmation.
  await open(page, '/departments');
  await card(page, `${name} and Arts`).getByRole('button', { name: `Delete ${name} and Arts` }).click();
  dialog = page.getByRole('dialog', { name: `Delete ${name} and Arts?` });
  await expect(dialog).toContainText('Ravi Kumar will no longer see this department');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(card(page, `${name} and Arts`)).toHaveCount(0);
  await expect(page.getByTestId('unassigned-subjects')).toContainText('Discrete Mathematics');

  // Put Discrete Mathematics back in Computer Science.
  await card(page, 'Computer Science').getByRole('button', { name: 'Edit Computer Science' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit Computer Science' });
  await dialog.getByLabel('Subjects').click();
  await page.getByRole('option', { name: /Discrete Mathematics/ }).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Computer Science').getByTestId('department-subjects')).toContainText('Discrete Mathematics');
});

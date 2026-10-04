import { expect, test } from '@playwright/test';
import { open, shot } from './helpers';

// Signed in as the principal by principal.setup.ts.
test.describe.configure({ mode: 'serial' });

test('Syllabus lists the subjects with their courses, and a subject can be linked to another course', async ({ page }) => {
  await open(page, '/syllabus');
  const subjects = page.getByTestId('subject-links');
  const row = subjects.getByTestId('subject-row').filter({ hasText: 'Discrete Mathematics' });
  await expect(row).toContainText('BCA Sem 1 A');
  await expect(row.getByRole('combobox', { name: 'Course for Discrete Mathematics' })).toHaveText('Discrete Mathematics, BCA Semester 1');
  await expect(page.getByTestId('course-card').filter({ hasText: 'Discrete Mathematics, BCA Semester 1' })).toContainText('Used by Discrete Mathematics');
  await expect(page.getByTestId('course-card').first().getByTestId('unreviewed')).toBeVisible();
  await shot(page, 'syllabus');

  await row.getByRole('combobox', { name: 'Course for Discrete Mathematics' }).click();
  await page.getByRole('option', { name: 'Mathematics, Class 10' }).click();
  await expect(page.getByText('Discrete Mathematics now uses “Mathematics, Class 10”')).toBeVisible();
  await open(page, '/syllabus');
  await expect(row.getByRole('combobox', { name: 'Course for Discrete Mathematics' })).toHaveText('Mathematics, Class 10');

  // Unlink, then put it back.
  await row.getByRole('combobox', { name: 'Course for Discrete Mathematics' }).click();
  await page.getByRole('option', { name: 'Not linked' }).click();
  await expect(page.getByText('Discrete Mathematics is no longer linked to a course')).toBeVisible();
  await row.getByRole('combobox', { name: 'Course for Discrete Mathematics' }).click();
  await page.getByRole('option', { name: 'Discrete Mathematics, BCA Semester 1' }).click();
  await expect(page.getByText('Discrete Mathematics now uses “Discrete Mathematics, BCA Semester 1”')).toBeVisible();

  await page.getByTestId('curriculum-cbse').click();
  await expect(page).toHaveURL(/curriculum=cbse/);
  await expect(page.getByTestId('course-card')).toHaveCount(2);
});

test('a course shows its chapters, and the institution adds, edits and deletes its own topic', async ({ page }) => {
  await open(page, '/syllabus');
  await page.getByTestId('course-card').filter({ hasText: 'Corporate Accounting, BCom Semester 3' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Corporate Accounting, BCom Semester 3');
  await expect(page.getByText('has not been checked by a subject expert yet')).toBeVisible();
  const chapter = page.getByTestId('chapter').filter({ hasText: 'Underwriting of Shares' });
  await chapter.getByTestId('topic').first().click();
  const libraryTopic = page.getByRole('dialog');
  await expect(libraryTopic.getByTestId('topic-detail')).toContainText('Notes');
  await expect(libraryTopic).toContainText("Library topics can't be edited");
  await expect(libraryTopic.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await libraryTopic.getByRole('button', { name: 'Close' }).click();

  const title = `E2E: Underwriting worked example ${Date.now() % 100000}`;
  await chapter.getByRole('button', { name: 'Add a topic to Underwriting of Shares' }).click();
  const form = page.getByRole('dialog', { name: 'Add a topic to “Underwriting of Shares”' });
  await form.getByRole('textbox', { name: 'Title' }).fill(title);
  await form.getByRole('textbox', { name: 'Summary' }).fill('A full worked example from the university question paper.');
  await form.getByRole('textbox', { name: 'Note 1' }).fill('Firm underwriting is counted on top of the marked applications.');
  await form.getByRole('button', { name: 'Add note' }).click();
  await form.getByRole('textbox', { name: 'Note 2' }).fill('Commission is limited by the Companies Act.');
  await form.getByRole('button', { name: 'Add outcome' }).click();
  await form.getByRole('textbox', { name: 'Outcome 1' }).fill('Students can compute the underwriters’ liability.');
  await shot(page, 'syllabus-topic-form');
  await form.getByRole('button', { name: 'Add topic' }).click();
  await expect(page.getByText(`Added “${title}”`)).toBeVisible();

  const mine = chapter.getByTestId('topic').filter({ hasText: title });
  await expect(mine).toContainText('Your topic');
  await shot(page, 'syllabus-course');
  await mine.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('topic-detail')).toContainText('Commission is limited by the Companies Act.');
  await expect(dialog.getByTestId('topic-detail')).toContainText('compute the underwriters’ liability');
  await dialog.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit topic' });
  await edit.getByRole('button', { name: 'Remove note 1' }).click();
  await expect(edit.getByRole('textbox', { name: 'Note 1' })).toHaveValue('Commission is limited by the Companies Act.');
  await edit.getByRole('textbox', { name: 'Title' }).fill(`${title} (revised)`);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Saved “${title} (revised)”`)).toBeVisible();

  await chapter.getByTestId('topic').filter({ hasText: `${title} (revised)` }).click();
  await expect(page.getByRole('dialog').getByTestId('topic-detail')).not.toContainText('Firm underwriting');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete topic' }).click();
  await expect(page.getByText(`Deleted “${title} (revised)”`)).toBeVisible();
  await expect(chapter.getByTestId('topic').filter({ hasText: title })).toHaveCount(0);
});

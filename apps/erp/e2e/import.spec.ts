import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { open, shot } from './helpers';

// Bulk import as the principal of the demo college: programs, staff, students, then the timetable.
// Names, emails and phones get a suffix per run, so the test can run again on the same database.
test.describe.configure({ mode: 'serial' });

const run = Math.random().toString(36).slice(2, 6);
const program = `BSc${run}`;
const base = String(Date.now() % 1_000_000).padStart(6, '0');
const num = (n: number) => `+9197${base}${String(n).padStart(2, '0')}`;
const email = (who: string) => `${who}.${run}@import.example.in`;

async function upload(page: Page, kind: string, csv: string) {
  await page.getByTestId(`import-file-${kind}`).setInputFiles({ name: `${kind}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByTestId(`import-panel-${kind}`).getByTestId('import-file-name')).toContainText(`${kind}.csv`);
}

async function checkAndImport(page: Page, kind: string, rows: number) {
  const panel = page.getByTestId(`import-panel-${kind}`);
  await panel.getByTestId('import-check').click();
  await expect(panel.getByTestId('import-ready')).toContainText('No errors');
  await expect(panel.getByTestId('import-row')).toHaveCount(rows);
  await panel.getByTestId('import-run').click();
  await expect(panel.getByTestId('import-done')).toContainText('Imported.');
}

test('the principal sets up classes, staff, students and the timetable from CSV files', async ({ page }) => {
  await open(page, '/import');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Import');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Import' })).toHaveAttribute('aria-current', 'page');

  // 1. Programs: the template, a dry run that saves nothing, then the import.
  const programs = page.getByTestId('import-panel-programs');
  const [download] = await Promise.all([page.waitForEvent('download'), programs.getByTestId('import-template').click()]);
  expect(download.suggestedFilename()).toBe('kinetix-programs.csv');
  expect(readFileSync((await download.path())!, 'utf8')).toContain('program,level,terms,term,section,display_name,subject_code,subject_name,department');
  await expect(programs.getByTestId('import-run')).toBeDisabled();
  await upload(
    page,
    'programs',
    `program,level,terms,term,section,subject_code,subject_name,department\n${program},ug,6,1,A,${program}-1.1,Physics I,Science ${run}\n${program},ug,6,1,B,${program}-1.2,Kannada I,Languages ${run}\n`,
  );
  await checkAndImport(page, 'programs', 2);
  await expect(programs.getByTestId('import-done')).toContainText('2 added');
  await shot(page, 'import-programs-done');
  await programs.getByTestId('import-next').click();

  // 2. Staff, with a Kannada name.
  await upload(page, 'staff', `full_name,email,phone,roles,preferred_language,departments\nಮಂಜುನಾಥ ಗೌಡ,${email('manju')},${num(1)},teacher,kn,Languages ${run}\nPriya Nair,${email('priya')},${num(2)},teacher;hod,en,Science ${run}\n`);
  await checkAndImport(page, 'staff', 2);
  await page.getByTestId('import-panel-staff').getByTestId('import-next').click();

  // 3. Students: a wrong class is highlighted and blocks the import; the fixed file goes in.
  const students = page.getByTestId('import-panel-students');
  const header = 'roll_no,full_name,section,guardian1_name,guardian1_phone,guardian1_relation,guardian1_language';
  await upload(page, 'students', `${header}\n${run}-001,आरव मिश्रा,${program} Sem 1 A,राजेश मिश्रा,${num(3)},father,hi\n${run}-002,Kavya Shetty,${program} Sem 9 Z,Prakash Shetty,${num(4)},father,kn\n`);
  await students.getByTestId('import-check').click();
  await expect(students.getByTestId('import-has-errors')).toContainText('1 row has an error');
  const bad = students.locator('[data-testid=import-row][data-status=error]');
  await expect(bad).toHaveCount(1);
  await expect(bad).toContainText('No class with this name. Import programs and classes first.');
  await expect(bad).toContainText(`${program} Sem 9 Z`);
  expect(await bad.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(students.getByTestId('import-total-error')).toContainText('Errors: 1');
  await expect(students.getByTestId('import-run')).toBeDisabled();
  await shot(page, 'import-students-errors');
  await upload(page, 'students', `${header}\n${run}-001,आरव मिश्रा,${program} Sem 1 A,राजेश मिश्रा,${num(3)},father,hi\n${run}-002,Kavya Shetty,${program} Sem 1 B,Prakash Shetty,${num(4)},father,kn\n${run}-003,ದಿಯಾ ಮಿಶ್ರಾ,${program} Sem 1 B,राजेश मिश्रा,${num(3)},father,hi\n`);
  await expect(students.getByTestId('import-preview')).toHaveCount(0); // a new file clears the old check
  await checkAndImport(page, 'students', 3);
  await students.getByTestId('import-next').click();

  // 4. Timetable: a teacher booked twice is reported on its row; then the corrected file.
  const tt = page.getByTestId('import-panel-timetable');
  const ttHeader = 'section,subject_code,teacher,day,start,end,room';
  await upload(page, 'timetable', `${ttHeader}\n${program} Sem 1 A,${program}-1.1,${email('priya')},Mon,09:00,09:55,Lab ${run}\n${program} Sem 1 B,${program}-1.2,${email('priya')},Mon,09:30,10:25,\n`);
  await tt.getByTestId('import-check').click();
  const clash = tt.locator('[data-testid=import-row][data-status=error]');
  await expect(clash).toContainText('The teacher is already teaching at this time');
  await expect(clash).toContainText('This teacher is already teaching at 09:00–09:55 that day');
  await expect(tt.getByTestId('import-run')).toBeDisabled();
  await upload(page, 'timetable', `${ttHeader}\n${program} Sem 1 A,${program}-1.1,${email('priya')},Mon,09:00,09:55,Lab ${run}\n${program} Sem 1 B,${program}-1.2,${num(1)},1,09:30,10:25,\n`);
  await checkAndImport(page, 'timetable', 2);
  await expect(tt.getByTestId('import-next')).toHaveCount(0);
  await shot(page, 'import-timetable-done');

  // The imported class and its periods are in the timetable editor.
  await open(page, '/timetable');
  await page.getByTestId('timetable-of').click();
  await page.getByRole('option', { name: `${program} Sem 1 A` }).click();
  await expect(page.getByTestId('timetable-title')).toHaveText(`${program} Sem 1 A`);
  await expect(page.getByTestId('timetable-summary')).toContainText('1 period a week');
  await expect(page.getByTestId('slot')).toContainText('Priya Nair');
});

test('a file in the wrong shape is refused before anything is checked', async ({ page }) => {
  await open(page, '/import');
  await upload(page, 'programs', 'program,level\nBA,ug\n');
  const panel = page.getByTestId('import-panel-programs');
  await panel.getByTestId('import-check').click();
  await expect(panel.getByTestId('import-error')).toHaveText('The file is missing these columns: terms. Start from the template.');
  // Not UTF-8 (an Excel "CSV" in Windows-1252).
  await page.getByTestId('import-file-programs').setInputFiles({ name: 'latin.csv', mimeType: 'text/csv', buffer: Buffer.from([0x52, 0x61, 0xe9, 0x6c, 0x0a]) });
  await expect(panel.getByTestId('import-error')).toContainText("Couldn't read the file.");
  await page.getByTestId('import-file-programs').setInputFiles({ name: 'sheet.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(panel.getByTestId('import-error')).toHaveText('Choose a .csv file.');
});

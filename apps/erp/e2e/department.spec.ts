import { expect, test } from '@playwright/test';
import { addDays, open, schoolToday, shot, signIn } from './helpers';

// Ravi Kumar heads Commerce in the demo seed (Corporate Accounting and Cost Accounting, taught
// by Anita Sharma in BCom Sem 3 A) and teaches Discrete Mathematics in BCA Sem 1 A himself.
test.describe.configure({ mode: 'serial' });

test('a head of department lands on their department and sees how its classes went', async ({ page }) => {
  await signIn(page, 'ravi@demo.kinetix.in');
  await expect(page).toHaveURL(/\/department$/);
  await page.context().storageState({ path: 'e2e/.auth/hod.json' });
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commerce');
  await expect(page.getByTestId('dept-subtitle')).toContainText('Head: Ravi Kumar');
  await expect(page.getByTestId('dept-subtitle')).toContainText('This week');
  await expect(page.getByTestId('dept-subjects')).toHaveText('Corporate Accounting · Cost Accounting');
  // Only one department: no picker.
  await expect(page.getByTestId('dept-picker')).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Department', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Departments' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();

  for (const id of ['held', 'taken', 'attendance', 'homework', 'recordings', 'assessments']) await expect(page.getByTestId(`dept-stat-${id}`)).toBeVisible();
  const teachers = page.getByTestId('dept-teachers');
  await expect(teachers.getByTestId('dept-teacher-row')).toHaveCount(2);
  await expect(teachers.getByTestId('dept-teacher-row').filter({ hasText: 'Anita Sharma' })).toBeVisible();
  const classes = page.getByTestId('dept-classes').getByTestId('dept-class-row');
  await expect(classes).toHaveCount(2);
  await expect(classes.first()).toContainText('BCom Sem 3 A');
  await expect(classes.first()).toContainText('Corporate Accounting');
  await expect(classes.first()).toContainText('Anita Sharma');
  await shot(page, 'department-hod-week');

  // The term: the seeded unit test and its average.
  await page.getByTestId('dept-range').getByRole('button', { name: 'This term' }).click();
  await expect(page).toHaveURL(/range=term/);
  await expect(page.getByTestId('dept-subtitle')).toContainText('This term');
  // Over the term ("This week" may have nothing due yet on a Monday morning).
  const anita = teachers.getByTestId('dept-teacher-row').filter({ hasText: 'Anita Sharma' });
  // The seed's classes were not taught on a board, so classes held is flagged.
  await expect(anita.getByTestId('teacher-held')).toHaveAttribute('data-tone', 'low');
  await expect(anita.getByTestId('flag')).toHaveText('Needs attention');
  // Ravi teaches none of Commerce's periods: nothing to measure, nothing flagged.
  const ravi = teachers.getByTestId('dept-teacher-row').filter({ hasText: 'Ravi Kumar' });
  await expect(ravi).toContainText('No periods due in this range');
  await expect(ravi.getByTestId('flag')).toHaveCount(0);

  const tests = page.getByTestId('dept-assessments').getByTestId('dept-assessment-row');
  await expect(tests.first()).toContainText('Unit test 1: Underwriting of shares');
  await expect(tests.first()).toContainText('74.7%');
  await expect(classes.filter({ hasText: 'Corporate Accounting' }).getByTestId('class-latest')).toContainText('74.7%');
  await shot(page, 'department-hod');

  // A custom range.
  await page.getByTestId('dept-range').getByRole('button', { name: 'Custom' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom range' });
  const from = addDays(schoolToday(), -40);
  const to = addDays(schoolToday(), -10);
  await dialog.getByLabel('From').fill(from);
  await dialog.getByLabel('To').fill(to);
  await dialog.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}$`));
  await expect(page.getByTestId('dept-subtitle')).toContainText('Custom, ');
  await expect(page.getByTestId('dept-range').getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
});

test('the classes table fits its frame at 1280 and 1440 px, with the teacher and results link in view', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/hod.json' });
  const page = await context.newPage();
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/department?range=term');
    const frame = page.getByTestId('dept-classes');
    const { scroll, client } = await frame.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll, `classes table is ${scroll}px wide in a ${client}px frame at ${width}`).toBeLessThanOrEqual(client);
    const row = frame.getByTestId('dept-class-row').filter({ hasText: 'Corporate Accounting' });
    // Nothing was dropped: teacher, plans, homework, latest result and the link to the class's results.
    await expect(row.getByTestId('class-teacher')).toHaveText('Anita Sharma');
    await expect(row.getByTestId('class-year-plan')).toBeVisible();
    await expect(row.getByTestId('class-lesson-plans')).toHaveText(/^\d+ of \d+ periods$/);
    await expect(row.getByTestId('class-homework')).toHaveText(/^\d+$/);
    await expect(row.getByTestId('class-latest')).toContainText('74.7%');
    const link = row.getByRole('link', { name: 'Results for BCom Sem 3 A' });
    await expect(link).toBeVisible();
    const [box, frameBox] = [await link.boundingBox(), await frame.boundingBox()];
    expect(box!.x + box!.width, `results link inside the frame at ${width}`).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
  }
  await shot(page, 'department-classes-1440');
  await context.close();
});

test('the stat tiles fit at 1280 and 1440 px: "Syllabus covered" shows "n of m topics" in full', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/hod.json' });
  const page = await context.newPage();
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/department?range=term');
    const tile = page.getByTestId('dept-stat-syllabus');
    const unit = tile.getByText(/^\d+ of \d+ topics$/);
    await expect(unit).toBeVisible();
    const [u, box] = [await unit.boundingBox(), await tile.boundingBox()];
    expect(u!.x + u!.width, `topics count inside the tile at ${width}`).toBeLessThanOrEqual(box!.x + box!.width);
    for (const id of ['held', 'taken', 'attendance', 'syllabus', 'homework', 'recordings', 'assessments']) {
      const { scroll, client } = await page.getByTestId(`dept-stat-${id}`).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(scroll, `${id} tile content is ${scroll}px in a ${client}px tile at ${width}`).toBeLessThanOrEqual(client);
    }
  }
  await shot(page, 'department-tiles-1440');
  await context.close();
});

test("a head of department sees their department's results, and cannot set up departments", async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/hod.json' });
  const page = await context.newPage();
  await open(page, '/department?range=term');
  // From the classes table to that class's results.
  await page.getByTestId('dept-classes').getByRole('link', { name: 'Results for BCom Sem 3 A' }).first().click();
  await expect(page).toHaveURL(/\/results\?class=/);
  await expect(page.getByTestId('results-class')).toContainText('BCom Sem 3 A');
  const row = page.getByTestId('assessment-row').filter({ hasText: 'Unit test 1: Underwriting of shares' });
  await expect(row).toBeVisible();
  // Only the classes he teaches and his department's classes.
  await page.getByTestId('results-class').click();
  const options = page.getByRole('option');
  await expect(options).toHaveText(['BCA Sem 1 A', 'BCom Sem 3 A']);
  await page.keyboard.press('Escape');
  await row.getByRole('link', { name: /Marks for/ }).click();
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Unit test 1');

  await page.goto('/departments');
  await expect(page).toHaveURL(/\/department$/);
  await context.close();
});

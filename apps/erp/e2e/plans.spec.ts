import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { addDays, PASSWORD, schoolToday, shot, signIn, signInAsPrincipal, TENANT } from './helpers';

// The demo seed gives BCom Sem 3 A a Corporate Accounting year plan (from three weeks ago, all its
// topics already taught, so "Ahead") and one lesson plan for Anita's next Corporate Accounting
// period. Ravi Kumar heads Commerce; he also teaches Discrete Mathematics in BCA Sem 1 A, which is
// not in his department, so he may not review plans there (the principal may).
test.describe.configure({ mode: 'serial' });

const API_URL = process.env.KINETIX_API_URL ?? 'http://localhost:4000';
const monday = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return addDays(d, w === 0 ? -6 : 1 - w);
};

/** Shows the lesson plans of the week of [date] (this week or the next). */
async function showWeekOf(page: Page, date: string) {
  if (monday(date) !== monday(schoolToday())) {
    await page.getByTestId('week-nav').getByRole('link', { name: 'Next week' }).click();
    await expect(page).toHaveURL(new RegExp(`week=${monday(date)}`));
  }
  await expect(page.getByTestId('lessons-week')).toBeVisible();
}

/** Ravi plans his next Discrete Mathematics period through the API, as the Teacher App would (with KINETIX AI). */
async function raviPlansAPeriod(request: APIRequestContext) {
  const login = await request.post(`${API_URL}/v1/auth/login`, { data: { tenant: TENANT, login: 'ravi@demo.kinetix.in', password: PASSWORD } });
  expect(login.ok()).toBe(true);
  const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
  let day = await (await request.get(`${API_URL}/v1/teacher/timetable?date=${schoolToday()}`, { headers })).json();
  if (!day.periods.length) day = await (await request.get(`${API_URL}/v1/teacher/timetable?date=${day.nextTeachingDate}`, { headers })).json();
  const period = day.periods[0];
  const saved = await request.put(`${API_URL}/v1/lesson-plans`, {
    headers,
    data: {
      slotId: period.slotId,
      date: day.date,
      aiDrafted: true,
      content: {
        objectives: ['Write truth tables for compound propositions'],
        steps: [
          { minutes: 10, activity: 'Recap: propositions and connectives' },
          { minutes: 30, activity: 'Truth tables for three examples on the board' },
        ],
        materials: ['Worksheet 2'],
        assessment: 'Two quick questions at the end',
        homework: '',
      },
    },
  });
  expect(saved.ok()).toBe(true);
  return { date: day.date as string, section: period.section.id as string, subject: period.subject.id as string };
}

test('a head of department sees the year plan status, opens the class plan and reviews a lesson plan', async ({ page, request }) => {
  await signIn(page, 'ravi@demo.kinetix.in');
  await expect(page).toHaveURL(/\/department$/);
  await page.waitForLoadState('networkidle');

  const classes = page.getByTestId('dept-classes');
  await expect(classes.getByRole('columnheader', { name: 'Year plan' })).toBeVisible();
  await expect(classes.getByRole('columnheader', { name: 'Lesson plans' })).toBeVisible();
  const corp = classes.getByTestId('dept-class-row').filter({ hasText: 'Corporate Accounting' });
  const cost = classes.getByTestId('dept-class-row').filter({ hasText: 'Cost Accounting' });
  await expect(corp.getByTestId('plan-status')).toHaveText('Ahead');
  await expect(corp.getByTestId('plan-status')).toHaveAttribute('data-status', 'ahead');
  await expect(cost.getByTestId('plan-status')).toHaveText('No plan');
  await expect(corp.getByTestId('class-lesson-plans')).toHaveText(/^(—|\d+ of \d+ periods)$/);
  // Ahead of plan is not a reason to flag the class.
  await page.getByTestId('dept-range').getByRole('button', { name: 'This term' }).click();
  await expect(page).toHaveURL(/range=term/);
  await expect(corp.getByTestId('class-lesson-plans')).toHaveText(/^\d+ of \d+ periods$/);
  await shot(page, 'department-plans');

  await corp.getByRole('link', { name: 'Year plan and lesson plans for BCom Sem 3 A · Corporate Accounting' }).click();
  await expect(page).toHaveURL(/\/department\/plan\?section=[0-9a-f-]{36}&subject=[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('BCom Sem 3 A · Corporate Accounting');

  // The year plan, week by week: every topic taught, this week highlighted.
  const summary = page.getByTestId('year-plan-summary');
  await expect(summary.getByTestId('plan-status')).toHaveText('Ahead');
  await expect(summary).toContainText('4 of 4 topics taught');
  const weeks = page.getByTestId('plan-week');
  expect(await weeks.count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('[data-testid=plan-week][data-this-week=true]')).toHaveCount(1);
  await expect(page.locator('[data-testid=plan-week][data-this-week=true]').getByTestId('this-week')).toHaveText('This week');
  await expect(page.getByTestId('plan-topic')).toHaveCount(4);
  await expect(page.locator('[data-testid=plan-topic][data-state=taught]')).toHaveCount(4);
  await expect(page.getByTestId('topic-late')).toHaveCount(0);
  await expect(page.getByTestId('plan-topic').first()).toContainText('Underwriting and underwriting commission');
  await expect(page.getByTestId('topic-taught').first()).toContainText('Taught');

  // Anita's lesson plan for her next period (this week or next).
  const login = await request.post(`${API_URL}/v1/auth/login`, { data: { tenant: TENANT, login: 'ravi@demo.kinetix.in', password: PASSWORD } });
  const section = new URL(page.url()).searchParams.get('section');
  const subject = new URL(page.url()).searchParams.get('subject');
  const list = await (await request.get(`${API_URL}/v1/lesson-plans?sectionId=${section}&subjectId=${subject}`, { headers: { authorization: `Bearer ${(await login.json()).accessToken}` } })).json();
  expect(list.plans).toHaveLength(1);
  await showWeekOf(page, list.plans[0].date);
  const card = page.getByTestId('lesson-plan');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('lesson-topic')).toHaveText('Underwriting and underwriting commission');
  await expect(card.getByTestId('lesson-objectives')).toContainText('Solve one textbook problem in class');
  await expect(card.getByTestId('step-minutes')).toHaveText(['5 min', '20 min', '20 min', '10 min']);
  await expect(card).toContainText('55 min in all');
  await expect(card.getByTestId('lesson-steps')).toContainText('Recap of the last class with two quick questions');
  await expect(card.getByTestId('lesson-materials')).toContainText('Textbook chapter 4');
  await expect(card.getByTestId('lesson-assessment')).toHaveText('Exit question: pass the journal entry for one case.');
  await expect(card.getByTestId('lesson-homework')).toHaveText('Exercise 4.2 questions 2 to 5');
  await expect(card).toContainText('Anita Sharma');
  await expect(card.getByTestId('ai-draft')).toHaveCount(0);
  await expect(card.getByTestId('review-status')).toHaveText('Not reviewed');
  await shot(page, 'class-plan');

  // Review with a remark.
  await card.getByTestId('review-plan').click();
  const dialog = page.getByRole('dialog', { name: 'Review lesson plan' });
  await dialog.getByLabel('Remark (optional)').fill('Add a recap question on goodwill');
  await dialog.getByRole('button', { name: 'Mark as reviewed' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Lesson plan reviewed')).toBeVisible();
  await expect(card).toHaveAttribute('data-reviewed', 'true');
  await expect(card.getByTestId('review-status')).toContainText('Reviewed');
  await expect(card.getByTestId('review-status')).toContainText('by Ravi Kumar');
  await expect(card.getByTestId('review-remark')).toHaveText('Remark: Add a recap question on goodwill');
  await expect(card.getByTestId('review-plan')).toHaveText('Review again');
  await shot(page, 'class-plan-reviewed');
});

test("a head may not review plans outside their department: the API's reason is shown; the principal may", async ({ page, browser, request }) => {
  const mine = await raviPlansAPeriod(request);
  const url = `/department/plan?section=${mine.section}&subject=${mine.subject}`;

  await signIn(page, 'ravi@demo.kinetix.in');
  await expect(page).toHaveURL(/\/department$/);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('BCA Sem 1 A · Discrete Mathematics');
  await expect(page.getByTestId('no-year-plan')).toContainText('No year plan yet');
  await showWeekOf(page, mine.date);
  const card = page.getByTestId('lesson-plan');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('ai-draft')).toHaveText('AI draft');
  await expect(card).toContainText('40 min in all');
  await expect(card.getByTestId('lesson-homework')).toHaveCount(0); // none set: a dash
  await card.getByTestId('review-plan').click();
  const dialog = page.getByRole('dialog', { name: 'Review lesson plan' });
  await dialog.getByRole('button', { name: 'Mark as reviewed' }).click();
  await expect(dialog.getByTestId('review-error')).toHaveText('Only the head of department or the principal reviews lesson plans');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toHaveAttribute('data-reviewed', 'false');

  // The principal reviews it without a remark.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await context.newPage();
  await signInAsPrincipal(p);
  await p.goto(`${url}&week=${mine.date}`);
  const pc = p.getByTestId('lesson-plan');
  await pc.getByTestId('review-plan').click();
  await p.getByRole('dialog', { name: 'Review lesson plan' }).getByRole('button', { name: 'Mark as reviewed' }).click();
  await expect(pc).toHaveAttribute('data-reviewed', 'true');
  await expect(pc.getByTestId('review-remark')).toHaveCount(0);
  await context.close();
});

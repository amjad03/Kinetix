import { expect, type Page } from '@playwright/test';

export const TENANT = process.env.E2E_TENANT ?? 'demo-college';
export const PASSWORD = process.env.E2E_PASSWORD ?? 'kinetix123';

export async function signIn(page: Page, login: string, tenant = TENANT, password = PASSWORD) {
  await page.goto('/login');
  await page.locator('input[name=tenant]').fill(tenant);
  await page.locator('input[name=login]').fill(login);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signInAsPrincipal(page: Page) {
  await signIn(page, 'principal@demo.kinetix.in');
  await expect(page.getByTestId('school-name')).toBeVisible();
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Today in the school's time zone (Asia/Kolkata in the demo). */
export function schoolToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.KINETIX_TIMEZONE ?? 'Asia/Kolkata' }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/** The most recent Monday–Saturday before today: the seed has attendance for it. */
export function lastSchoolDay(): string {
  let d = addDays(schoolToday(), -1);
  while (weekday(d) === 0) d = addDays(d, -1);
  return d;
}

/** A Sunday at least a week away, so no demo data was added for it. */
export function futureSunday(): string {
  let d = addDays(schoolToday(), 7);
  while (weekday(d) !== 0) d = addDays(d, 1);
  return d;
}

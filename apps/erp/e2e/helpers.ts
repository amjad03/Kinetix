import { expect, type Page } from '@playwright/test';
import path from 'node:path';

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

/** Navigate and wait until streamed sections have been revealed (React may briefly keep a hidden copy). */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Saves a screenshot to $E2E_SHOTS (when set) for reviewing the pages by eye. */
export async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS;
  if (dir) await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

import { expect, type Locator, type Page } from '@playwright/test';

/** Run-unique suffix so repeated runs against one database never collide on names. */
export const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** The open form dialog (the shared FormDialog), found by its title. */
export function dialog(page: Page, title: string | RegExp): Locator {
  return page.getByRole('dialog', { name: title });
}

/**
 * Fills a FormDialog's fields by field name (`f-<name>` test ids). Selects are chosen by their visible option text,
 * everything else is typed (dates as YYYY-MM-DD, times as HH:mm, date-times as YYYY-MM-DDTHH:mm).
 */
export async function fillForm(page: Page, dlg: Locator, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = dlg.getByTestId(`f-${name}`);
    if ((await field.getByRole('combobox').count()) > 0) {
      await field.getByRole('combobox').click();
      await page.getByRole('option', { name: value, exact: true }).click();
    } else {
      await field.locator('textarea:not([aria-hidden="true"]), input:not([aria-hidden="true"])').first().fill(value);
    }
  }
}

/** Submits the FormDialog and waits for it to close. */
export async function submitForm(dlg: Locator) {
  await dlg.getByTestId('ops-submit').click();
  await expect(dlg).toBeHidden();
}

/** Opens a button's dialog, fills it, submits it. */
export async function createVia(page: Page, buttonName: string | RegExp, title: string | RegExp, values: Record<string, string>) {
  await page.getByRole('button', { name: buttonName }).first().click();
  const dlg = dialog(page, title);
  await expect(dlg).toBeVisible();
  await fillForm(page, dlg, values);
  await submitForm(dlg);
}

/** ISO date n days from today (UTC date; the demo never needs the exact school day here). */
export function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Collects page errors and console errors (hydration mismatches, failed renders) so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { API_URL, apiLogin } from './board-sim';
import { open, PASSWORD, setLanguageCookie, shot, TENANT } from './helpers';

// The Zynetix admin dashboard. Signs in as the demo administrator (tenant admin, also on the
// platform team). The board-edition test switches the demo college to the board edition through
// the platform API and back again. The YouTube test serves a channel feed from a local fixture
// server: start the API with YOUTUBE_BASE_URL=http://127.0.0.1:4399 (or set E2E_YOUTUBE_BASE_URL
// to the same value) so no request leaves the machine.
const ADMIN = 'admin@demo.kinetix.in';
const YT_BASE = process.env.E2E_YOUTUBE_BASE_URL ?? 'http://127.0.0.1:4399';
const CHANNEL = 'UCzynetixE2Efixture00001';

async function call<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface Structure {
  subjects: { id: string; code: string; name: string; courseId: string | null }[];
}
interface Outline {
  course: { chapters: { topics: { id: string; title: string }[] }[] } | null;
}

let token = '';
let subject: Structure['subjects'][number];
let topics: { id: string; title: string }[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  token = await apiLogin(ADMIN);
  const s = await call<Structure>(token, '/v1/admin/structure');
  subject = s.subjects.find((x) => x.courseId)!;
  const o = await call<Outline>(token, `/v1/subjects/${subject.id}/outline`);
  topics = o.course!.chapters.flatMap((c) => c.topics);
});

async function signIn(page: Page, login: string) {
  await setLanguageCookie(page, 'en');
  await page.goto('/login');
  await page.locator('input[name=tenant]').fill(TENANT);
  await page.locator('input[name=login]').fill(login);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
}

async function signInAsAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByTestId('school-name')).toBeVisible();
}

test('content library: add, edit, re-target and remove a topic material', async ({ page }) => {
  await signInAsAdmin(page);
  await open(page, `/zynetix/library?subject=${subject.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Content library');
  const topic = page.getByTestId('zx-topic').first();
  await topic.getByTestId('zx-topic-toggle').click();
  const panel = topic.getByTestId('zx-topic-panel');
  await expect(panel).toBeVisible();

  const title = `E2E notes ${Date.now()}`;
  await panel.getByTestId('zx-add-material').click();
  const dlg = page.getByTestId('zx-material-dialog');
  await dlg.getByTestId('zx-material-kind').click();
  await page.getByRole('option', { name: 'Link' }).click();
  await dlg.getByTestId('zx-material-title').fill(title);
  // A link needs a URL: the dialog says so before the API is asked.
  await page.getByTestId('zx-material-save').click();
  await expect(dlg.getByRole('alert')).toContainText('Give the link');
  await dlg.getByTestId('zx-material-url').fill('https://example.org/zynetix-notes');
  await page.getByTestId('zx-material-save').click();
  const row = panel.getByTestId('zx-material').filter({ hasText: title });
  await expect(row).toBeVisible();

  // Hide it from parents, then edit it into a book chapter range.
  await expect(row.getByTestId('zx-aud-parent')).toHaveAttribute('aria-pressed', 'true');
  await row.getByTestId('zx-aud-parent').click();
  await expect(row.getByTestId('zx-aud-parent')).toHaveAttribute('aria-pressed', 'false');
  await row.getByTestId('zx-material-edit').click();
  await dlg.getByTestId('zx-material-title').fill(`${title} v2`);
  await page.getByTestId('zx-material-save').click();
  const edited = panel.getByTestId('zx-material').filter({ hasText: `${title} v2` });
  await expect(edited).toBeVisible();
  await shot(page, 'zynetix-library');

  // Reload: the change is saved, then remove it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('zx-topic').first().getByTestId('zx-topic-toggle').click();
  const again = page.getByTestId('zx-topic').first().getByTestId('zx-material').filter({ hasText: `${title} v2` });
  await expect(again.getByTestId('zx-aud-parent')).toHaveAttribute('aria-pressed', 'false');
  page.once('dialog', (d) => d.accept());
  await again.getByTestId('zx-material-remove').click();
  await expect(again).toHaveCount(0);
});

test.describe('YouTube import', () => {
  let server: Server | null = null;
  test.beforeAll(async () => {
    const url = new URL(YT_BASE);
    // Fresh video ids each run, so a re-run imports them again instead of finding them already there.
    const run = Date.now().toString(36).slice(-6);
    const entries = topics.slice(0, 2).map(
      (tp, i) => `<entry><yt:videoId>zx${run}v${i}a</yt:videoId><title>Lecture ${i + 1}: ${tp.title}</title><author><name>Zynetix Lectures</name></author><published>2026-10-0${i + 1}T10:00:00Z</published></entry>`,
    );
    entries.push(`<entry><yt:videoId>zx${run}v9z</yt:videoId><title>Campus tour vlog</title><published>2026-10-05T10:00:00Z</published></entry>`);
    const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Zynetix Lectures</title>${entries.join('')}</feed>`;
    server = createServer((req, res) => {
      if (req.url?.startsWith(`/feeds/videos.xml?channel_id=${CHANNEL}`)) {
        res.writeHead(200, { 'content-type': 'application/atom+xml' });
        res.end(xml);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((ok, fail) => server!.once('error', fail).listen(Number(url.port), url.hostname, () => ok()));
  });
  test.afterAll(() => new Promise<void>((ok) => (server ? server.close(() => ok()) : ok())));

  test('previews a channel with a suggested topic per video, then imports the mapping', async ({ page }) => {
    await signInAsAdmin(page);
    await open(page, '/zynetix/youtube');
    await page.getByTestId('zx-yt-url').fill(`https://www.youtube.com/channel/${CHANNEL}`);
    await page.getByTestId('zx-yt-courses').getByText(`${subject.code} · ${subject.name}`).click();
    await page.getByTestId('zx-yt-preview').click();

    const result = page.getByTestId('zx-yt-result');
    await expect(result).toContainText('Zynetix Lectures');
    await expect(result.getByTestId('zx-yt-video')).toHaveCount(3);
    const first = result.getByTestId('zx-yt-video').filter({ hasText: `Lecture 1: ${topics[0].title}` });
    await expect(first).toContainText('Suggested');
    await expect(first.getByTestId('zx-yt-topic')).toContainText(topics[0].title);
    const vlog = result.getByTestId('zx-yt-video').filter({ hasText: 'Campus tour vlog' });
    await expect(vlog).toContainText('No topic suggested');
    await expect(vlog.getByRole('checkbox')).not.toBeChecked();

    // Map the vlog by hand to the second topic, then import all three.
    await vlog.getByTestId('zx-yt-topic').click();
    await page.getByRole('option', { name: new RegExp(`^${topics[1].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ·`) }).first().click();
    await expect(vlog.getByRole('checkbox')).toBeChecked();
    await expect(page.getByTestId('zx-yt-import')).toHaveText('Import 3 videos');
    await page.getByTestId('zx-yt-import').click();
    await expect(page.getByTestId('zx-yt-done')).toContainText(/\d+ added, \d+ already there/);
    await shot(page, 'zynetix-youtube');
  });
});

test('adds a teacher and shows the temporary password once', async ({ page }) => {
  await signInAsAdmin(page);
  await open(page, '/zynetix/teachers');
  const email = `zx.e2e.${Date.now()}@demo.kinetix.in`;
  await page.getByTestId('zx-add-teacher').click();
  await page.getByTestId('zx-teacher-name').fill('Zara E2E Teacher');
  await page.getByTestId('zx-teacher-email').fill(email);
  await page.getByTestId('zx-teacher-save').click();
  const pw = page.getByTestId('zx-temp-password');
  await expect(pw).toHaveText(/\S{6,}/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(pw).toHaveCount(0);
  const row = page.getByTestId('zx-teacher-row').filter({ hasText: email });
  await expect(row).toContainText('Active');

  // Deactivate them again (no stray active accounts on the demo).
  page.once('dialog', (d) => d.accept());
  await row.getByTestId('zx-teacher-active').click();
  await expect(row).toContainText('Deactivated');
});

test('AI answer log lists requests with outcome, and filters them', async ({ page }) => {
  const principal = await apiLogin('principal@demo.kinetix.in');
  for (const question of ['What is a balance sheet?', 'Explain depreciation.']) await call(principal, '/v1/ai/explain', 'POST', { question });
  await signInAsAdmin(page);
  await open(page, '/zynetix/ai-log');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI answer log');
  await expect(page.getByTestId('zx-ai-requests')).toContainText(/[1-9]/);
  await expect(page.getByTestId('zx-ai-charts')).toBeVisible();
  const rows = page.getByTestId('zx-ai-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasText: 'explain' }).first()).toBeVisible();

  await page.getByTestId('zx-ai-status').selectOption('throttled');
  await page.getByTestId('zx-ai-apply').click();
  await expect(page).toHaveURL(/status=throttled/);
  await expect(page.getByTestId('zx-ai-row').filter({ hasText: 'Served' })).toHaveCount(0);
  await shot(page, 'zynetix-ai-log');
});

test('overview, boards and edge, programmes and the platform pages open', async ({ page }) => {
  await signInAsAdmin(page);
  for (const [path, heading] of [
    ['/zynetix', 'Zynetix overview'],
    ['/zynetix/boards?bucket=day', 'Boards and edge'],
    ['/zynetix/programs', /and subjects$/],
    ['/platform/zynetix', 'Zynetix institutions'],
    ['/platform/zynetix?tab=library', 'Zynetix institutions'],
    ['/platform/zynetix?tab=youtube', 'Zynetix institutions'],
  ] as [string, string | RegExp][]) {
    await open(page, path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading);
    await expect(page.getByRole('alert').filter({ hasText: /error|wrong/i }), path).toHaveCount(0);
  }
  await expect(page.getByTestId('zx-yt-courses')).toBeVisible();
  await open(page, '/zynetix/boards');
  await expect(page.getByTestId('zx-devices')).toBeVisible();
  await open(page, '/platform/zynetix');
  await expect(page.getByTestId('zx-tenants')).toContainText('demo-college');
});

test('board edition: the menu is Zynetix only and ERP pages go to the overview', async ({ page }) => {
  const tenants = await call<{ id: string; slug: string; edition: string }[]>(token, '/v1/platform/tenants');
  const demo = tenants.find((x) => x.slug === 'demo-college')!;
  await call(token, `/v1/platform/tenants/${demo.id}`, 'PATCH', { edition: 'board' });
  try {
    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/zynetix$/);
    await expect(page.getByTestId('product-brand')).toHaveText('Zynetix');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zynetix overview');
    await expect(page.getByTestId('zx-coverage')).toBeVisible();
    const sidebar = page.locator('[data-sidebar="sidebar"]').first();
    await expect(sidebar.getByRole('link', { name: 'Content library' }).first()).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Fees' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Admissions' })).toHaveCount(0);

    // ERP pages redirect to the overview; the timetable stays reachable.
    await page.goto('/fees');
    await expect(page).toHaveURL(/\/zynetix$/);
    await open(page, '/timetable');
    await expect(page).toHaveURL(/\/timetable/);
    await shot(page, 'zynetix-board-edition');
  } finally {
    await call(token, `/v1/platform/tenants/${demo.id}`, 'PATCH', { edition: 'full' });
  }
  await open(page, '/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('product-brand')).toHaveCount(0);
});

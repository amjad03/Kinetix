import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { apiLogin, SAMPLE_INK, startBoard, type SimBoard } from './board-sim';
import { readFileSync } from 'node:fs';
import { open, shot } from './helpers';

// Signed in as the principal by principal.setup.ts. A pretend board is enrolled and paired
// through the API, and answers snapshot requests like the KINETIX Board app.
test.describe.configure({ mode: 'serial' });

let tokens: { admin: string; teacher: string };
// Class audio encoded by the boards' Dart codec (scripts/live-audio-fixture.dart).
const audioFixture = JSON.parse(readFileSync(new URL('../src/lib/live/fixtures/live-audio.json', import.meta.url), 'utf8')) as { chunks: { data: string }[] };
const boards: SimBoard[] = [];

test.beforeAll(async () => {
  tokens = { admin: await apiLogin('admin@demo.kinetix.in'), teacher: await apiLogin('anita@demo.kinetix.in') };
});

test.afterAll(async () => {
  // Leave no class open on the pretend boards, so a rerun starts from an empty Live page.
  await Promise.allSettled(boards.map((b) => b.endClass()));
  boards.forEach((b) => b.close());
});

test('Live shows an empty state when no class is on a board', async ({ page }) => {
  await open(page, '/live');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live');
  // The seed's only board is not enrolled, so nothing is being taught.
  await expect(page.getByTestId('no-live')).toContainText('No classes on the boards right now');
  await shot(page, 'live-empty');
});

test('watching an empty board, then ink arrives live', async ({ page }) => {
  const board = await startBoard({ name: `E2E Live Board ${Date.now() % 100000}`, adminToken: tokens.admin, teacherToken: tokens.teacher });
  boards.push(board);

  await open(page, '/live');
  const card = page.getByTestId('live-card').filter({ hasText: board.name });
  await expect(card).toContainText('Anita Sharma');
  await expect(card).toContainText('Started');
  await shot(page, 'live-list');
  await card.getByRole('link', { name: /^Watch/ }).click();

  await expect(page).toHaveURL(new RegExp(`/live/${board.id}$`));
  await expect(page.getByTestId('live-notes')).toContainText('Viewing is recorded in the audit log');
  // Class audio is off for leaders unless the institution allows it (the demo does not).
  await expect(page.getByTestId('live-notes')).toContainText('Class audio is off for leaders');
  await board.setAudio(true);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('live-audio')).toHaveCount(0);
  await board.setAudio(false);
  // The board has drawn nothing yet: an empty page, live.
  await expect(page.getByTestId('live-empty')).toBeVisible();
  await expect(page.getByTestId('live-board')).toHaveAttribute('data-strokes', '0');
  await expect(page.getByTestId('live-page')).toHaveText('Page 1 of 1');
  await expect(page.getByTestId('live-info')).toContainText('Live');
  await shot(page, 'live-watch-empty');

  board.draw(SAMPLE_INK);
  await expect(page.getByTestId('live-board')).toHaveAttribute('data-strokes', '3');
  await expect(page.getByTestId('live-empty')).toBeHidden();
  board.draw([
    [10, 'n', 1],
    [11, 'k', 'chalkboard'],
    [12, 'b', 9, { t: 'pen', c: 0xff000000, w: 6, p: [300, 400] }],
    [13, 'p', 9, 500, 450, 700, 420, 900, 480],
  ]);
  await expect(page.getByTestId('live-page')).toHaveText('Page 2 of 2');
  await expect(page.getByTestId('live-board')).toHaveAttribute('data-background', 'chalkboard');
  await expect(page.getByTestId('live-board')).toHaveAttribute('data-strokes', '1');
  await shot(page, 'live-watch-chalkboard');

  await board.endClass();
  await expect(page.getByTestId('live-ended')).toContainText('Class ended');
  await shot(page, 'live-watch-ended');
});

test('a board with drawings shows them as soon as you start watching', async ({ page }) => {
  const board = await startBoard({ name: `E2E Live Board B ${Date.now() % 100000}`, adminToken: tokens.admin, teacherToken: tokens.teacher, snapshot: [[0, 'L', [[], []], 0], ...SAMPLE_INK] });
  boards.push(board);
  await page.goto(`/live/${board.id}`);
  await expect(page.getByTestId('live-board')).toHaveAttribute('data-strokes', '3');
  await expect(page.getByTestId('live-page')).toHaveText('Page 1 of 2');
  await shot(page, 'live-watch');

  board.close(); // the board loses its connection
  await expect(page.getByTestId('live-offline')).toContainText('The board went offline');
});

test('a board whose class has ended, and an unknown board, cannot be watched', async ({ page }) => {
  // The first board is still online, but its class ended in the test above.
  await page.goto(`/live/${boards[0].id}`);
  await expect(page.getByTestId('live-refused')).toContainText('No class on this board right now');
  await open(page, '/live/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('Board not found')).toBeVisible();
});

/**
 * Leaders hear class audio only when the institution allows it. There is no API for that
 * setting yet, so this test needs the database (E2E_DATABASE_URL, the API's owner connection).
 */
test('with class audio allowed for leaders, the principal can listen to the teacher', async ({ page }) => {
  const db = process.env.E2E_DATABASE_URL;
  test.skip(!db, 'Set E2E_DATABASE_URL to let leaders hear class audio');
  const setting = (on: boolean) =>
    execFileSync('psql', [db!, '-qc', `update tenants set settings = settings || '{"classroomAudioToViewers": ${on}}'::jsonb where slug = 'demo-college'`]);
  setting(true);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const board = await startBoard({ name: `E2E Audio Board ${Date.now() % 100000}`, adminToken: tokens.admin, teacherToken: tokens.teacher, snapshot: [[0, 'L', [[]], 0], ...SAMPLE_INK] });
    boards.push(board);
    await page.goto(`/live/${board.id}`);
    await expect(page.getByTestId('live-board')).toHaveAttribute('data-strokes', '3');
    await expect(page.getByTestId('live-notes')).toContainText("The teacher's mic is off");
    await expect(page.getByTestId('live-audio')).toHaveCount(0);

    await board.setAudio(true);
    const controls = page.getByTestId('live-audio');
    await expect(controls).toContainText("Teacher's mic is on");
    await expect(controls).toHaveAttribute('data-listening', 'false');
    // About 200 ms of the Dart-encoded tone every 200 ms, as the board sends it.
    let seq = 0;
    timer = setInterval(() => board.sendAudio(seq++, audioFixture.chunks[seq % 2].data), 200);
    await controls.getByRole('button', { name: 'Listen' }).click();
    await expect(controls).toHaveAttribute('data-listening', 'true');
    await expect.poll(async () => Number(await controls.getAttribute('data-played')), { timeout: 10_000 }).toBeGreaterThan(5);
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
    await controls.getByRole('button', { name: 'Mute class audio' }).click();
    await expect(controls.getByRole('button', { name: 'Unmute class audio' })).toBeVisible();
    await shot(page, 'live-watch-audio');

    // The teacher turns the mic off: playback stops and the controls go.
    await board.setAudio(false);
    await expect(page.getByTestId('live-audio')).toHaveCount(0);
    await expect(page.getByTestId('live-notes')).toContainText("The teacher's mic is off");

    // On again: Listen needs a click again; then the class ends and audio stops with it.
    await board.setAudio(true);
    await expect(page.getByTestId('live-audio')).toHaveAttribute('data-listening', 'false');
    await board.endClass();
    await expect(page.getByTestId('live-ended')).toContainText('Class ended');
    await expect(page.getByTestId('live-audio')).toHaveCount(0);
  } finally {
    clearInterval(timer);
    setting(false);
  }
});

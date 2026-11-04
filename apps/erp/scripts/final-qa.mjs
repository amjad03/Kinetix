// Final ERP-wide QA sweep: every route under src/app (page.tsx) for each main role, in two passes.
//
// 1. Matrix (fast, every route x role): a server-side request with the role's session. Each cell is ok (200),
//    redirect (to login or the role's home), denied (403/404 page for the role), or an error (5xx, Next error page).
// 2. Browser (Playwright, each route the role may open, at 1280px and 390px): console errors, page errors, failed
//    API/network calls (4xx/5xx), error states, blank pages, sideways scroll, raw i18n keys, links to routes that do
//    not exist.
//
//   ERP_URL=http://localhost:3471 API_URL=http://localhost:4471 OUT=/tmp/final-qa \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/final-qa.mjs
//
// Env: ROLES=admin,principal,hod,teacher,accountant,student,parent  WIDTHS=1280,390  CONCURRENCY=3
//      ONLY=<route substring>  BROWSER=0 (matrix only)  MAX_PAGES=<cap per role for the browser pass>
// Writes OUT/matrix.json, OUT/browser.json and OUT/report.md (the route x role table and the issues).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3471';
const API = process.env.API_URL ?? 'http://localhost:4471';
const OUT = path.resolve(process.env.OUT ?? 'final-qa-out');
const TENANT = process.env.TENANT ?? 'soundarya';
const WIDTHS = (process.env.WIDTHS ?? '1280,390').split(',').map(Number);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const ONLY = process.env.ONLY;
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/app');
const domain = `${TENANT}.demo.zynetix.in`;

const ROLES = {
  admin: `admin@${domain}`,
  principal: `principal@${domain}`,
  hod: `hod.commerce@${domain}`,
  teacher: `deepa.nair@${domain}`,
  accountant: `accounts@${domain}`,
  student: `student.bcom@${domain}`,
  parent: `parent.bcom@${domain}`,
};
const roles = (process.env.ROLES ?? Object.keys(ROLES).join(',')).split(',').filter((r) => ROLES[r]);

/** Every page.tsx under src/app as a route pattern; route groups dropped, private folders and api skipped. */
function patterns(dir = APP, rel = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith('_') || name.startsWith('@') || (rel === '' && name === 'api')) continue;
      const seg = /^\(.*\)$/.test(name) ? '' : name;
      out.push(...patterns(full, seg ? `${rel}/${seg}` : rel));
    } else if (name === 'page.tsx') out.push(rel || '/');
  }
  return out;
}
const ALL = patterns().sort();
const isDynamic = (p) => p.includes('[');
const toRegex = (p) => new RegExp(`^${p.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/?#]+')}$`);
const PUBLIC = /^\/(login|apply|verify|pay|events|recruiters|examiner|disclosure|cast)(\/|$)/;

async function signIn(login) {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: TENANT, login, password: 'zynetix123' }) });
  const b = await r.json().catch(() => ({}));
  if (!b.accessToken) throw new Error(`sign-in failed for ${login} (${r.status})`);
  return b.accessToken;
}

/** One server-side request: what the role gets on the route. */
async function probe(route, token) {
  const t0 = Date.now();
  try {
    const res = await fetch(ERP + route, { headers: { cookie: `kx_session=${token}; kx_lang=en` }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
    const ms = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) return { cell: 'redirect', status: res.status, to: (res.headers.get('location') ?? '').replace(ERP, ''), ms };
    const html = await res.text();
    if (res.status >= 500 || /id="__next_error__"|Application error: a (client|server)-side exception/.test(html)) return { cell: 'error', status: res.status, ms };
    if (/NEXT_REDIRECT/.test(html)) return { cell: 'redirect', status: res.status, to: (html.match(/NEXT_REDIRECT;[a-z]+;([^;"]+)/)?.[1] ?? ''), ms };
    if (res.status === 403 || /NEXT_HTTP_ERROR_FALLBACK;403/.test(html)) return { cell: 'denied', status: 403, ms };
    if (res.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404/.test(html)) return { cell: 'not-found', status: 404, ms };
    return { cell: 'ok', status: res.status, ms, links: [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]) };
  } catch (e) {
    return { cell: 'error', status: 0, detail: String(e.message).slice(0, 120), ms: Date.now() - t0 };
  }
}

const NOISE = /Download the React DevTools|favicon|\[Fast Refresh\]|\[HMR\]|ResizeObserver loop|net::ERR_ABORTED|webpack-hmr|turbopack/i;

/** In the page: sideways scroll, raw i18n keys, blank main, bad values. */
function inPage() {
  const issues = [];
  const add = (check, detail) => issues.push({ check, detail: String(detail).slice(0, 300) });
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) add('h-scroll', `page ${document.documentElement.scrollWidth}px wide in ${vw}px`);
  const main = document.querySelector('main') ?? document.body;
  const text = (main.innerText || '').trim();
  if (text.length < 20 && !main.querySelector('img,svg,canvas,table,form')) add('blank', `main has ${text.length} chars`);
  const keyRe = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+){1,5}$/;
  const fileRe = /\.(demo|local|in|com|org|net|edu|io|pdf|png|jpe?g|csv|xlsx?|json|docx?|zip|txt|svg|mp4)$/i;
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode.textContent.trim();
    if (t.length < 4 || !keyRe.test(t) || fileRe.test(t) || /^\d/.test(t) || seen.has(t)) continue;
    const el = w.currentNode.parentElement;
    if (!el || el.closest('code,pre,script,style,input,textarea,.font-mono') || !el.checkVisibility?.()) continue;
    seen.add(t);
    if (seen.size <= 5) add('i18n-key', t);
  }
  const bad = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/;
  const bw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (bw.nextNode() && n < 3) {
    const t = bw.currentNode.textContent;
    const el = bw.currentNode.parentElement;
    if (!bad.test(t) || !el || el.closest('code,pre,script,style,textarea,.font-mono') || !el.checkVisibility?.()) continue;
    n++;
    add('bad-text', t.trim().slice(0, 80));
  }
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/') && !h.startsWith('//'));
  return { issues, links };
}

async function visit(page, route) {
  const issues = [];
  const consoleErrors = new Set();
  const failed = new Set();
  const onConsole = (m) => m.type() === 'error' && !NOISE.test(m.text()) && consoleErrors.add(m.text().replace(/\s+/g, ' ').slice(0, 220));
  const onPageError = (e) => issues.push({ check: 'page-error', detail: String(e.message).slice(0, 220) });
  const onResponse = (res) => {
    const u = res.url();
    if (res.status() >= 400 && !/favicon|_next\/static|__nextjs/.test(u)) failed.add(`${res.status()} ${res.request().method()} ${u.replace(ERP, '').split('?')[0]}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  let links = [];
  let finalPath = route;
  try {
    const res = await page.goto(ERP + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('main h1').first().waitFor({ timeout: 12000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
    finalPath = new URL(page.url()).pathname;
    if ((res?.status() ?? 0) >= 500) issues.push({ check: 'http', detail: `status ${res.status()}` });
    const html = await page.content();
    if (/id="__next_error__"|Application error: a (client|server)-side exception/.test(html)) issues.push({ check: 'crash', detail: 'Next error page' });
    const es = page.locator('[data-testid=error-state]');
    if (await es.count()) issues.push({ check: 'error-state', detail: (await es.first().innerText()).replace(/\s+/g, ' ').slice(0, 200) });
    const r = await page.evaluate(inPage);
    issues.push(...r.issues);
    links = r.links;
  } catch (e) {
    issues.push({ check: 'navigation', detail: String(e.message).split('\n')[0].slice(0, 200) });
  }
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  // The page's own document request is the matrix's business; keep sub-requests (server actions, API proxies, assets).
  for (const f of [...failed].filter((x) => !x.endsWith(` ${route}`)).slice(0, 4)) issues.push({ check: 'failed-request', detail: f });
  for (const c of [...consoleErrors].slice(0, 3)) issues.push({ check: 'console-error', detail: c });
  return { finalPath, issues, links };
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); }));
}

mkdirSync(OUT, { recursive: true });
const tokens = {};
for (const r of roles) tokens[r] = await signIn(ROLES[r]);

// ---- 1. matrix -------------------------------------------------------------------------------------------------
const staticRoutes = ALL.filter((p) => !isDynamic(p)).filter((p) => !ONLY || p.includes(ONLY));
// MATRIX_FROM=<matrix.json>: reuse an earlier matrix pass and go straight to the browser pass.
const matrix = process.env.MATRIX_FROM ? JSON.parse(readFileSync(process.env.MATRIX_FROM, 'utf8')) : {};
const harvested = new Set();
if (!process.env.MATRIX_FROM) {
// Warm the dev server's compile of each route once (as the first role), then probe all roles.
await pool(staticRoutes, CONCURRENCY, async (route) => {
  for (const role of roles) {
    const r = await probe(route, tokens[role]);
    (matrix[route] ??= {})[role] = r;
    for (const l of r.links ?? []) harvested.add(l);
    delete r.links;
  }
  process.stdout.write(`matrix ${route} ${roles.map((x) => `${x}:${matrix[route][x].cell}`).join(' ')}\n`);
});
// Dynamic routes: fill each pattern with up to two real links seen on the pages.
const dynamicFilled = {};
for (const p of ALL.filter(isDynamic)) {
  const re = toRegex(p);
  dynamicFilled[p] = [...harvested].filter((h) => re.test(h) && !staticRoutes.includes(h)).slice(0, 2);
}
await pool(Object.entries(dynamicFilled).filter(([p]) => !ONLY || p.includes(ONLY)), CONCURRENCY, async ([p, urls]) => {
  if (!urls.length) { matrix[p] = Object.fromEntries(roles.map((r) => [r, { cell: PUBLIC.test(p) ? 'public-no-sample' : 'no-sample' }])); return; }
  for (const role of roles) {
    const r = await probe(urls[0], tokens[role]);
    delete r.links;
    (matrix[p] ??= {})[role] = { ...r, sample: urls[0] };
  }
  process.stdout.write(`matrix ${p} (${urls[0]}) ${roles.map((x) => `${x}:${matrix[p][x].cell}`).join(' ')}\n`);
});
writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(matrix, null, 1));
}

// ---- 2. browser ------------------------------------------------------------------------------------------------
const browserResults = [];
const known = ALL.map((p) => toRegex(p === '/' ? '/' : p));
if (process.env.BROWSER !== '0') {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--disable-dev-shm-usage'] });
  for (const role of roles) {
    let open = Object.entries(matrix)
      .filter(([, cells]) => cells[role]?.cell === 'ok')
      .map(([p, cells]) => cells[role].sample ?? p)
      .slice(0, Number(process.env.MAX_PAGES ?? 1e9));
    // A role the ERP does not serve (it uses its own app): check where it lands, and that the page there works.
    if (!open.length) open = ['/'];
    for (const width of WIDTHS) {
      const ctxs = [];
      await pool(open, CONCURRENCY, async (route) => {
        let ctx = ctxs.pop();
        if (!ctx) {
          ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
          await ctx.addCookies([{ name: 'kx_session', value: tokens[role], url: ERP }, { name: 'kx_lang', value: 'en', url: ERP }]);
        }
        const page = await ctx.newPage();
        const r = await visit(page, route);
        await page.close();
        ctxs.push(ctx);
        const broken = [...new Set(r.links.map((l) => l.split(/[?#]/)[0]))].filter((l) => l !== '/' && !known.some((re) => re.test(l)) && !/^\/(api|_next|auth|shell|lti|language)\//.test(l));
        for (const l of broken.slice(0, 3)) r.issues.push({ check: 'broken-link', detail: l });
        browserResults.push({ role, width, route, finalPath: r.finalPath, issues: r.issues });
        process.stdout.write(`browser ${role} ${width} ${route} ${r.issues.length ? r.issues.map((i) => i.check).join(',') : 'ok'}\n`);
      });
      for (const c of ctxs) await c.close();
    }
  }
  await browser.close();
}
writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(browserResults, null, 1));

// ---- report ------------------------------------------------------------------------------------------------------
const sym = { ok: 'ok', redirect: 'redir', denied: '403', 'not-found': '404', error: 'ERR', 'no-sample': '-', 'public-no-sample': 'pub' };
const issuesBy = new Map();
for (const b of browserResults) for (const i of b.issues) {
  const k = `${b.route}|${b.role}`;
  (issuesBy.get(k) ?? issuesBy.set(k, new Set()).get(k)).add(`${i.check}@${b.width}`);
}
const lines = [`| Route | ${roles.join(' | ')} |`, `|---|${roles.map(() => '---').join('|')}|`];
for (const p of Object.keys(matrix).sort()) {
  const cells = roles.map((r) => {
    const c = matrix[p][r];
    const route = c?.sample ?? p;
    const iss = issuesBy.get(`${route}|${r}`);
    return `${sym[c?.cell] ?? c?.cell ?? '?'}${iss ? ` (${[...iss].join(', ')})` : ''}`;
  });
  lines.push(`| \`${p}\` | ${cells.join(' | ')} |`);
}
const detail = ['', '## Browser issues', ''];
for (const b of browserResults.filter((x) => x.issues.length)) detail.push(`- ${b.role} ${b.width}px \`${b.route}\`: ${b.issues.map((i) => `${i.check}: ${i.detail}`).join('; ')}`);
const counts = {};
for (const b of browserResults) for (const i of b.issues) counts[i.check] = (counts[i.check] ?? 0) + 1;
const errCells = Object.entries(matrix).flatMap(([p, c]) => Object.entries(c).filter(([, v]) => v.cell === 'error').map(([r, v]) => `${r} ${p} ${v.status} ${v.detail ?? ''}`));
writeFileSync(path.join(OUT, 'report.md'), [`# Final QA: ${Object.keys(matrix).length} routes x ${roles.length} roles, ${browserResults.length} browser views`, '', `Issue counts: ${JSON.stringify(counts)}`, '', `Server errors: ${errCells.length}`, ...errCells.map((e) => `- ${e}`), '', ...lines, ...detail].join('\n'));
console.log(`done: ${Object.keys(matrix).length} routes, ${browserResults.length} browser views`, counts, `server errors ${errCells.length}`);

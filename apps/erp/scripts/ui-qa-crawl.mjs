// Visual QA crawler: signs in, opens every page under app/(dashboard) (dynamic [id] routes are filled in
// with real links found on the list pages), and checks each one for layout faults. Saves a full-page
// screenshot per page and a report (report.json, report.txt) into OUT.
//
//   ERP_URL=http://localhost:3199 API_URL=http://localhost:4199 OUT=/tmp/qa \
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/ui-qa-crawl.mjs
//
// Env: MODE=full|roles|kn (default full), WIDTHS=1280,390, ONLY=<route substring>, TENANT, LOGIN.
// Checks: HTTP and page errors, console errors, horizontal overflow, raw i18n keys, toolbar rows whose
// controls do not share a bottom edge or a height, empty states without an icon, dashed boxes without
// an icon, overlapping header items, a truncated page title, oversized stat tiles, unnamed buttons.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ERP = process.env.ERP_URL ?? 'http://localhost:3199';
const API = process.env.API_URL ?? 'http://localhost:4199';
const OUT = path.resolve(process.env.OUT ?? 'qa-out');
const MODE = process.env.MODE ?? 'full';
const WIDTHS = (process.env.WIDTHS ?? '1280,390').split(',').map(Number);
const ONLY = process.env.ONLY;
const TENANT = process.env.TENANT ?? 'soundarya';
const DASH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/app/(dashboard)');

const ROLE_LOGINS = {
  principal: `principal@${TENANT}.demo.kinetix.in`,
  accountant: `accounts@${TENANT}.demo.kinetix.in`,
  librarian: `library@${TENANT}.demo.kinetix.in`,
  // Classroom teachers work in the Teacher App; a head of department is the teaching role that uses the ERP.
  teacher: `hod.commerce@${TENANT}.demo.kinetix.in`,
};

/** Route patterns from the file system: 'students/[id]' etc. Route groups and private folders are dropped. */
function routePatterns(dir = DASH, rel = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith('_') || name.startsWith('@')) continue;
      const seg = /^\(.*\)$/.test(name) ? '' : name;
      out.push(...routePatterns(full, seg ? `${rel}/${seg}` : rel));
    } else if (name === 'page.tsx') out.push(rel || '/');
  }
  return out;
}

const patterns = routePatterns().sort();
const isDynamic = (p) => p.includes('[');
const toRegex = (p) => new RegExp(`^${p.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/?#]+')}$`);
/** How many real values to try for each dynamic pattern: more for a few-valued segment like [kind]. */
const quota = (p) => (/\[(kind|tab|entity|body|report|module)\]$/.test(p) ? 6 : 2);

async function login(ctx, loginId) {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: TENANT, login: loginId, password: 'kinetix123' }) });
  const body = await r.json();
  if (!body.accessToken) throw new Error(`login failed for ${loginId}: ${JSON.stringify(body).slice(0, 200)}`);
  await ctx.addCookies([{ name: 'kx_session', value: body.accessToken, url: ERP }]);
}

/** Runs in the page: every automatic check. Returns { issues: [{ check, detail }], links: [] }. */
function inPageChecks() {
  const issues = [];
  const add = (check, detail) => issues.push({ check, detail: String(detail).slice(0, 700) });
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}` : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls === '.' ? '' : cls}${txt ? ` "${txt}"` : ''}`;
  };
  const main = document.querySelector('main#main') ?? document.body;
  const mainRect = main.getBoundingClientRect();

  // Horizontal overflow of the page, and elements that stick out of the content area unclipped.
  if (document.documentElement.scrollWidth > vw + 1) add('overflow', `page is ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`);
  const scrollsX = (el) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
  const offenders = [];
  for (const el of main.querySelectorAll('*')) {
    if (el.closest('[data-slot=page-header]') && el.tagName === 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || (r.right <= Math.min(mainRect.right, vw) + 1 && r.left >= mainRect.left - 1)) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    let p = el.parentElement;
    let clipped = false;
    while (p && p !== main) {
      if (scrollsX(p)) { clipped = true; break; }
      p = p.parentElement;
    }
    if (clipped || !visible(el)) continue;
    if (offenders.some((o) => o.contains(el))) continue;
    offenders.push(el);
  }
  for (const el of offenders.slice(0, 3)) add('overflow-element', `${desc(el)} left=${Math.round(el.getBoundingClientRect().left)} right=${Math.round(el.getBoundingClientRect().right)} outside ${Math.round(mainRect.left)}..${Math.round(Math.min(mainRect.right, vw))}`);

  // Content spilling out of a visible box (a card, chip or cell with a border or background).
  let spills = 0;
  for (const el of main.querySelectorAll('div,button,a,span,td,li')) {
    if (spills >= 3 || el.clientWidth < 8 || el.scrollWidth <= el.clientWidth + 4) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' || cs.display === 'contents' || cs.display.startsWith('inline') && cs.display !== 'inline-flex' && cs.display !== 'inline-block') continue;
    const boxed = parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
    if (!boxed || !visible(el)) continue;
    let p = el.parentElement;
    let clipped = false;
    while (p && p !== main) { if (scrollsX(p) && p.scrollWidth > p.clientWidth + 1) { clipped = true; break; } p = p.parentElement; }
    if (clipped && el.closest('table')) continue;
    spills++;
    add('content-spill', `${desc(el)} content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
  }

  // Broken values in visible text: "undefined", "NaN", "[object Object]", "Invalid Date".
  const badRe = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/;
  const bw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let bad = 0;
  while (bw.nextNode() && bad < 3) {
    const t = bw.currentNode.textContent;
    const el = bw.currentNode.parentElement;
    if (!badRe.test(t) || !el || el.closest('code,pre,script,style,textarea,.font-mono') || !visible(el)) continue;
    bad++;
    add('bad-text', `${t.trim().slice(0, 80)} in ${desc(el)}`);
  }

  // Raw i18n keys in visible text.
  const keyRe = /^[a-z]+(\.[a-zA-Z0-9-]+)+$/;
  const fileRe = /\.(demo|local|in|com|org|net|edu|io|ac\.in|pdf|png|jpe?g|csv|xlsx?|json|docx?|zip|txt|svg|mp4)$/i;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenKeys = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent.trim();
    if (t.length < 4 || !keyRe.test(t) || fileRe.test(t) || seenKeys.has(t)) continue;
    const el = walker.currentNode.parentElement;
    if (!el || !visible(el) || el.closest('code,pre,script,style,input,textarea,.font-mono')) continue;
    seenKeys.add(t);
    add('i18n-key', t);
  }

  // Toolbar rows: controls in one flex line must share a bottom edge and a height.
  const CTRL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]),select,button,[role=combobox],a[data-slot=button],[data-slot=select-trigger]';
  const isField = (el) => el.matches('input,select,[role=combobox],[data-slot=select-trigger]');
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const seenRows = new Set();
  for (const row of main.querySelectorAll('*')) {
    const cs = getComputedStyle(row);
    if (!cs.display.includes('flex') || cs.flexDirection !== 'row') continue;
    if (row.closest('[role=dialog],[data-slot=table],table,[role=tablist],[role=toolbar][aria-orientation=vertical]')) continue;
    const items = [];
    for (const child of row.children) {
      if (!visible(child) || child.querySelector('h1,h2')) continue; // a title block is not a toolbar control
      let ctrls = (child.matches(CTRL) ? [child] : [...child.querySelectorAll(CTRL)]).filter((c) => visible(c) && !c.closest('[role=tablist]'));
      if (!ctrls.length) continue;
      const fields = ctrls.filter(isField);
      // Buttons drawn inside a field (clear, calendar, eye) are part of the field.
      ctrls = ctrls.filter((c) => isField(c) || !fields.some((f) => overlaps(c.getBoundingClientRect(), f.getBoundingClientRect())));
      // A combobox trigger is often a button wrapping the visible value: keep the outermost control.
      ctrls = ctrls.filter((c) => !ctrls.some((o) => o !== c && o.contains(c)));
      if (ctrls.length > 1) {
        const tops = ctrls.map((c) => c.getBoundingClientRect().top);
        if (Math.max(...tops) - Math.min(...tops) > 2 || ctrls.some(isField)) continue; // a form or a block, not one control
        // A segmented control or button group: its own box (border included) is the control.
        const group = ctrls[0].closest('[role=group],[role=radiogroup]');
        ctrls = group && child.contains(group) && ctrls.every((x) => group.contains(x)) ? [group] : [ctrls.reduce((a, b) => (b.getBoundingClientRect().height > a.getBoundingClientRect().height ? b : a))];
      }
      const c = ctrls[0];
      if (!c) continue;
      const h = c.getBoundingClientRect().height;
      if (c.tagName === 'TEXTAREA' || h < 20 || h > 60) continue;
      items.push({ child, c, r: c.getBoundingClientRect(), cr: child.getBoundingClientRect(), labelled: child !== c && !!child.querySelector('label') });
    }
    if (items.length < 2) continue;
    // Group into wrapped lines by the child boxes.
    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => l.some((o) => it.cr.top < o.cr.bottom - 4 && o.cr.top < it.cr.bottom - 4));
      if (line) line.push(it);
      else lines.push([it]);
    }
    for (const line of lines) {
      if (line.length < 2) continue;
      const bottoms = line.map((i) => i.r.bottom);
      const sig = line.map((i) => desc(i.c)).join(' | ');
      if (seenRows.has(sig)) continue;
      seenRows.add(sig);
      const hasField = line.some((i) => isField(i.c));
      // Same-height controls share a bottom edge; a shorter chip or icon button centres on the input.
      const centres = line.map((i) => (i.r.top + i.r.bottom) / 2);
      const misaligned = hasField && Math.max(...bottoms) - Math.min(...bottoms) > 2 && Math.max(...centres) - Math.min(...centres) > 2;
      if (misaligned) add('toolbar-misaligned', `${line.map((i) => `${desc(i.c)} b=${Math.round(i.r.bottom)}`).join(' | ')}`);
      // Filter chips (under 30px) centred on the tallest control are a different kind of control, not a mismatched button.
      const tall = line.reduce((a, b) => (b.r.height > a.r.height ? b : a));
      const mid = (tall.r.top + tall.r.bottom) / 2;
      const sized = line.filter((i) => i.r.height >= 30 || Math.abs((i.r.top + i.r.bottom) / 2 - mid) > 2).map((i) => i.r.height);
      if (!misaligned && sized.length > 1 && Math.max(...sized) - Math.min(...sized) > 2 && Math.max(...bottoms) - Math.min(...bottoms) <= 30)
        add('unequal-heights', `${line.map((i) => `${desc(i.c)} h=${Math.round(i.r.height)}`).join(' | ')}`);
    }
  }

  // Empty states must show an icon; dashed boxes with only text are hand-rolled empty states.
  for (const el of main.querySelectorAll('[data-slot=empty-state]')) if (visible(el) && !el.querySelector('svg')) add('empty-no-icon', desc(el));
  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.borderTopStyle !== 'dashed' || !visible(el) || el.getBoundingClientRect().height < 8) continue; // a dashed rule (chart line), not a box
    if (el.querySelector('svg,img,canvas,input,button,a,video,table')) continue;
    const txt = el.innerText.trim();
    if (txt.length > 160) continue;
    add('dashed-box-no-icon', desc(el));
  }

  // Page header: the title must not be cut off or overlap the actions.
  const header = main.querySelector('[data-slot=page-header]');
  const h1 = [...main.querySelectorAll('h1')].find(visible);
  if (!h1 && !/\/print$/.test(location.pathname)) add('no-title', 'no visible h1');
  else {
    const r = h1.getBoundingClientRect();
    if (!h1.classList.contains('sr-only') && (h1.scrollWidth > h1.clientWidth + 1 || r.right > vw + 1 || r.left < -1)) add('title-truncated', desc(h1));
    const box = header ?? h1.parentElement?.parentElement;
    if (box) {
      const others = [...box.querySelectorAll('button,a,[role=combobox],input,span,p,div')].filter((e) => visible(e) && !e.contains(h1) && !h1.contains(e) && e.children.length === 0);
      for (const o of others) if (overlaps(o.getBoundingClientRect(), r)) { add('header-overlap', `${desc(h1)} overlaps ${desc(o)}`); break; }
    }
  }
  if (header) {
    const acts = [...header.querySelectorAll(':scope > div:last-child > *')].filter(visible);
    for (let i = 0; i < acts.length; i++) for (let j = i + 1; j < acts.length; j++)
      if (overlaps(acts[i].getBoundingClientRect(), acts[j].getBoundingClientRect())) add('header-overlap', `${desc(acts[i])} overlaps ${desc(acts[j])}`);
  }

  // Stat tiles: one short card per figure, never a tall block. A tile is oversized when it is much taller
  // than the tallest content in its row (empty space), or simply taller than 190px.
  for (const grid of main.querySelectorAll('[data-slot=stat-grid]')) {
    for (const tile of grid.children) {
      if (!visible(tile)) continue;
      const r = tile.getBoundingClientRect();
      const kids = [...tile.querySelectorAll('h3, p, b, [data-trend]')].filter(visible).map((k) => k.getBoundingClientRect());
      const contentBottom = Math.max(r.top, ...kids.map((k) => k.bottom));
      const rowMates = [...grid.children].filter((o) => Math.abs(o.getBoundingClientRect().top - r.top) < 2);
      const rowNeed = Math.max(...rowMates.map((o) => Math.max(o.getBoundingClientRect().top, ...[...o.querySelectorAll('svg, *:not(:has(*))')].filter(visible).map((k) => k.getBoundingClientRect().bottom)) - o.getBoundingClientRect().top));
      if (r.height > 190 || r.height - rowNeed > 40) { add('stat-tile-tall', `${desc(tile)} h=${Math.round(r.height)} content=${Math.round(contentBottom - r.top)}`); break; }
    }
  }

  // Buttons and links need an accessible name.
  const named = (el) => {
    if ((el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby') || (el.getAttribute('title') || '').trim()) return true;
    if (el.innerText && el.innerText.trim()) return true;
    if ([...el.querySelectorAll('img[alt],svg[aria-label],[aria-label]')].some((x) => (x.getAttribute('alt') || x.getAttribute('aria-label') || '').trim())) return true;
    if ([...el.querySelectorAll('.sr-only')].some((x) => x.textContent.trim())) return true;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    if ((el.closest('label')?.innerText || '').trim()) return true;
    return false;
  };
  let unnamed = 0;
  for (const el of document.querySelectorAll('button,[role=button],a[href]')) {
    if (!visible(el) || named(el)) continue;
    if (unnamed++ < 3) add('unnamed-button', `${desc(el)} in ${desc(el.parentElement)}`);
  }

  const links = [...document.querySelectorAll('a[href],[data-href]')].map((a) => a.getAttribute('href') ?? a.getAttribute('data-href')).filter((h) => h && h.startsWith('/'));
  return { issues, links };
}

const NOISE = /Download the React DevTools|favicon|\[Fast Refresh\]|ResizeObserver loop|Failed to load resource|net::ERR_ABORTED/;

async function visit(page, route, file) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); };
  const onError = (e) => pageErrors.push(String(e.message).slice(0, 200));
  const badResponses = [];
  const onResponse = (res) => { const u = res.url(); if (res.status() >= 400 && res.status() !== 401 && !/favicon/.test(u)) badResponses.push(`${res.status()} ${u.replace(ERP, '')}`.slice(0, 200)); };
  page.on('response', onResponse);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const issues = [];
  let links = [];
  let status = 0;
  let finalPath = route;
  try {
    const res = await page.goto(ERP + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = res?.status() ?? 0;
    // Pages poll (notifications, live counts), so network idle may never come: wait for the title, then briefly.
    await page.locator('main h1').first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(300);
    finalPath = new URL(page.url()).pathname;
    if (status >= 400) issues.push({ check: 'http', detail: `status ${status}` });
    const html = await page.content();
    if (/id="__next_error__"|Application error: a (client|server)-side exception/.test(html)) issues.push({ check: 'page-crash', detail: 'Next error page' });
    if (await page.locator('[data-testid=error-state]').count()) issues.push({ check: 'error-state', detail: (await page.locator('[data-testid=error-state]').first().innerText()).replace(/\s+/g, ' ').slice(0, 200) });
    const r = await page.evaluate(inPageChecks);
    issues.push(...r.issues);
    links = r.links;
    if (file) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: file, fullPage: true, clip: h > 7000 ? { x: 0, y: 0, width: page.viewportSize().width, height: 7000 } : undefined, timeout: 30000 }).catch((e) => issues.push({ check: 'screenshot', detail: e.message.slice(0, 120) }));
    }
  } catch (e) {
    issues.push({ check: 'navigation', detail: e.message.slice(0, 200) });
  }
  page.off('console', onConsole);
  page.off('response', onResponse);
  for (const e of [...new Set(badResponses)].filter((x) => !x.endsWith(route)).slice(0, 3)) issues.push({ check: 'failed-request', detail: e });
  page.off('pageerror', onError);
  for (const e of pageErrors) issues.push({ check: 'page-error', detail: e });
  for (const e of [...new Set(consoleErrors)].slice(0, 3)) issues.push({ check: 'console-error', detail: e });
  return { route, finalPath, status, issues, links };
}

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[/?=&]+/g, '__').replace(/[^\w.-]+/g, '-')).slice(0, 120);

async function crawlAll(browser, role, locale, widths, routesOverride) {
  const results = [];
  const ctx = await browser.newContext({ viewport: { width: widths[0], height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('kx.tabs')) localStorage.removeItem(k); } catch {} });
  await ctx.addCookies([{ name: 'kx_lang', value: locale, url: ERP }]);
  await login(ctx, ROLE_LOGINS[role]);
  const page = await ctx.newPage();
  const dir = path.join(OUT, `${role}-${locale}`);
  mkdirSync(dir, { recursive: true });

  // Discover: static routes first, then fill dynamic patterns from the links seen so far.
  const harvested = new Set();
  const visited = new Set();
  const queue = routesOverride ?? patterns.filter((p) => !isDynamic(p)).map((p) => (p === '/' ? '/' : `/${p.replace(/^\//, '')}`));
  const dyn = routesOverride ? [] : patterns.filter(isDynamic).map((p) => ({ p, re: toRegex(`/${p.replace(/^\//, '')}`), done: [] }));
  const plan = [];
  const run = async (route) => {
    if (visited.has(route) || (ONLY && !route.includes(ONLY))) return;
    visited.add(route);
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
      const file = path.join(dir, `${w}-${slug(route)}.png`);
      const r = await visit(page, route, file);
      r.role = role; r.locale = locale; r.width = w; r.shot = path.relative(OUT, file);
      results.push(r);
      for (const l of r.links) harvested.add(l.split(/[?#]/)[0]);
      const n = r.issues.length;
      console.log(`${role} ${locale} ${w} ${route} -> ${r.finalPath} ${r.status} ${n ? `${n} issues: ${[...new Set(r.issues.map((i) => i.check))].join(',')}` : 'ok'}`);
      if (process.env.VERBOSE) for (const i of r.issues) console.log(`   ${i.check}: ${i.detail}`);
      delete r.links;
    }
  };
  // EXTRA: more routes (comma separated), e.g. detail pages that no list links to as an anchor.
  const extra = routesOverride ? [] : (process.env.EXTRA ?? '').split(',').filter(Boolean);
  for (const r of [...queue, ...extra]) await run(r);
  for (const h of extra) harvested.add(h);
  for (let pass = 0; pass < 4 && dyn.length; pass++) {
    let added = 0;
    for (const d of dyn) {
      for (const h of harvested) {
        if (d.done.length >= quota(d.p)) break;
        if (d.re.test(h) && !d.done.includes(h)) { d.done.push(h); if (!visited.has(h)) { plan.push(h); added++; } }
      }
    }
    while (plan.length) await run(plan.shift());
    if (!added) break;
  }
  for (const d of dyn) if (!d.done.length) results.push({ route: `/${d.p}`, role, locale, width: 0, issues: [{ check: 'not-expanded', detail: 'no link to this route found on any page' }] });
  await ctx.close();
  return { results, harvested };
}

/** The menu pages (lib/nav.ts) this role may open: a plain request each, keeping those that neither redirect nor deny. */
async function roleRoutes(_browser, role) {
  const nav = readFileSync(path.resolve(DASH, '../../lib/nav.ts'), 'utf8');
  const hrefs = [...new Set(['/', ...[...nav.matchAll(/href: '(\/[^']*)'/g)].map((m) => m[1])])];
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: TENANT, login: ROLE_LOGINS[role], password: 'kinetix123' }) });
  const token = (await r.json()).accessToken;
  const open = [];
  for (const h of hrefs) {
    const res = await fetch(ERP + h, { headers: { cookie: `kx_session=${token}` }, redirect: 'manual' }).catch(() => null);
    if (!res || res.status !== 200) continue;
    const html = await res.text();
    if (/NEXT_HTTP_ERROR_FALLBACK;40[34]|NEXT_REDIRECT/.test(html)) continue;
    open.push(h);
  }
  return open.slice(0, Number(process.env.ROLE_PAGES ?? 40));
}

const KN_SAMPLE = ['/', '/students', '/attendance', '/fees', '/exams', '/library', '/hostel', '/payroll', '/hr', '/timetable', '/messages', '/conversations', '/reports', '/accreditation', '/documents', '/settings', '/ptm', '/diary', '/admissions', '/placements', '/grievances', '/calendar', '/tasks', '/workflows', '/inventory', '/procurement', '/accounts', '/academics', '/obe', '/research'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--disable-dev-shm-usage'] });
let all = [];
if (MODE === 'full') all = (await crawlAll(browser, 'principal', 'en', WIDTHS)).results;
if (MODE === 'kn') all = (await crawlAll(browser, 'principal', 'kn', [1280, 390], KN_SAMPLE)).results;
if (MODE === 'roles') for (const role of ['accountant', 'librarian', 'teacher']) all.push(...(await crawlAll(browser, role, 'en', [1280], await roleRoutes(browser, role))).results);
await browser.close();

writeFileSync(path.join(OUT, `report-${MODE}.json`), JSON.stringify(all, null, 1));
const byCheck = {};
for (const r of all) for (const i of r.issues) (byCheck[i.check] ??= []).push(`${r.role}/${r.locale}/${r.width} ${r.route}: ${i.detail}`);
const lines = [`${all.length} page views, ${all.filter((r) => r.issues.length).length} with issues`];
for (const [k, v] of Object.entries(byCheck).sort()) lines.push('', `== ${k} (${v.length})`, ...v);
writeFileSync(path.join(OUT, `report-${MODE}.txt`), lines.join('\n'));
console.log(lines.slice(0, 1).join('\n'), Object.fromEntries(Object.entries(byCheck).map(([k, v]) => [k, v.length])));

// Frame-accurate recorder for the ZYNETIX ERP.
// Our own motion (cursor, scrolling, typing, click ripple) is stepped one output frame at a time, so it is perfectly
// smooth at 30 fps whatever the capture speed. App transitions after a click are captured with the page's animation
// timeline slowed down (Animation.setPlaybackRate) and the captured durations scaled back, so CSS transitions stay smooth.
import puppeteer from '../../promo/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

export const ERP = process.env.ERP_URL ?? 'http://localhost:3000';
export const API = process.env.API_URL ?? 'http://localhost:4000';
export const TENANT = 'soundarya';
export const CSS_W = 1440, CSS_H = 810, DSF = 4 / 3, OUT_W = 1920, OUT_H = 1080, FPS = 30;
const RATE = 0.2; // animation playback rate while recording (≈ one capture per 33 ms of animation time)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none', '--disable-features=Translate'],
    defaultViewport: null,
  });
}

export async function token(who) {
  const r = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: TENANT, login: `${who}@soundarya.demo.zynetix.in`, password: 'zynetix123' }) });
  const b = await r.json();
  if (!b.accessToken) throw new Error(`login failed for ${who}: ${JSON.stringify(b).slice(0, 200)}`);
  return b.accessToken;
}

// Injected into every document: cursor, ripple, and CSS that hides anything that looks broken.
const PAGE_SETUP = `(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    const st = document.createElement('style');
    st.id = '__demo_style';
    st.textContent = \`
      nextjs-portal, [data-nextjs-toast], [data-sonner-toast][data-type="error"], #__next-build-watcher { display: none !important; }
      html { scroll-behavior: auto !important; }
      #__demo_cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647; pointer-events: none; will-change: transform; }
      #__demo_ripple { position: fixed; left: 0; top: 0; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; background: rgba(60,60,60,0.22); z-index: 2147483646; pointer-events: none; opacity: 0; }
      *, *::before, *::after { caret-color: auto; }
    \`;
    document.documentElement.appendChild(st);
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.5 L3 17.6 L7.1 13.9 L9.7 19.9 L12.6 18.7 L10.0 12.8 L15.6 12.8 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    c.style.transform = 'translate(' + (window.__cx ?? -100) + 'px,' + (window.__cy ?? -100) + 'px)';
    document.documentElement.appendChild(c);
    const r = document.createElement('div');
    r.id = '__demo_ripple';
    document.documentElement.appendChild(r);
  };
  window.__demoSetCursor = (x, y, s) => { install(); window.__cx = x; window.__cy = y; const c = document.getElementById('__demo_cursor'); c.style.transform = 'translate(' + (x - 3) + 'px,' + (y - 1.5) + 'px) scale(' + (s ?? 1) + ')'; c.style.transformOrigin = '3px 1.5px'; };
  window.__demoRipple = (x, y, p) => { install(); const r = document.getElementById('__demo_ripple'); if (p < 0 || p >= 1) { r.style.opacity = '0'; return; } const sc = 0.3 + 0.9 * p; r.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + sc + ')'; r.style.opacity = String(0.9 * (1 - p)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  new MutationObserver(() => { if (!document.getElementById('__demo_cursor') && document.body) install(); }).observe(document.documentElement, { childList: true });
})();`;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic
const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export class Clip {
  constructor(browser, def) { this.browser = browser; this.def = def; this.frames = []; this.t = 0; this.marks = []; this.rects = []; this.cx = 1100; this.cy = 640; this.inflight = new Set(); }

  async open() {
    this.ctx = await this.browser.createBrowserContext();
    this.page = await this.ctx.newPage();
    const p = this.page;
    await p.setViewport({ width: CSS_W, height: CSS_H, deviceScaleFactor: DSF });
    await p.setCookie({ name: 'kx_session', value: await token(this.def.login), domain: 'localhost', path: '/' },
      { name: 'kx_lang', value: this.def.lang ?? 'en', domain: 'localhost', path: '/' });
    await p.evaluateOnNewDocument(PAGE_SETUP);
    this.client = p._client();
    p.on('request', (r) => { if (!['websocket', 'eventsource'].includes(r.resourceType())) this.inflight.add(r); });
    p.on('requestfinished', (r) => this.inflight.delete(r));
    p.on('requestfailed', (r) => this.inflight.delete(r));
    await this.goto(this.def.route);
  }

  async goto(route) {
    const p = this.page;
    await this.client.send('Animation.setPlaybackRate', { playbackRate: 1 }).catch(() => {});
    await p.goto(ERP + route, { waitUntil: 'networkidle2', timeout: 45000 });
    await p.evaluate(() => document.fonts.ready);
    await this.quiet(8000);
    // Pre-scroll once through the page so lazy sections and in-view chart animations have run before recording.
    const H = await p.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    for (let y = 0; y < H; y += 350) { await p.evaluate((y) => window.scrollTo(0, y), y); await sleep(160); }
    if (H > 0) { await p.evaluate((y) => window.scrollTo(0, y), H); await sleep(900); await this.quiet(5000); await p.evaluate(() => window.scrollTo(0, 0)); }
    await sleep(1200);
    await this.client.send('Animation.enable').catch(() => {});
    await this.client.send('Animation.setPlaybackRate', { playbackRate: RATE });
    await p.evaluate((x, y) => window.__demoSetCursor(x, y), this.cx, this.cy);
    await p.mouse.move(this.cx, this.cy);
  }

  async quiet(maxMs = 6000) { const t0 = Date.now(); while (this.inflight.size && Date.now() - t0 < maxMs) await sleep(100); }

  async shot() { const { data } = await this.client.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true }); return Buffer.from(data, 'base64'); }
  async snap(dur) { const b = await this.shot(); this.frames.push({ buf: b, t: this.t }); this.t += dur; return b; }
  async hold(sec) { await this.snap(sec); }

  // Capture an app transition until the screen is stable and the network is quiet.
  async settle(maxSec = 2.5, minSec = 0.3) {
    let prev = null, same = 0, last = Date.now(); const t0 = this.t;
    for (;;) {
      const b = await this.shot();
      const now = Date.now();
      const dur = Math.min((now - last) / 1000 * RATE, 0.05);
      last = now;
      this.frames.push({ buf: b, t: this.t });
      this.t += Math.max(dur, 1 / FPS);
      if (prev && b.equals(prev)) same++; else same = 0;
      prev = b;
      if (this.t - t0 >= minSec && same >= 3 && this.inflight.size === 0) break;
      if (this.t - t0 >= maxSec) { await this.quiet(4000); await sleep(300); break; }
    }
  }

  mark(label, rect) { this.marks.push({ t: +this.t.toFixed(2), label }); if (rect) this.rects.push({ t: +this.t.toFixed(2), ...rect, label }); }

  // ---- finding elements ----
  async el(sel, text, opts = {}) {
    const p = this.page; const t0 = Date.now();
    for (;;) {
      const h = await p.evaluateHandle((sel, text, nth, exact, outer, closest) => {
        const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        let list = [...document.querySelectorAll(sel)].filter(vis);
        if (text != null) {
          const re = text instanceof RegExp ? text : null;
          list = list.filter((e) => { const t = norm(e.innerText || e.getAttribute('aria-label') || e.value); return exact ? t === text : (typeof text === 'string' ? t.includes(text) : false); });
        }
        if (text != null && !outer) {
          // keep the innermost matches (drop any element that contains another match)
          list = list.filter((e) => !list.some((o) => o !== e && e.contains(o)));
        }
        let e = list[nth ?? 0] ?? null;
        if (e && closest) e = e.closest(closest);
        return e;
      }, sel, typeof text === 'string' ? text : null, opts.nth ?? 0, opts.exact ?? false, opts.outer ?? false, opts.closest ?? null);
      const e = h.asElement();
      if (e) return e;
      if (Date.now() - t0 > (opts.timeout ?? 8000)) throw new Error(`element not found: ${sel} ${text ?? ''}`);
      await sleep(250);
    }
  }
  async rect(e) { const r = await e.evaluate((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }); return r; }
  outRect(r) {
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(CSS_W, r.x + r.w), y1 = Math.min(CSS_H, r.y + r.h);
    return { x: Math.round(x0 * DSF), y: Math.round(y0 * DSF), w: Math.round((x1 - x0) * DSF), h: Math.round((y1 - y0) * DSF) };
  }
  async markEl(label, sel, text, opts = {}) {
    const e = await this.el(sel, text, opts);
    this.mark(label, this.outRect(await this.rect(e)));
    return e;
  }

  // ---- cursor ----
  async moveTo(x, y, dur) {
    const p = this.page; const x0 = this.cx, y0 = this.cy; const dx = x - x0, dy = y - y0; const dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    dur = dur ?? Math.min(0.9, Math.max(0.6, 0.45 + dist / 2400));
    const n = Math.max(2, Math.round(dur * FPS));
    const bend = Math.min(40, dist * 0.08); const nx = -dy / dist, ny = dx / dist;
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n); const arc = Math.sin(Math.PI * k) * bend;
      const cx = x0 + dx * k + nx * arc, cy = y0 + dy * k + ny * arc;
      await p.evaluate((a, b) => window.__demoSetCursor(a, b), cx, cy);
      if (i % 3 === 0 || i === n) await p.mouse.move(cx, cy);
      await this.snap(1 / FPS);
    }
    this.cx = x; this.cy = y;
  }
  async moveToEl(e, ax = 0.5, ay = 0.5) { const r = await this.rect(e); await this.moveTo(r.x + r.w * ax, r.y + r.h * ay); return r; }

  async press() {
    const p = this.page; const { cx, cy } = this;
    for (let i = 0; i < 3; i++) { await p.evaluate((a, b, s, q) => { window.__demoSetCursor(a, b, s); window.__demoRipple(a, b, q); }, cx, cy, 1 - 0.04 * (i + 1), i / 9); await this.snap(1 / FPS); }
    await p.mouse.click(cx, cy);
    for (let i = 3; i < 10; i++) { await p.evaluate((a, b, s, q) => { window.__demoSetCursor(a, b, s); window.__demoRipple(a, b, q); }, cx, cy, i < 6 ? 0.88 + 0.04 * (i - 2) : 1, i / 9); await this.snap(1 / FPS); }
    await p.evaluate((a, b) => { window.__demoSetCursor(a, b, 1); window.__demoRipple(a, b, -1); }, cx, cy);
  }

  // Move to an element (scrolling it into view first if needed), click it, capture the transition.
  async click(e, label, opts = {}) {
    if (typeof e === 'string') e = await this.el(e, opts.text, opts);
    await this.ensureVisible(e);
    const r = await this.moveToEl(e, opts.ax ?? 0.5, opts.ay ?? 0.5);
    await this.snap(opts.pause ?? 0.15);
    await this.press();
    await this.settle(opts.max ?? 2.5);
    if (label) this.mark(label, opts.zoom ? this.outRect(r) : undefined);
    return r;
  }

  async hoverEl(e, label, hold = 1.2) {
    if (typeof e === 'string') e = await this.el(e);
    await this.ensureVisible(e);
    const r = await this.moveToEl(e);
    await this.settle(0.6, 0.1);
    if (label) this.mark(label, this.outRect(r));
    await this.hold(hold);
    return r;
  }

  // ---- scrolling ----
  async scrollInfo(container) {
    return this.page.evaluate((c) => { const s = c ? document.querySelector(c) : document.scrollingElement; return { y: s.scrollTop, max: s.scrollHeight - s.clientHeight }; }, container ?? null);
  }
  async scrollTo(y, dur, container) {
    const p = this.page; const { y: y0, max } = await this.scrollInfo(container); y = Math.max(0, Math.min(max, y)); const d = y - y0;
    if (Math.abs(d) < 2) return;
    dur = dur ?? Math.min(2.0, Math.max(0.9, Math.abs(d) / 600));
    const n = Math.round(dur * FPS);
    for (let i = 1; i <= n; i++) {
      const v = y0 + d * easeSine(i / n);
      await p.evaluate((c, v) => { const s = c ? document.querySelector(c) : document.scrollingElement; s.scrollTop = v; }, container ?? null, v);
      await this.snap(1 / FPS);
    }
    await this.settle(0.8, 0.1);
  }
  async scrollBy(dy, dur, container) { const { y } = await this.scrollInfo(container); await this.scrollTo(y + dy, dur, container); }
  // Bottom edge of sticky/fixed headers at the top of the viewport (content above it is hidden).
  async stickyBottom() {
    return this.page.evaluate(() => {
      let b = 0;
      for (const e of document.querySelectorAll('body *')) {
        const p = getComputedStyle(e).position;
        if (p !== 'sticky' && p !== 'fixed') continue;
        if (e.id && e.id.startsWith('__demo')) continue;
        const r = e.getBoundingClientRect();
        if (r.top < 160 && r.bottom > 0 && r.height < innerHeight / 2 && r.width > innerWidth / 3) b = Math.max(b, r.bottom);
      }
      return b;
    });
  }
  async scrollToEl(e, top = 140, dur, container) {
    if (typeof e === 'string') e = await this.el(e);
    if (!container) { await this.page.evaluate(() => window.scrollBy(0, 1)); top = Math.max(top, (await this.stickyBottom()) + 24); await this.page.evaluate(() => window.scrollBy(0, -1)); }
    const r = await this.rect(e); const { y } = await this.scrollInfo(container);
    await this.scrollTo(y + r.y - top, dur, container);
    return e;
  }
  async ensureVisible(e) {
    const r = await this.rect(e);
    const sb = await this.stickyBottom();
    if (r.y < Math.max(110, sb + 8) || r.y + r.h > CSS_H - 30) {
      const container = await e.evaluate((n) => { let p = n.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) { if (!p.id) p.id = '__scroll_' + Math.random().toString(36).slice(2, 8); return '#' + p.id; } p = p.parentElement; } return null; });
      if (container) {
        const cr = await this.page.$eval(container, (n) => { const b = n.getBoundingClientRect(); return { y: b.y, h: b.height }; });
        const { y } = await this.scrollInfo(container);
        await this.scrollTo(y + (r.y - cr.y) - Math.max(40, cr.h / 3), undefined, container);
      } else {
        const { y } = await this.scrollInfo();
        await this.scrollTo(y + r.y - Math.max(sb + 60, Math.min(300, CSS_H / 3)));
      }
    }
  }

  // Navigate by clicking a visible link to href (sidebar or page); falls back to a hard cut (page.goto).
  async nav(href, label, opts = {}) {
    const e = await this.page.evaluateHandle((href) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 50 && r.y < innerHeight - 20; };
      const all = [...document.querySelectorAll(`a[href="${href}"]`)].filter(vis);
      return all.find((a) => a.closest('main')) ?? all[0] ?? null;
    }, href);
    if (e.asElement()) return this.click(e.asElement(), label, opts);
    await this.goto(href);
    this.mark(`[cut] ${label}`);
  }

  async key(k) { await this.page.keyboard.press(k); await this.settle(1.2, 0.2); }

  async type(text, perChar = 0.07) {
    for (const ch of text) { await this.page.keyboard.type(ch); await this.snap(perChar); }
    await this.settle(1.5, 0.2);
  }

  // ---- output ----
  async encode(outDir) {
    mkdirSync(outDir, { recursive: true });
    const id = this.def.id; const total = this.t;
    const nOut = Math.round(total * FPS);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=${OUT_W}:${OUT_H}:flags=lanczos:out_range=tv:out_color_matrix=bt709,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(FPS), '-g', '60',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-an', `${outDir}/${id}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
    let j = 0;
    const write = (b) => new Promise((res) => (ff.stdin.write(b) ? res() : ff.stdin.once('drain', res)));
    for (let k = 0; k < nOut; k++) {
      const tk = k / FPS + 1e-6;
      while (j + 1 < this.frames.length && this.frames[j + 1].t <= tk) j++;
      await write(this.frames[j].buf);
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res())));
    const meta = { id, title: this.def.title, duration: +(nOut / FPS).toFixed(3), login: `${this.def.login}@soundarya.demo.zynetix.in`, marks: this.marks, rects: this.rects };
    writeFileSync(`${outDir}/${id}.json`, JSON.stringify(meta, null, 2));
    return meta;
  }
  async close() { await this.ctx.close(); }
}

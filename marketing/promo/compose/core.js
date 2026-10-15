// Engine: every picture is a pure function of time t, and every cue comes from a measured phrase start.
const W = 1920, H = 1080, TL = window.TL;
const C = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const L = (a, b, t) => a + (b - a) * t;
const S = (t, a, b) => C((t - a) / (b - a));
const E = {
  io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  lin: t => t,
};
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const $ = (h, parent) => { const d = document.createElement('div'); d.innerHTML = h; const e = d.firstElementChild; if (parent) parent.appendChild(e); return e; };
const css = (e, o) => { for (const k in o) e.style[k] = o[k]; return e; };
const place = (e, x, y, o = {}) => css(e, { left: x + 'px', top: y + 'px', ...o });

const SCENES = {};   // id -> {accent:[r,g,b], chapter, build(cam,f), update(t,f), cams:[[localPhrase,cx,cy,zoom]...]}
const built = {};    // id -> {root,cam,f,ready}

const frame = (w) => new Promise(r => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));

// ---------- 3D viewer (the real Zynetix viewer in an iframe, patched to take per-frame camera commands) ----------
function viewer(parent, model, x, y, w, h, o = {}) {
  // The real viewer runs in an off-screen iframe; its canvas (and label overlay) is copied into a cheap 2D canvas
  // on the page every frame, because compositing a live WebGL iframe is far slower than a drawImage.
  const f = document.createElement('iframe');
  f.src = `/marketing/promo/build/viewer3d/index.html?model=${model}&lang=${o.lang || 'en'}&ch=${model}`;
  css(f, { left: '-9000px', top: '0px', width: w + 'px', height: h + 'px' });
  document.body.appendChild(f);
  const el = $(`<div class="a" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform-origin:50% 50%"><canvas width="${w}" height="${h}" style="position:absolute;left:0;top:0"></canvas><div class="vlab" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden"><svg class="vlines" width="${w}" height="${h}" style="position:absolute;left:0;top:0"></svg><div class="vtxt" style="position:absolute;left:0;top:0"></div></div></div>`, parent);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), svg = el.querySelector('.vlines'), txt = el.querySelector('.vtxt');
  const v = { el, f, loaded: false, last: {} };
  v.ready = new Promise(res => {
    const on = e => { try { const m = JSON.parse(e.data.kx); if (e.source === f.contentWindow && m.event === 'error') console.error('viewer', model, m.message);
      if (e.source === f.contentWindow && m.event === 'loaded') { v.loaded = true; res(); } } catch (_) {} };
    window.addEventListener('message', on);
  });
  v.cmd = c => f.contentWindow.kx.cmd(c);
  v.set = (s) => {
    const l = v.last;
    if (s.az !== undefined && (s.az !== l.az || s.el !== l.el)) {
      const a = s.az * Math.PI / 180, e = (s.el ?? 10) * Math.PI / 180;
      v.cmd({ cmd: 'view', dir: [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], instant: true });
    }
    if (s.explode !== undefined && s.explode !== l.explode) v.cmd({ cmd: 'explode', amount: s.explode });
    if (s.cut !== undefined && JSON.stringify(s.cut || null) !== JSON.stringify(l.cut || null)) v.cmd(s.cut ? { cmd: 'cut', ...s.cut } : { cmd: 'cut', mode: 'off' });
    if (s.labels !== undefined && s.labels !== l.labels) v.cmd({ cmd: 'labels', mode: s.labels });
    if (s.lang !== undefined && s.lang !== l.lang) v.cmd({ cmd: 'lang', lang: s.lang });
    if (s.pick !== undefined && s.pick !== l.pick) v.cmd({ cmd: 'pick', part: s.pick });
    Object.assign(l, s);
  };
  // wait for the viewer to draw, then copy its picture
  v.settle = async () => {
    f.contentWindow.__step();
    const d = f.contentDocument, gl = d.querySelector('#stage canvas');
    ctx.clearRect(0, 0, w, h); ctx.drawImage(gl, 0, 0, w, h);
    svg.innerHTML = v.last.labels && v.last.labels !== 'none' ? d.getElementById('lines').innerHTML : '';
    txt.innerHTML = d.getElementById('labels').innerHTML;
  };
  v.hide = on => { f.style.visibility = on ? 'hidden' : 'visible'; };
  return v;
}

// ---------- background: aurora + stars, tinted per scene ----------
const bg = document.getElementById('bg').getContext('2d');
const R = rng(11);
const stars = Array.from({ length: 160 }, () => ({ x: R() * W, y: R() * H, z: .3 + R() * 1.2, p: R() * 6.28 }));
function accentAt(t) {
  let a = [139, 92, 246], b = a, k = 0;
  const sc = TL.scenes;
  for (let i = 0; i < sc.length; i++) if (t >= sc[i].start) { a = SCENES[sc[i].id].accent; b = (SCENES[sc[i + 1]?.id] || SCENES[sc[i].id]).accent; k = S(t, sc[i].end - .8, sc[i].end); }
  return a.map((v, i) => L(v, b[i], E.io(k)));
}
let beatT = -9;
function drawBg(t) {
  const g = bg, ac = accentAt(t), pulse = Math.exp(-(t - beatT) * 5);
  g.fillStyle = '#06040f'; g.fillRect(0, 0, W, H);
  const blobs = [[.25, .3, ac, .42], [.78, .62, [34, 211, 238], .24], [.5, 1.0, [232, 121, 249], .22]];
  blobs.forEach(([bx, by, c, a], i) => {
    const x = (bx + .09 * Math.sin(t * .23 + i * 2)) * W, y = (by + .09 * Math.cos(t * .19 + i)) * H, r = 900 + 80 * Math.sin(t * .4 + i) + pulse * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${c.map(Math.round)},${a + pulse * .12})`); gr.addColorStop(1, `rgba(${c.map(Math.round)},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  g.fillStyle = '#fff';
  for (const s of stars) {
    const x = (s.x - t * 14 * s.z + W * 4) % W, tw = .35 + .65 * Math.abs(Math.sin(t * .8 + s.p));
    g.globalAlpha = .55 * tw * s.z / 1.5; g.beginPath(); g.arc(x, s.y, 1.2 * s.z, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(W / 2, H / 2, 400, W / 2, H / 2, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ---------- HUD: keyword pop, karaoke captions, ring pulse, chapters ----------
const hud = { kw: document.getElementById('kw'), cap: document.getElementById('cap'), ring: document.getElementById('ring'), prog: document.getElementById('prog'), chap: document.getElementById('chap') };
const CH = ['3D', 'LABS', 'SIMS', 'AI', 'BOARD', 'ERP', 'APPS'];
CH.forEach(c => { const b = document.createElement('b'); b.textContent = c; hud.chap.appendChild(b); });
const CHMAP = { models: 0, labs: 1, sims: 2, ai: 3, board: 4, offline: 4, erp: 5, apps: 6 };
let lastPh = -1;
function drawHud(t) {
  const P = TL.phrases;
  let cur = -1; for (let i = 0; i < P.length; i++) if (t >= P[i].t0 - .02) cur = i;
  const ph = cur >= 0 ? P[cur] : null;
  if (ph) beatT = ph.t0;
  // keyword: lands exactly on the phrase start
  if (ph && ph.kw) {
    const k = t - ph.t0, pop = E.back(S(k, 0, .32));
    hud.kw.textContent = ph.kw; hud.kw.style.display = 'block';
    css(hud.kw, { opacity: C(k / .08) * (1 - S(k, ph.t1 - ph.t0 + .5, ph.t1 - ph.t0 + .9)), transform: `scale(${L(1.45, 1, pop)}) translateX(${L(-60, 0, E.out(S(k, 0, .3)))}px)`, filter: `drop-shadow(0 6px 30px rgba(139,92,246,.55)) blur(${(1 - S(k, 0, .2)) * 10}px)` });
  } else hud.kw.style.display = 'none';
  // karaoke captions: current word lights up as it is spoken
  if (ph && t < ph.t1 + .35) {
    if (lastPh !== cur) { hud.cap.innerHTML = ph.words.map(w => `<span>${w[0]}</span>`).join(' '); lastPh = cur; }
    [...hud.cap.children].forEach((s, i) => {
      const w = ph.words[i], on = S(t, w[1], w[1] + .12), done = t > w[2];
      s.style.opacity = t < w[1] ? .45 : 1; s.style.color = on > 0 && !done ? '#67E8F9' : '#fff';
      s.style.transform = on > 0 && !done ? 'scale(1.1)' : 'scale(1)';
    });
    hud.cap.style.opacity = 1 - S(t, ph.t1 + .1, ph.t1 + .35);
  } else { hud.cap.style.opacity = 0; }
  // ring pulse on every phrase start (the "beat")
  if (ph) { const k = S(t, ph.t0, ph.t0 + .7); css(hud.ring, { left: 960 - L(40, 1100, E.out(k)) + 'px', top: 540 - L(40, 1100, E.out(k)) + 'px', width: L(80, 2200, E.out(k)) + 'px', height: L(80, 2200, E.out(k)) + 'px', opacity: (1 - k) * .35 }); }
  hud.prog.style.width = (t / TL.duration * 100) + '%';
  const sc = TL.scenes.find(s => t >= s.start && t <= s.end), ci = sc ? CHMAP[sc.id] : undefined;
  [...hud.chap.children].forEach((b, i) => b.classList.toggle('on', i === ci));
  const early = sc && ['heart', 'brain', 'space', 'taj'].includes(sc.id);
  document.getElementById('brand').style.opacity = early ? 0 : 1;
  hud.chap.style.opacity = early || (sc && ['logo', 'close'].includes(sc.id)) ? 0 : 1;
}

// ---------- scene lifecycle ----------
function fOf(sc) { const ph = TL.phrases.slice(sc.p0, sc.p1 + 1); return { sc, ph, t0: i => ph[i].t0, t1: i => ph[i].t1, n: ph.length }; }
async function ensure(sc) {
  if (built[sc.id]) return built[sc.id];
  const root = document.createElement('div'); root.className = 'scene'; root.style.visibility = 'hidden';
  const cam = document.createElement('div'); cam.className = 'cam'; root.appendChild(cam);
  document.getElementById('stage').appendChild(root);
  const f = fOf(sc), b = built[sc.id] = { root, cam, f, sc, ready: Promise.resolve() };
  b.ready = Promise.resolve(SCENES[sc.id].build(cam, f, b));
  return b;
}
function camOf(b, t) {
  const f = b.f, ks = SCENES[b.sc.id].cams || [[0, 960, 540, 1]];
  let z = ks[0][3], cx = ks[0][1], cy = ks[0][2];
  for (let i = 1; i < ks.length; i++) {
    const t0 = f.ph[ks[i][0]].t0, k = E.io(S(t, t0, t0 + .9));
    if (t >= t0) { const p = ks[i - 1]; z = L(p[3], ks[i][3], k); cx = L(p[1], ks[i][1], k); cy = L(p[2], ks[i][2], k); }
  }
  const drift = 1 + .018 * S(t, b.sc.start, b.sc.end);
  let punch = 0; for (const p of f.ph) if (t >= p.t0) punch = Math.max(punch, .022 * Math.exp(-(t - p.t0) * 7)); // tiny zoom-punch on each spoken phrase
  z *= drift * (1 + punch);
  return `translate(${W / 2 - cx * z}px,${H / 2 - cy * z}px) scale(${z})`;
}
async function renderAt(t) {
  const todo = [];
  for (const sc of TL.scenes) {
    const near = t >= sc.start - .9 && t <= sc.end + .4;
    if (near) todo.push(ensure(sc)); else if (built[sc.id]) { built[sc.id].root.remove(); delete built[sc.id]; }
  }
  const bs = await Promise.all(todo);
  await Promise.all(bs.map(b => b.ready));
  bs.forEach(b => b.v && b.v.hide(false));
  const waits = [];
  for (const b of bs) {
    const on = t >= b.sc.start && t <= b.sc.end;
    b.root.style.display = 'block'; b.root.style.visibility = on ? 'visible' : 'hidden';
    
    if (!on) continue;
    const k = S(t, b.sc.start, b.sc.start + .35), o = 1 - S(t, b.sc.end - .2, b.sc.end);
    b.root.style.opacity = Math.min(b.sc.start === 0 ? 1 : E.out(k), o);
    b.cam.style.transform = camOf(b, t);
    const r = SCENES[b.sc.id].update(t, b.f, b); if (r) waits.push(r);
  }
  drawBg(t); drawHud(t);
  await Promise.all(waits);
  bs.forEach(b => b.v && b.v.hide(true));
}
window.renderAt = renderAt;

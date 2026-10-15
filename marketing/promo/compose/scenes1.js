// ---- 3D hook scenes (the real viewer) ----
function glow(cam, x, y, r, c, a = .5) { return $(`<div class="a" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:radial-gradient(circle,rgba(${c},${a}),rgba(${c},0) 68%)"></div>`, cam); }
function chip(cam, x, y, ic, txt, c) { return $(`<div class="glass" style="left:${x}px;top:${y}px;padding:16px 30px;border-radius:999px;display:flex;gap:14px;align-items:center;font-size:34px;font-weight:600;border-color:${c}88;box-shadow:0 0 40px ${c}44"><span style="font-size:38px">${ic}</span>${txt}</div>`, cam); }

SCENES.heart = {
  accent: [232, 80, 120],
  build(cam, f, b) {
    b.g = glow(cam, 1110, 540, 560, '232,80,140', .55);
    b.v = viewer(cam, 'heart', 560, 30, 1100, 1000);
    b.c = [chip(cam, 1500, 330, '↻', 'Rotate', '#22D3EE'), chip(cam, 1500, 450, '✂', 'Slice', '#E879F9'), chip(cam, 1500, 570, '✸', 'Take apart', '#A3E635')];
    return b.v.ready;
  },
  update(t, f, b) {
    const [t0, t1, t2, t3] = [0, 1, 2, 3].map(i => f.t0(i)), tEnd = f.sc.end;
    const hb = 1 + .03 * Math.pow(Math.max(0, Math.sin(t * 7.5)), 6);
    let az = -40 + 14 * (t - 0);
    if (t >= t1) az = -40 + 14 * t1 + 360 * E.io(S(t, t1, t2));
    if (t >= t2) az = -40 + 14 * t1 + 360 + 8 * (t - t2) - 8 * (t - t2) * 0; // hold near front for the cut
    const front = ((-40 + 14 * t1) % 360 + 360) % 360;
    const cutOn = t >= t2 && t < t3;
    const ex = t >= t3 ? E.io(S(t, t3 + .1, tEnd - .3)) * .95 : 0;
    const view = t < t1 ? az : t < t2 ? az : (cutOn ? 0 + 25 * S(t, t2, t3) : 30 + 40 * S(t, t3, tEnd));
    b.v.set({ az: view, el: t < t2 ? 12 : 8, explode: ex, cut: cutOn ? { mode: 'half', axis: 'z', at: 0, flip: false } : null, labels: 'none' });
    const k = E.out(S(t, 0, 1.0));
    css(b.v.el, { opacity: C(k * 1.5), transform: `scale(${L(.55, 1, k) * (t < t2 ? hb : 1)})` });
    b.g.style.opacity = .55 + .45 * Math.sin(t * 7.5) ** 6 * (t < t2 ? 1 : .3);
    b.c.forEach((c, i) => appear(c, t, f.t0(i + 1) + .05, { dx: 80, dy: 0 }));
    return b.v.settle();
  },
  cams: [[0, 960, 540, 1], [1, 1000, 540, 1.1], [2, 1060, 520, 1.25], [3, 1010, 540, .95]],
};

function orbit3d(id, o) {
  return {
    accent: o.accent,
    build(cam, f, b) {
      b.g = glow(cam, 1110, 540, 600, o.glow, .5);
      b.v = viewer(cam, id, 480, 20, 1200, 1020);
      b.card = $(`<div class="glass" style="left:1290px;top:760px;width:520px;padding:26px 32px"><div style="font-size:22px;letter-spacing:.2em;color:${o.col};font-weight:700">${o.tag}</div><div class="dsp" style="font-size:44px;margin:6px 0 4px">${o.title}</div><div style="font-size:26px;color:#B8B0E8">${o.sub}</div></div>`, cam);
      return b.v.ready;
    },
    update(t, f, b) {
      const k = t - f.t0(0), e = E.out(S(k, 0, .5));
      b.v.set({ az: o.az + 95 * k, el: o.el, explode: 0, labels: 'none' });
      css(b.v.el, { opacity: C(e * 2), transform: `scale(${L(1.35, 1, e)})` });
      appear(b.card, t, f.t0(0) + .3, { dx: 60, dy: 0 });
      return b.v.settle();
    },
  };
}
SCENES.brain = orbit3d('brain', { accent: [139, 92, 246], glow: '139,92,246', col: '#C4B5FD', tag: 'HUMAN BRAIN', title: 'Brain', sub: '18 parts to explore', az: 20, el: 14 });
SCENES.space = orbit3d('solar_system', { accent: [34, 211, 238], glow: '34,211,238', col: '#67E8F9', tag: 'SPACE', title: 'Solar System', sub: 'Sun, 8 planets, asteroids', az: 0, el: 38 });
SCENES.taj = orbit3d('taj_mahal', { accent: [251, 191, 36], glow: '251,191,36', col: '#FCD34D', tag: 'HERITAGE', title: 'Taj Mahal', sub: 'Walk around it, look inside', az: 25, el: 16 });

// ---- logo reveal ----
SCENES.logo = {
  accent: [139, 92, 246],
  build(cam, f, b) {
    b.g = glow(cam, 960, 470, 700, '139,92,246', .6);
    b.mark = $(`<svg class="a" width="260" height="260" viewBox="0 0 54 54" style="left:830px;top:200px"><rect width="54" height="54" rx="15" fill="url(#lg)"/><path d="M15 15h24L21 39h18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, cam);
    b.word = $(`<div class="a dsp" style="left:0;width:1920px;top:520px;text-align:center;font-size:190px;letter-spacing:.14em;white-space:nowrap">${'ZYNETIX'.split('').map(c => `<span style="display:inline-block">${c}</span>`).join('')}</div>`, cam);
    b.tag = $(`<div class="a dsp grad" style="left:0;width:1920px;top:760px;text-align:center;font-size:72px"></div>`, cam);
    const R2 = rng(5); b.sp = Array.from({ length: 36 }, () => ({ e: $(`<div class="a" style="width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 18px #8B5CF6"></div>`, cam), a: R2() * 6.28, r: 300 + R2() * 700, s: .5 + R2() }));
    const imgs = ['brain', 'bohr_atom', 'beaker', 'abacus', 'books', 'circulatory', 'computer_parts', 'compass_rose'];
    b.ring = imgs.map((n, i) => ({ e: $(`<div class="glass" style="width:120px;height:120px;border-radius:30px;overflow:hidden;background:#fff"><img src="${LIB(n)}" style="width:100%;height:100%;object-fit:contain"></div>`, cam), a: i / imgs.length * 6.28 }));
  },
  update(t, f, b) {
    const t0 = f.t0(0), t1 = f.t0(1);
    const k = E.back(S(t, t0 - .1, t0 + .7));
    css(b.mark, { opacity: C(k * 3), transform: `scale(${L(.1, 1, k)}) rotate(${L(-200, 0, E.out(S(t, t0 - .1, t0 + .8)))}deg)`, left: L(830, 830, 1) + 'px', top: L(200, 200 - 30 * S(t, t1, t1 + 1), 1) + 'px' });
    const ws = [...b.word.children]; ws.forEach((s, i) => { const kk = E.out(S(t, t0 + .12 + i * .06, t0 + .55 + i * .06)); s.style.opacity = kk; s.style.transform = `translateY(${(1 - kk) * 80}px) scale(${L(1.3, 1, kk)})`; s.style.filter = `blur(${(1 - kk) * 12}px)`; });
    b.word.style.top = L(520, 480, E.io(S(t, t1, t1 + .8))) + 'px';
    b.tag.innerHTML = f.ph[1].words.map(w => `<span style="opacity:${S(t, w[1], w[1] + .2)}">${w[0]}</span>`).join(' ');
    b.tag.style.top = '760px';
    b.sp.forEach((s, i) => { const k2 = S(t, t0, t0 + 1.8), r = s.r * E.out(k2), a = s.a + t * .15 * s.s; css(s.e, { left: 950 + Math.cos(a) * r + 'px', top: 470 + Math.sin(a) * r * .55 + 'px', opacity: (1 - k2) * .9 + .1 * Math.sin(t * 3 + i) ** 2, transform: `scale(${s.s})` }); });
    b.ring.forEach((r, i) => { const k3 = E.out(S(t, t1 + i * .05, t1 + .8 + i * .05)), a = r.a + t * .35, rx = 780, ry = 300; css(r.e, { opacity: k3, left: 960 - 60 + Math.cos(a) * rx * k3 + 'px', top: 470 - 60 + Math.sin(a) * ry * k3 + 'px', transform: `scale(${(.7 + .3 * (Math.sin(a) + 1) / 2) * k3}) rotate(${Math.sin(a) * 8}deg)`, zIndex: Math.sin(a) > 0 ? 3 : 0 }); });
    b.g.style.opacity = .6 + .4 * Math.exp(-(t - t0) * 2);
  },
  cams: [[0, 960, 540, 1.35], [1, 960, 500, 1]],
};

// ---- models: 46 thumbnails, then labels in 3 languages ----
SCENES.models = {
  accent: [34, 211, 238],
  build(cam, f, b) {
    b.grid = MODEL_IDS.map((id, i) => ({ e: $(`<div class="glass" style="width:150px;height:104px;border-radius:18px;overflow:hidden;background:#0d0a22"><img src="${THUMB(id)}" style="width:100%;height:100%;object-fit:cover"></div>`, cam), i }));
    b.big = $(`<div class="a dsp grad" style="left:96px;top:300px;font-size:300px;line-height:1">0</div>`, cam);
    b.sub = $(`<div class="a" style="left:104px;top:600px;font-size:38px;color:#B8B0E8;font-weight:500">real, rotatable,<br>cut-able models</div>`, cam);
    b.g = glow(cam, 1030, 540, 560, '34,211,238', .4);
    b.v = viewer(cam, 'heart', 330, 30, 1400, 1000);
    return b.v.ready;
  },
  update(t, f, b) {
    const t0 = f.t0(0), t1 = f.t0(1), t2 = f.t0(2), t3 = f.t0(3), t4 = f.t0(4);
    b.grid.forEach(({ e, i }) => {
      const c = i % 8, r = Math.floor(i / 8), k = E.back(S(t, t0 + .1 + i * .035, t0 + .55 + i * .035)), out = E.io(S(t, t1 - .15, t1 + .45));
      css(e, { left: 560 + c * 162 + L(0, 500, out * (c - 3.5) / 3.5) + 'px', top: 200 + r * 114 + L(0, -80, out) + 'px', opacity: C(k * 2) * (1 - out), transform: `scale(${L(.3, 1, k) * (1 - .4 * out)}) rotate(${(1 - k) * (i % 2 ? 12 : -12)}deg)` });
    });
    const n = Math.round(46 * E.out(S(t, t0 + .05, t0 + 1.6)));
    b.big.textContent = n; css(b.big, { opacity: 1 - E.io(S(t, t1 - .1, t1 + .4)), transform: `scale(${1 + .06 * Math.sin(t * 9) * (1 - S(t, t0 + 1.6, t0 + 2))})` });
    css(b.sub, { opacity: 1 - E.io(S(t, t1 - .1, t1 + .4)) });
    const vk = E.out(S(t, t1 - .1, t1 + .6));
    css(b.v.el, { opacity: vk, transform: `scale(${L(.6, 1, vk)})` });
    b.g.style.opacity = vk * .8;
    const lang = t >= t4 ? 'kn' : t >= t3 ? 'hi' : 'en';
    b.v.set({ az: -20 + 12 * (t - t1), el: 10, explode: 0, lang, labels: t >= t2 ? 'all' : 'picked', pick: t >= t1 + .7 && t < t2 ? 'left_ventricle' : null });
    return b.v.settle();
  },
  cams: [[0, 960, 540, 1], [1, 1010, 540, 1], [2, 1030, 540, 1.12], [4, 1000, 540, 1.04]],
};

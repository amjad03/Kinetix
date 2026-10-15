// ---- virtual labs (drawn live from the same equations the Board labs use) ----
const LAB = { w: 1200, h: 554 };
function labPendulum(g, k, p) {   // p: {g, name, sky, ground, col}
  const w = LAB.w, h = LAB.h, Lm = 1.0, om = Math.sqrt(p.g / Lm), th = 0.5 * Math.cos(om * k), px = 600, py = 70, len = 360;
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, p.sky[0]); sky.addColorStop(1, p.sky[1]); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = p.ground; g.beginPath(); g.moveTo(0, h - 70); for (let x = 0; x <= w; x += 20) g.lineTo(x, h - 70 - 14 * Math.sin(x * .013 + p.g)); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + len + 40); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, len, Math.PI / 2 - .5, Math.PI / 2 + .5); g.stroke();
  const bx = px + Math.sin(th) * len, by = py + Math.cos(th) * len;
  g.strokeStyle = '#E5E7FF'; g.lineWidth = 3; g.beginPath(); g.moveTo(px, py); g.lineTo(bx, by); g.stroke();
  const gr = g.createRadialGradient(bx - 8, by - 8, 4, bx, by, 34); gr.addColorStop(0, '#fff'); gr.addColorStop(1, p.col); g.fillStyle = gr; g.shadowColor = p.col; g.shadowBlur = 30; g.beginPath(); g.arc(bx, by, 32, 0, 7); g.fill(); g.shadowBlur = 0;
  g.fillStyle = '#333'; g.fillRect(px - 70, py - 18, 140, 12);
  const T = 2 * Math.PI / om;
  g.fillStyle = 'rgba(8,6,24,.72)'; g.fillRect(40, 40, 360, 150); g.fillStyle = p.col; g.font = '700 30px Flex'; g.fillText(p.name, 64, 86);
  g.fillStyle = '#fff'; g.font = '500 26px Flex'; g.fillText(`gravity  g = ${p.g} m/s²`, 64, 126); g.fillText(`one swing  T = ${T.toFixed(2)} s`, 64, 164);
  g.fillStyle = 'rgba(8,6,24,.72)'; g.fillRect(w - 330, 40, 290, 110); g.fillStyle = '#B8B0E8'; g.font = '600 22px Flex'; g.fillText('STOPWATCH', w - 306, 76); g.fillStyle = '#fff'; g.font = '700 46px Mono'; g.fillText(k.toFixed(2) + ' s', w - 306, 128);
}
function labLens(g, k) {
  const w = LAB.w, h = LAB.h, cx = 600, cy = 300, f = 150;
  g.fillStyle = '#0c0a26'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, cy); g.lineTo(w - 20, cy); g.stroke();
  const u = L(470, 250, E.io(C(k / 3.2))), hO = 90, v = 1 / (1 / f - 1 / u), hI = -hO * v / u;
  g.fillStyle = 'rgba(103,232,249,.22)'; g.strokeStyle = '#67E8F9'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, 26, 200, 0, 0, 7); g.fill(); g.stroke();
  [[-f, 'F'], [f, 'F'], [-2 * f, '2F'], [2 * f, '2F']].forEach(([d, t]) => { g.fillStyle = '#B8B0E8'; g.beginPath(); g.arc(cx + d, cy, 5, 0, 7); g.fill(); g.font = '600 24px Flex'; g.fillText(t, cx + d - 10, cy + 34); });
  const ox = cx - u, oy = cy - hO, ix = cx + v, iy = cy - hI;
  const arrow = (x, y1, y2, c) => { g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke(); const s = y2 < y1 ? 1 : -1; g.beginPath(); g.moveTo(x - 12, y2 + s * 18); g.lineTo(x, y2); g.lineTo(x + 12, y2 + s * 18); g.fill(); };
  arrow(ox, cy, oy, '#FBBF24'); arrow(ix, cy, iy, '#A3E635');
  const ray = (pts, c) => { g.strokeStyle = c; g.lineWidth = 3; g.shadowColor = c; g.shadowBlur = 12; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke(); g.shadowBlur = 0; };
  const rp = S(k, .3, 1.8);
  const seg = (a, b, c) => ray([a, [L(a[0], b[0], rp), L(a[1], b[1], rp)]], c);
  seg([ox, oy], [cx, oy], '#22D3EE'); if (rp > 0) { const ex = ix + 60, ey = iy + (iy - oy) / (ix - cx) * 0; }
  if (rp >= 1) { ray([[cx, oy], [ix, iy]], '#22D3EE'); ray([[ix, iy], [ix + 150, iy + (iy - oy) / (ix - cx) * 150 * 0 + (iy - oy) / (ix - cx) * 150]], 'rgba(34,211,238,.4)'); }
  seg([ox, oy], [ix, iy], '#E879F9');
  g.fillStyle = 'rgba(8,6,24,.78)'; g.fillRect(40, 40, 470, 160); g.fillStyle = '#fff'; g.font = '700 30px Flex'; g.fillText('Convex lens', 64, 86);
  g.font = '500 26px Flex'; g.fillStyle = '#B8B0E8'; g.fillText(`object ${Math.round(u)} px   image ${Math.round(v)} px`, 64, 126); g.fillStyle = '#A3E635'; g.fillText(`real, upside-down, ${Math.abs(hI / hO).toFixed(1)}× size`, 64, 166);
}
function labCircuit(g, k) {
  const w = LAB.w, h = LAB.h; g.fillStyle = '#0c0a26'; g.fillRect(0, 0, w, h);
  const V = 1 + 8 * S(k, .2, 4.2), R = 3, I = V / R;
  const x0 = 120, x1 = 640, y0 = 120, y1 = 440;
  g.strokeStyle = '#8B83C9'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.stroke();
  g.fillStyle = '#0c0a26'; g.fillRect(x0 - 40, 230, 80, 100);   // battery
  g.strokeStyle = '#FBBF24'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0 - 36, 262); g.lineTo(x0 + 36, 262); g.moveTo(x0 - 18, 296); g.lineTo(x0 + 18, 296); g.stroke();
  g.fillStyle = '#FBBF24'; g.font = '700 26px Flex'; g.fillText(V.toFixed(1) + ' V', x0 + 54, 290);
  g.fillStyle = '#0c0a26'; g.fillRect(310, y0 - 28, 160, 56); g.strokeStyle = '#22D3EE'; g.lineWidth = 6; g.beginPath(); g.moveTo(300, y0); [[318, -22], [340, 22], [362, -22], [384, 22], [406, -22], [428, 22], [450, 0]].forEach(([x, d]) => g.lineTo(x + 8, y0 + d)); g.lineTo(480, y0); g.stroke();
  g.fillStyle = '#22D3EE'; g.fillText('R = 3 Ω', 340, y0 - 40);
  g.fillStyle = '#0c0a26'; g.beginPath(); g.arc(x1, 280, 46, 0, 7); g.fill(); g.strokeStyle = '#A3E635'; g.beginPath(); g.arc(x1, 280, 42, 0, 7); g.stroke(); g.fillStyle = '#A3E635'; g.font = '700 30px Flex'; g.fillText('A', x1 - 10, 292); g.font = '600 24px Flex'; g.fillText(I.toFixed(2) + ' A', x1 + 56, 288);
  // moving charges: speed follows current
  const per = 2 * ((x1 - x0) + (y1 - y0)), ph = (k * 40 * I) % per;
  for (let i = 0; i < 28; i++) { let d = (ph + i * per / 28) % per, x, y; const wd = x1 - x0, ht = y1 - y0;
    if (d < wd) { x = x0 + d; y = y0; } else if ((d -= wd) < ht) { x = x1; y = y0 + d; } else if ((d -= ht) < wd) { x = x1 - d; y = y1; } else { d -= wd; x = x0; y = y1 - d; }
    g.fillStyle = '#fff'; g.shadowColor = '#22D3EE'; g.shadowBlur = 14; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.shadowBlur = 0; }
  // V–I graph builds as the voltage rises
  const gx = 780, gy = 80, gw = 360, gh = 360; g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(gx, gy, gw, gh);
  g.strokeStyle = '#8B83C9'; g.lineWidth = 3; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx, gy + gh); g.lineTo(gx + gw, gy + gh); g.stroke();
  g.fillStyle = '#B8B0E8'; g.font = '600 22px Flex'; g.fillText('current I', gx + 8, gy + 24); g.fillText('voltage V', gx + gw - 110, gy + gh + 30);
  g.strokeStyle = '#E879F9'; g.lineWidth = 5; g.shadowColor = '#E879F9'; g.shadowBlur = 14; g.beginPath(); g.moveTo(gx, gy + gh);
  const vx = gx + (V - 1) / 8 * gw * .92, vy = gy + gh - (I - 1 / R) / (3 - 1 / R) * gh * .92; g.lineTo(vx, vy); g.stroke(); g.shadowBlur = 0;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(vx, vy, 9, 0, 7); g.fill();
  g.fillStyle = '#FBBF24'; g.font = '700 34px Flex'; g.fillText('V = I × R', gx + 90, gy + gh + 74);
}
function labBreak(g, k) {
  const w = LAB.w, h = LAB.h; g.fillStyle = '#0c0a26'; g.fillRect(0, 0, w, h);
  const ox = 140, oy = 480, sx = 900 / 700, sy = 380 / 70000, P = 100, Vc = 60, F = 16000, q = 700 * E.io(S(k, .2, 3.2));
  g.strokeStyle = '#8B83C9'; g.lineWidth = 3; g.beginPath(); g.moveTo(ox, 60); g.lineTo(ox, oy); g.lineTo(ox + 920, oy); g.stroke();
  const X = n => ox + n * sx, Y = v => oy - v * sy, cost = n => F + Vc * n, rev = n => P * n;
  // loss / profit areas
  const bep = F / (P - Vc);
  g.fillStyle = 'rgba(244,63,94,.22)'; g.beginPath(); g.moveTo(X(0), Y(F)); g.lineTo(X(Math.min(q, bep)), Y(cost(Math.min(q, bep)))); g.lineTo(X(Math.min(q, bep)), Y(rev(Math.min(q, bep)))); g.lineTo(X(0), Y(0)); g.fill();
  if (q > bep) { g.fillStyle = 'rgba(163,230,53,.25)'; g.beginPath(); g.moveTo(X(bep), Y(cost(bep))); g.lineTo(X(q), Y(cost(q))); g.lineTo(X(q), Y(rev(q))); g.fill(); }
  const line = (f, c, label) => { g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.moveTo(X(0), Y(f(0))); g.lineTo(X(q), Y(f(q))); g.stroke(); g.fillStyle = c; g.font = '700 26px Flex'; g.fillText(label, X(q) + 12, Y(f(q)) + 6); };
  g.strokeStyle = '#FBBF24'; g.lineWidth = 3; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(X(0), Y(F)); g.lineTo(X(700), Y(F)); g.stroke(); g.setLineDash([]);
  line(cost, '#E879F9', 'cost'); line(rev, '#22D3EE', 'sales');
  if (q >= bep) { const s = E.back(S(q, bep, bep + 60)); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 30; g.beginPath(); g.arc(X(bep), Y(rev(bep)), 14 * s, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = 'rgba(8,6,24,.85)'; g.fillRect(X(bep) + 24, Y(rev(bep)) + 30, 300, 100); g.fillStyle = '#A3E635'; g.font = '700 30px Flex'; g.fillText('Break-even!', X(bep) + 44, Y(rev(bep)) + 68); g.fillStyle = '#fff'; g.font = '500 26px Flex'; g.fillText(`${bep} units = ${money(rev(bep))}`, X(bep) + 44, Y(rev(bep)) + 108); }
  g.fillStyle = 'rgba(8,6,24,.78)'; g.fillRect(40, 30, 380, 100); g.fillStyle = '#B8B0E8'; g.font = '600 24px Flex'; g.fillText('units sold', 64, 66); g.fillStyle = '#fff'; g.font = '700 44px Mono'; g.fillText(String(Math.round(q)), 64, 112);
}
const LABS = [['Pendulum', '#A3E635'], ['Pendulum', '#A3E635'], ['Lens & mirror', '#22D3EE'], ['Ohm’s law', '#FBBF24'], ['Break-even', '#E879F9']];
SCENES.labs = {
  accent: [163, 230, 53],
  build(cam, f, b) {
    b.win = win(cam, 360, 320, 1200, 620, null);
    b.tabs = $(`<div class="a" style="left:0;top:0;right:0;height:66px;display:flex;gap:12px;padding:10px 22px;border-bottom:1.5px solid rgba(255,255,255,.1)"></div>`, b.win.body);
    b.tabs.innerHTML = ['Pendulum', 'Lens & mirror', 'Ohm’s law', 'Break-even', 'Graph plotter'].map(n => `<div style="padding:8px 22px;border-radius:999px;font-size:25px;font-weight:600;color:#9C93C9;border:1.5px solid rgba(255,255,255,.12)">${n}</div>`).join('');
    b.cv = document.createElement('canvas'); b.cv.width = LAB.w; b.cv.height = LAB.h; css(b.cv, { position: 'absolute', left: '0', top: '66px' }); b.win.body.appendChild(b.cv); b.g = b.cv.getContext('2d');
    b.hd = $(`<div class="a dsp" style="left:0;top:0;width:1200px;height:620px;display:grid;place-items:center;font-size:84px;text-align:center;background:linear-gradient(160deg,rgba(163,230,53,.18),rgba(8,6,24,.92))">🧪 No mess.<br>No broken glass.</div>`, b.win.g);
  },
  update(t, f, b) {
    const t0 = f.t0(0), idx = [5, 4, 3, 2, 1, 0].find(i => t >= f.t0(i)) ?? 0;
    appear(b.win.g, t, t0 - .1, { dy: 80, s0: .8 });
    const tabOf = [0, 0, 0, 1, 2, 3][idx];
    [...b.tabs.children].forEach((c, i) => { const on = idx > 0 && i === tabOf; css(c, { color: on ? '#14122b' : '#9C93C9', background: on ? '#A3E635' : 'transparent', borderColor: on ? '#A3E635' : 'rgba(255,255,255,.12)', transform: on ? 'scale(1.06)' : 'scale(1)' }); });
    b.hd.style.opacity = idx === 0 ? 1 - S(t, f.t0(1) - .05, f.t0(1) + .25) : 0;
    const g = b.g, k = t - f.t0(Math.max(idx, 1));
    if (idx >= 1) {
      if (idx <= 2) { const jup = idx === 2, kk = t - f.t0(1);
        labPendulum(g, kk, jup ? { g: 24.8, name: 'JUPITER', sky: ['#4a2a14', '#c98a4b'], ground: '#8b5a2b', col: '#FBBF24' } : { g: 1.62, name: 'THE MOON', sky: ['#05050f', '#1c1c3a'], ground: '#9a9aa8', col: '#E5E7FF' }); }
      else if (idx === 3) labLens(g, k); else if (idx === 4) labCircuit(g, k); else labBreak(g, k);
    }
    return null;
  },
  cams: [[0, 960, 540, 1], [1, 960, 540, 1.04], [3, 960, 540, 1.07], [5, 960, 540, 1.04]],
};

// ---- simulations hub ----
const PH_N = 28;
function periodicPos(z) {
  if (z === 1) return [0, 0]; if (z === 2) return [17, 0];
  if (z <= 4) return [z - 3, 1]; if (z <= 10) return [z - 5 + 12, 1];
  if (z <= 12) return [z - 11, 2]; if (z <= 18) return [z - 13 + 12, 2];
  if (z <= 36) return [z - 19, 3]; if (z <= 54) return [z - 37, 4];
  if (z <= 56) return [z - 55, 5]; if (z <= 71) return [z - 57 + 2, 8.4]; if (z <= 86) return [z - 72 + 3, 5];
  if (z <= 88) return [z - 87, 6]; if (z <= 103) return [z - 89 + 2, 9.4]; return [z - 104 + 3, 6];
}
const catCol = z => (z === 1 ? '#22D3EE' : [3, 11, 19, 37, 55, 87].includes(z) ? '#F472B6' : [4, 12, 20, 38, 56, 88].includes(z) ? '#FB923C' : [2, 10, 18, 36, 54, 86, 118].includes(z) ? '#C084FC' : [9, 17, 35, 53, 85, 117].includes(z) ? '#FBBF24' : [5, 14, 32, 33, 51, 52].includes(z) ? '#34D399' : [6, 7, 8, 15, 16, 34].includes(z) ? '#A3E635' : (z >= 57 && z <= 71) || (z >= 89 && z <= 103) ? '#60A5FA' : [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116].includes(z) ? '#94A3B8' : '#38BDF8');
const CODE = ['import math', 'for h in [1, 2, 3]:', '    t = math.sqrt(2 * h / 9.8)', '    print(f"{h} m falls in {t:.2f} s")'];
const OUT = ['1 m falls in 0.45 s', '2 m falls in 0.64 s', '3 m falls in 0.78 s'];
SCENES.sims = {
  accent: [232, 121, 249],
  build(cam, f, b) {
    const ids = PHET_IDS.filter((_, i) => i % Math.floor(PHET_IDS.length / PH_N) === 0).slice(0, PH_N);
    b.mos = ids.map((id, i) => ({ i, e: $(`<div class="glass" style="width:200px;height:134px;border-radius:18px;overflow:hidden"><img src="${PHET(id)}" style="width:100%;height:100%;object-fit:cover"></div>`, cam) }));
    b.cred = $(`<div class="a" style="right:70px;top:930px;font-size:20px;color:#9C93C9;text-align:right">Simulations by PhET Interactive Simulations, University of Colorado Boulder (CC-BY)</div>`, cam);
    b.circ = win(cam, 380, 320, 1160, 620, 'Circuit simulator'); b.cc = document.createElement('canvas'); b.cc.width = 1160; b.cc.height = 564; b.circ.body.appendChild(b.cc);
    b.py = win(cam, 380, 320, 1160, 620, 'Python · runs in your browser');
    b.py.body.innerHTML = `<div class="a mono" style="left:44px;top:34px;font-size:40px;line-height:1.55;white-space:pre;color:#E9E5FF"></div><div class="a mono" style="left:44px;top:330px;right:44px;bottom:30px;border-radius:16px;background:#0a0818;padding:22px 28px;font-size:36px;line-height:1.5;color:#A3E635;white-space:pre"></div><div class="a" style="right:44px;top:30px;padding:14px 34px;border-radius:14px;background:#A3E635;color:#14122b;font-size:30px;font-weight:700">▶ Run</div>`;
    b.table = $(`<div class="glass" style="left:200px;top:330px;width:1010px;height:560px"></div>`, cam);
    b.cells = Array.from({ length: 118 }, (_, i) => { const z = i + 1, [c, r] = periodicPos(z); return { z, e: $(`<div class="a" style="left:${28 + c * 52}px;top:${22 + r * 52}px;width:48px;height:48px;border-radius:9px;background:${catCol(z)}33;border:1.5px solid ${catCol(z)};font-size:15px;font-weight:700;padding:4px 5px;color:#fff">${z}</div>`, b.table), c: catCol(z) }; });
    b.map = $(`<div class="glass" style="left:1250px;top:330px;width:540px;height:560px;overflow:hidden;background:#fff"><img src="${LIB('india_map')}" style="width:100%;height:100%;object-fit:contain"></div>`, cam);
    b.pin = $(`<div class="a" style="left:0;top:0;width:34px;height:34px;border-radius:50%;background:#E879F9;box-shadow:0 0 0 8px rgba(232,121,249,.3),0 0 30px #E879F9"></div>`, cam);
  },
  update(t, f, b) {
    const [t0, t1, t2, t3] = [0, 1, 2, 3].map(i => f.t0(i));
    // 0: mosaic
    b.mos.forEach(({ i, e }) => { const c = i % 7, r = Math.floor(i / 7), k = E.back(S(t, t0 + i * .045, t0 + .5 + i * .045)), out = E.io(S(t, t1 - .1, t1 + .35));
      css(e, { left: 480 + c * 212 + 'px', top: 330 + r * 146 + 'px', opacity: C(k * 2) * (1 - out), transform: `translateY(${(1 - k) * 90}px) scale(${L(.5, 1, k) * (1 - .25 * out)}) rotate(${(1 - k) * (i % 2 ? 8 : -8)}deg)` }); });
    css(b.cred, { opacity: C((t - t0) / .8) * (1 - S(t, t1 - .1, t1 + .3)) });
    // 1: circuit
    appear(b.circ.g, t, t1 - .05, { dy: 70, tb: t2 - .1 });
    if (t >= t1 - .1 && t < t2) { const g = b.cc.getContext('2d'), k = t - t1; g.fillStyle = '#0a0818'; g.fillRect(0, 0, 1160, 564);
      g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 20; x < 1160; x += 40) for (let y = 20; y < 564; y += 40) g.fillRect(x, y, 3, 3);
      const x0 = 110, x1 = 560, y0 = 110, y1 = 420; g.lineWidth = 7; g.lineJoin = 'round';
      const wire = (a, c) => { g.strokeStyle = c; g.beginPath(); g.moveTo(...a[0]); a.slice(1).forEach(p => g.lineTo(...p)); g.stroke(); };
      const glowC = c => { g.shadowColor = c; g.shadowBlur = 22; };
      wire([[x0, 250], [x0, y0], [x1, y0], [x1, 190]], '#EF4444'); wire([[x1, 330], [x1, y1], [x0, y1], [x0, 300]], '#22C55E');
      g.fillStyle = '#FBBF24'; g.fillRect(x0 - 40, 250, 80, 6); g.fillRect(x0 - 20, 290, 40, 6);
      g.strokeStyle = '#22D3EE'; g.beginPath(); g.moveTo(x1, 190); [[-22, 14], [22, 14], [-22, 14], [22, 14], [-22, 14], [0, 10]].forEach((d, i) => g.lineTo(x1 + d[0], 200 + i * 22)); g.lineTo(x1, 330); g.stroke();
      const on = Math.sin(k * 3) > -.3; glowC('#FDE047'); g.fillStyle = on ? '#FDE047' : '#7c6a1a'; g.beginPath(); g.arc(x1 + 150, 260, 36, 0, 7); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = '#FDE047'; g.lineWidth = 5; g.beginPath(); g.moveTo(x1 + 60, 260); g.lineTo(x1 + 114, 260); g.moveTo(x1 + 186, 260); g.lineTo(x1 + 240, 260); g.stroke();
      for (let i = 0; i < 18; i++) { const d = (k * 120 + i * 50) % 900, x = d < 450 ? x0 + d : x1 - (d - 450), y = d < 450 ? y0 : y1; g.fillStyle = d < 450 ? '#fca5a5' : '#86efac'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
      // oscilloscope
      g.fillStyle = '#05140a'; g.fillRect(760, 90, 340, 300); g.strokeStyle = '#14532d'; g.lineWidth = 1; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(760 + i * 57, 90); g.lineTo(760 + i * 57, 390); g.moveTo(760, 90 + i * 50); g.lineTo(1100, 90 + i * 50); g.stroke(); }
      g.strokeStyle = '#4ade80'; g.lineWidth = 4; g.shadowColor = '#4ade80'; g.shadowBlur = 14; g.beginPath(); for (let x = 0; x <= 340; x += 4) { const y = 240 - 90 * Math.sin((x / 340) * 12 + k * 6); x ? g.lineTo(760 + x, y) : g.moveTo(760, y); } g.stroke(); g.shadowBlur = 0;
      g.fillStyle = '#9C93C9'; g.font = '600 24px Flex'; g.fillText('LED + resistor · live voltage', 760, 430);
    }
    // 2: python typing
    appear(b.py.g, t, t2 - .05, { dy: 70, tb: t3 - .1 });
    const code = CODE.join('\n'), kk = S(t, t2 + .2, t2 + (f.t1(2) - f.t0(2)) * .8), runK = S(t, t2 + (f.t1(2) - f.t0(2)) * .72, t2 + (f.t1(2) - f.t0(2)) * .95);
    b.py.body.children[0].textContent = typed(code, kk) + (kk < 1 && Math.floor(t * 3) % 2 ? '▌' : '');
    b.py.body.children[1].textContent = OUT.slice(0, Math.floor(runK * 3.99)).map(s => s).join('\n');
    b.py.body.children[2].style.transform = `scale(${1 + .12 * Math.exp(-(t - (t2 + (f.t1(2) - f.t0(2)) * .72)) * 6) * (t > t2 + (f.t1(2) - f.t0(2)) * .72)})`;
    // 3: periodic table + map
    appear(b.table, t, t3 - .05, { dx: -120, dy: 0 }); appear(b.map, t, t3 + .25, { dx: 140, dy: 0 });
    const sw = (t - t3) * 40;
    b.cells.forEach(({ z, e, c }) => { const hi = Math.exp(-Math.abs(z - sw) / 6); e.style.background = `${c}${hi > .25 ? '99' : '33'}`; e.style.boxShadow = hi > .3 ? `0 0 ${20 * hi}px ${c}` : 'none'; });
    const wk = t - (t3 + .4), px = 1250 + 270 + Math.cos(wk * 1.1) * 90, py = 330 + 300 + Math.sin(wk * 1.7) * 130;
    css(b.pin, { left: px + 'px', top: py + 'px', opacity: S(t, t3 + .5, t3 + .8), transform: `scale(${1 + .2 * Math.sin(t * 8)})` });
    return null;
  },
  cams: [[0, 960, 540, 1], [1, 960, 540, 1.05], [3, 960, 540, 1.04]],
};

// ---- AI helper ----
SCENES.ai = {
  accent: [139, 92, 246],
  build(cam, f, b) {
    b.chat = win(cam, 250, 330, 880, 590, 'Zynetix AI · Lesson helper');
    b.chat.body.innerHTML = `<div class="a" style="right:34px;top:26px;max-width:600px;padding:20px 28px;border-radius:26px 26px 6px 26px;background:linear-gradient(135deg,#8B5CF6,#6D28D9);font-size:30px;line-height:1.3"></div><div class="a" style="left:34px;top:164px;width:800px;padding:26px 30px;border-radius:26px 26px 26px 6px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.14);font-size:28px;line-height:1.5"></div>`;
    b.cards = ['✍️|Writes lesson plans|#A3E635', '💬|Answers questions|#22D3EE', '📝|Drafts the marking|#E879F9'].map((s, i) => { const [ic, tx, c] = s.split('|'); return $(`<div class="glass" style="left:1180px;top:${330 + i * 150}px;width:560px;height:124px;display:flex;align-items:center;gap:24px;padding:0 30px;font-size:34px;font-weight:600;border-color:${c}99;box-shadow:0 0 40px ${c}33"><span style="font-size:56px">${ic}</span>${tx}</div>`, cam); });
    b.stamp = $(`<div class="a" style="left:1180px;top:330px;width:560px;padding:30px 36px;border-radius:28px;border:3px solid #A3E635;background:rgba(163,230,53,.12);font-size:40px;font-weight:700;color:#D9F99D;display:flex;gap:20px;align-items:center;box-shadow:0 0 60px rgba(163,230,53,.35)"><span style="font-size:64px">👩‍🏫</span><span>Teacher reviews<br>and approves ✓</span></div>`, cam);
    b.btns = $(`<div class="a" style="left:1180px;top:550px;display:flex;gap:24px"><div style="padding:18px 40px;border-radius:16px;background:#A3E635;color:#14122b;font-size:32px;font-weight:700">Approve</div><div style="padding:18px 40px;border-radius:16px;border:2px solid rgba(255,255,255,.3);font-size:32px;font-weight:600">Edit</div></div>`, cam);
    b.cur = $(`<div class="a" style="width:44px;height:44px;font-size:44px">👆</div>`, cam);
  },
  update(t, f, b) {
    const [t0, t1, t2] = [0, 1, 2].map(i => f.t0(i)), d0 = f.t1(0) - t0;
    appear(b.chat.g, t, t0 - .05, { dy: 80 });
    const q = 'Plan a lesson on photosynthesis for Class 7';
    b.chat.body.children[0].textContent = typed(q, S(t, t0 + .2, t0 + d0 * .55));
    b.chat.body.children[0].style.opacity = C((t - t0) / .3);
    const ans = ['Photosynthesis · Class 7', '🎯 Goal: how plants make food', '🔬 Activity: leaf & sunlight test', '❓ 3-question quick quiz'];
    const ak = S(t, t0 + d0 * .55, t0 + d0 * .95);
    b.chat.body.children[1].innerHTML = ans.map((s, i) => `<div style="opacity:${C(ak * 4 - i)};transform:translateX(${(1 - C(ak * 4 - i)) * 30}px);${i ? '' : 'font-weight:700;font-size:32px;margin-bottom:6px;color:#C4B5FD'}">${s}</div>`).join('');
    b.chat.body.children[1].style.opacity = ak > 0 ? 1 : 0;
    const w = f.ph[1].words, wi = [1, 3, 6].map(i => w[i][1]);
    b.cards.forEach((c, i) => appear(c, t, wi[i], { dx: 120, dy: 0, d: .4, tb: t2 - .05 }));
    appear(b.stamp, t, t2 + .05, { dx: 0, dy: 40, s0: 1.4 }); appear(b.btns, t, t2 + .2, { dy: 30 });
    const ck = S(t, t2 + .5, t2 + 1.3); css(b.cur, { left: L(1500, 1250, E.io(ck)) + 'px', top: L(700, 570, E.io(ck)) + 'px', opacity: S(t, t2 + .4, t2 + .6), transform: `scale(${1 - .25 * Math.exp(-Math.abs(t - (t2 + 1.4)) * 8)})` });
    b.btns.children[0].style.boxShadow = t > t2 + 1.35 ? '0 0 40px #A3E635' : 'none';
  },
  cams: [[0, 960, 540, 1], [1, 1000, 540, 1.04], [2, 1100, 540, 1.1]],
};

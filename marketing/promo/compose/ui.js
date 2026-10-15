// Small UI kit shared by scenes
const LIB = n => `/marketing/promo/build/lib/${n}.webp`;
const THUMB = n => `/marketing/promo/build/viewer3d/thumbs/${n}.jpg`;
const PHET = n => `/apps/board/assets/phet/thumbs/${n}.jpg`;
function win(cam, x, y, w, h, title, o = {}) {
  const g = $(`<div class="glass ${o.light ? 'light' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;${o.light ? 'background:#fbfaff;backdrop-filter:none' : ''}"></div>`, cam);
  if (title !== null) {
    const bar = $(`<div class="a" style="left:0;top:0;right:0;height:56px;display:flex;align-items:center;gap:9px;padding:0 22px;border-bottom:1.5px solid ${o.light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.1)'};font-size:22px;font-weight:600;color:${o.light ? '#5b5780' : '#B8B0E8'}"><i style="width:13px;height:13px;border-radius:50%;background:#ff5f57"></i><i style="width:13px;height:13px;border-radius:50%;background:#febc2e"></i><i style="width:13px;height:13px;border-radius:50%;background:#28c840"></i><span style="margin-left:14px">${title}</span></div>`, g);
  }
  const body = $(`<div class="a" style="left:0;top:${title === null ? 0 : 56}px;right:0;bottom:0"></div>`, g);
  return { g, body, w, h: h - (title === null ? 0 : 56) };
}
const typed = (s, k) => s.slice(0, Math.floor(s.length * C(k)));
const fade = (e, o, y = 0, s = 1) => { e.style.opacity = o; e.style.transform = `translateY(${y}px) scale(${s})`; };
// appear at time ta (spring), optional leave at tb
function appear(e, t, ta, o = {}) {
  const k = E.back(S(t, ta, ta + (o.d || .45))), gone = o.tb ? S(t, o.tb, o.tb + .3) : 0;
  e.style.opacity = C(k * 2) * (1 - gone);
  e.style.transform = `translate(${(o.dx || 0) * (1 - k)}px,${(o.dy === undefined ? 40 : o.dy) * (1 - k)}px) scale(${L(o.s0 || .86, 1, k)})`;
  return k;
}
const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
// donut / bars helpers
const bar = (w, c) => `<div style="height:14px;width:${w}px;border-radius:7px;background:${c}"></div>`;
const row = (cells, o = {}) => `<div style="display:flex;align-items:center;gap:18px;padding:${o.p || '14px 22px'};border-bottom:1.5px solid ${o.line || 'rgba(0,0,0,.06)'};font-size:${o.fs || 24}px">${cells.join('')}</div>`;
const tag = (txt, c) => `<span style="padding:4px 14px;border-radius:999px;font-size:20px;font-weight:700;color:${c};background:${c}22;border:1.5px solid ${c}55;white-space:nowrap">${txt}</span>`;
const avatar = (n, c) => `<div style="width:46px;height:46px;border-radius:50%;background:${c};display:grid;place-items:center;color:#fff;font-weight:700;font-size:21px;flex:none">${n}</div>`;

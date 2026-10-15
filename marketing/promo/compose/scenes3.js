// Generic pane animator: .it (staggered pop-in), .bar (grow), .cnt (count up), .draw (stroke draw), .rowin (slide)
function anim(pane, t, ta, step = .1) {
  pane.querySelectorAll('.it').forEach((e, j) => appear(e, t, ta + j * step, { dy: 26, s0: .94, d: .4 }));
  pane.querySelectorAll('.bar').forEach((e, j) => { e.style.transformOrigin = '50% 100%'; e.style.transform = `scaleY(${E.out(S(t, ta + .2 + j * .05, ta + .9 + j * .05))})`; });
  pane.querySelectorAll('.hbar').forEach((e, j) => { e.style.transformOrigin = '0 50%'; e.style.transform = `scaleX(${E.out(S(t, ta + .3 + j * .08, ta + 1.0 + j * .08))})`; });
  pane.querySelectorAll('.cnt').forEach(e => { const v = +e.dataset.v, k = E.out(S(t, ta + .1, ta + 1.2)); e.textContent = (e.dataset.p || '') + Math.round(v * k).toLocaleString('en-IN') + (e.dataset.s || ''); });
  pane.querySelectorAll('.draw').forEach(e => { const len = e.getTotalLength ? e.getTotalLength() : 1000; e.style.strokeDasharray = len; e.style.strokeDashoffset = len * (1 - E.io(S(t, ta + .1, ta + 1.4))); });
}
const INK = '#14122b', SUB = '#6b6791';
const lt = (s, o = '') => `<div class="a" style="${o}">${s}</div>`;
const tile = (ic, label, v, c, p = '', s = '') => `<div class="it" style="position:relative;flex:1;height:140px;border-radius:20px;background:${c}14;border:1.5px solid ${c}44;padding:18px 22px"><div style="font-size:22px;color:${SUB};font-weight:600">${ic} ${label}</div><div class="cnt dsp" data-v="${v}" data-p="${p}" data-s="${s}" style="font-size:54px;color:${INK};margin-top:6px">0</div></div>`;

// ---- smart board ----
SCENES.board = {
  accent: [34, 211, 238],
  build(cam, f, b) {
    b.dev = $(`<div class="a" style="left:300px;top:320px;width:1320px;height:620px;border-radius:30px;background:linear-gradient(160deg,#252330,#0a0912);padding:18px;box-shadow:0 60px 120px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.1) inset,0 0 120px rgba(34,211,238,.18)"><div class="a" style="left:18px;top:18px;right:18px;bottom:18px;border-radius:14px;background:#fbfaff;overflow:hidden;color:${INK}" id="scr"></div></div>`, cam);
    const scr = b.dev.querySelector('#scr');
    scr.innerHTML = `<div class="a" style="left:40px;top:24px;font-size:46px;font-family:Kalam,Flex;font-weight:700;color:#6D28D9">The Human Heart</div>
    <img class="a" src="${THUMB('heart')}" style="left:60px;top:100px;width:480px;height:400px;border-radius:24px;object-fit:cover;background:#000">
    <div class="a" id="inkTxt" style="left:590px;top:130px;font-size:90px;font-family:Kalam,Flex;color:#1d4ed8;white-space:nowrap;clip-path:inset(0 100% 0 0)">4 chambers!</div>
    <svg class="a" style="left:560px;top:230px" width="500" height="200"><path id="inkLine" class="draw" d="M10 40 C 160 20, 330 24, 470 34" stroke="#E11D48" stroke-width="7" fill="none" stroke-linecap="round"/><path id="inkArr" class="draw" d="M20 120 C 90 160, 40 190, 20 150 M20 150 l-8 -22 M20 150 l22 -6" stroke="#1d4ed8" stroke-width="6" fill="none" stroke-linecap="round"/></svg>
    <div class="a" id="pen" style="left:0;top:0;width:18px;height:18px;border-radius:50%;background:#1d4ed8;box-shadow:0 0 14px #1d4ed8"></div>
    <div class="a" id="laser" style="left:0;top:0"></div>
    <div class="a" id="tools" style="right:26px;top:90px;width:84px;border-radius:24px;background:#14122b;padding:14px 0;display:flex;flex-direction:column;gap:12px;align-items:center;font-size:38px"></div>
    <div class="a" id="poll" style="left:600px;top:100px;width:660px;height:440px;border-radius:26px;background:#fff;box-shadow:0 30px 80px rgba(20,18,43,.3);padding:26px 34px"><div style="font-size:30px;font-weight:700;color:${INK};margin-bottom:18px">Which chamber pumps blood to the body?</div><div id="opts"></div><div id="ans" style="font-size:26px;color:${SUB};margin-top:12px"></div></div>`;
    b.scr = scr; b.tools = scr.querySelector('#tools');
    b.tools.innerHTML = ['🖊️', '🔴', '📊', '🎥'].map(x => `<div style="width:64px;height:64px;border-radius:18px;display:grid;place-items:center">${x}</div>`).join('');
    const opts = ['A  Right atrium', 'B  Left ventricle', 'C  Right ventricle', 'D  Left atrium'];
    scr.querySelector('#opts').innerHTML = opts.map((o, i) => `<div style="position:relative;height:58px;margin-bottom:12px;border-radius:14px;background:#f1eefc;overflow:hidden"><div class="hbar" style="position:absolute;left:0;top:0;bottom:0;width:${[8, 74, 12, 6][i]}%;background:${i === 1 ? '#A3E635' : '#C4B5FD'}"></div><div style="position:absolute;left:20px;top:0;line-height:58px;font-size:30px;font-weight:600;color:${INK}">${o}</div><div class="pc" style="position:absolute;right:20px;top:0;line-height:58px;font-size:30px;font-weight:700;color:${INK}"></div></div>`).join('');
    b.dev.style.transformOrigin = '50% 50%';
  },
  update(t, f, b) {
    const [t0, t1, t2, t3] = [0, 1, 2, 3].map(i => f.t0(i)), d1 = f.t1(1) - t1;
    appear(b.dev, t, t0 - .1, { dy: 90, s0: .86 });
    const tool = t >= t3 ? 2 : t >= t2 ? 1 : t >= t1 ? 0 : -1;
    [...b.tools.children].forEach((c, i) => css(c, { background: i === tool ? '#8B5CF6' : 'transparent', boxShadow: i === tool ? '0 0 26px #8B5CF6' : 'none' }));
    const ik = S(t, t1 + .15, t1 + d1 * .8);
    b.scr.querySelector('#inkTxt').style.clipPath = `inset(0 ${100 - ik * 100}% 0 0)`;
    const pen = b.scr.querySelector('#pen'); css(pen, { left: 590 + ik * 560 + 'px', top: 200 + Math.sin(ik * 30) * 14 + 'px', opacity: ik > 0 && ik < 1 ? 1 : 0 });
    const ln = b.scr.querySelector('#inkLine'), ar = b.scr.querySelector('#inkArr');
    [ln, ar].forEach(e => { const len = e.getTotalLength(); e.style.strokeDasharray = len; e.style.strokeDashoffset = len * (1 - S(t, t1 + d1 * .75, t1 + d1 * 1.2)); });
    // laser with fading trail
    const lz = b.scr.querySelector('#laser'), lk = t - t2, on = t >= t2 && t < t3 - .05;
    if (!lz.children.length) for (let i = 0; i < 16; i++) lz.appendChild($(`<div class="a" style="width:${26 - i}px;height:${26 - i}px;border-radius:50%;background:#EF4444;box-shadow:0 0 ${24 - i}px #EF4444"></div>`));
    [...lz.children].forEach((d, i) => { const tt = lk - i * .03, x = 300 + Math.cos(tt * 2.6) * 150 + Math.cos(tt * 5) * 30, y = 300 + Math.sin(tt * 3.4) * 100; css(d, { left: x + 'px', top: y + 'px', opacity: on ? (1 - i / 16) : 0 }); });
    // poll
    const pk = S(t, t3, t3 + 2.2), poll = b.scr.querySelector('#poll');
    appear(poll, t, t3 - .05, { dy: 50 }); poll.style.pointerEvents = 'none';
    b.scr.querySelectorAll('.hbar').forEach((e, j) => { e.style.transformOrigin = '0 50%'; e.style.transform = `scaleX(${E.out(S(t, t3 + .3 + j * .12, t3 + 1.6 + j * .12))})`; });
    b.scr.querySelectorAll('.pc').forEach((e, j) => { e.textContent = Math.round([8, 74, 12, 6][j] * E.out(S(t, t3 + .3 + j * .12, t3 + 1.6 + j * .12))) + '%'; });
    b.scr.querySelector('#ans').textContent = `${Math.round(30 * pk)} of 30 students answered`;
    // draw only what belongs to the current phrase
    b.scr.querySelector('#inkTxt').style.opacity = t >= t3 ? 0 : 1; ln.style.opacity = ar.style.opacity = t >= t3 ? 0 : 1;
  },
  cams: [[0, 960, 540, 1], [1, 900, 540, 1.05], [2, 1000, 540, 1.05], [3, 1080, 540, 1.06]],
};

// ---- sign-in, offline, phone remote, recording ----
function qr(cv, seed) {
  const g = cv.getContext('2d'), n = 25, c = cv.width / n, r = rng(seed); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#14122b';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const fin = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9); if (!fin && r() > .52) g.fillRect(x * c, y * c, c, c); }
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([x, y]) => { g.fillRect(x * c, y * c, 7 * c, 7 * c); g.fillStyle = '#fff'; g.fillRect((x + 1) * c, (y + 1) * c, 5 * c, 5 * c); g.fillStyle = '#14122b'; g.fillRect((x + 2) * c, (y + 2) * c, 3 * c, 3 * c); });
}
function phone(cam, x, y, inner, s = 1) {
  return $(`<div class="a" style="left:${x}px;top:${y}px;width:330px;height:690px;border-radius:54px;background:linear-gradient(150deg,#3a3650,#0c0b14 45%,#1d1b2b);padding:12px;transform-origin:50% 50%;box-shadow:0 50px 90px rgba(0,0,0,.6),0 0 0 1.5px rgba(255,255,255,.14) inset,0 0 70px rgba(139,92,246,.25)"><div class="a" style="left:12px;top:12px;right:12px;bottom:12px;border-radius:44px;background:#fbfaff;overflow:hidden;color:${INK}">${inner}<div class="a" style="left:50%;top:14px;width:92px;height:26px;margin-left:-46px;border-radius:14px;background:#000"></div></div></div>`, cam);
}
SCENES.offline = {
  accent: [163, 230, 53],
  build(cam, f, b) {
    // 0: QR sign-in
    b.p0 = $(`<div class="a"></div>`, cam);
    b.qrBox = $(`<div class="glass" style="left:380px;top:360px;width:500px;height:520px;padding:30px;text-align:center"><div style="font-size:30px;font-weight:600;margin-bottom:14px;color:#D9D4FF">Scan to sign in</div><canvas width="400" height="400" style="border-radius:18px"></canvas></div>`, b.p0);
    qr(b.qrBox.querySelector('canvas'), 7);
    b.scan = $(`<div class="a" style="left:410px;top:430px;width:440px;height:6px;border-radius:3px;background:#A3E635;box-shadow:0 0 30px 6px #A3E635"></div>`, b.p0);
    b.ph0 = phone(b.p0, 1060, 330, `<div class="a" style="left:0;top:0;right:0;bottom:0;background:#0b0a16"><div class="a" style="left:40px;top:150px;width:210px;height:210px;border:5px solid #A3E635;border-radius:28px"></div><div class="a" id="ok" style="left:0;right:0;top:420px;text-align:center;font-size:30px;font-weight:700;color:#A3E635;opacity:0">✓ Signed in<br><span style="font-size:24px;color:#fff;font-weight:500">Anita Sharma · Teacher</span></div></div>`);
    // 1: offline
    b.p1 = $(`<div class="a"></div>`, cam);
    b.wifi = $(`<div class="a" style="left:560px;top:360px;width:260px;height:260px;display:grid;place-items:center;font-size:190px">📶<div class="a" style="width:300px;height:14px;border-radius:7px;background:#F43F5E;transform:rotate(-40deg);box-shadow:0 0 30px #F43F5E"></div></div>`, b.p1);
    b.off = $(`<div class="glass" style="left:900px;top:380px;width:640px;padding:34px 40px"><div style="font-size:30px;font-weight:700;color:#F9A8D4">No internet</div><div style="font-size:44px;font-weight:700;margin:10px 0 18px;color:#D9F99D">Board keeps working ✓</div><div style="font-size:28px;color:#B8B0E8;line-height:1.5">Lessons, ink and models are saved on the device.<br>Everything syncs when the internet is back.</div></div>`, b.p1);
    // 2: phone remote + camera
    b.p2 = $(`<div class="a"></div>`, cam);
    b.ph2 = phone(b.p2, 700, 320, `<div class="a" style="left:0;top:0;right:0;bottom:0;padding:70px 24px 24px"><div style="font-size:28px;font-weight:700;margin-bottom:16px">Remote</div><div style="display:flex;gap:14px;margin-bottom:18px"><div style="flex:1;height:96px;border-radius:20px;background:#EDE9FE;display:grid;place-items:center;font-size:44px">◀</div><div class="nxt" style="flex:1;height:96px;border-radius:20px;background:#8B5CF6;color:#fff;display:grid;place-items:center;font-size:44px">▶</div></div><div style="height:260px;border-radius:24px;background:linear-gradient(160deg,#1e1b4b,#4c1d95);display:grid;place-items:center;font-size:30px;color:#fff;font-weight:600">📷 Camera on board</div></div>`);
    b.beam = $(`<svg class="a" style="left:0;top:0" width="1920" height="1080"><path id="bm" class="draw" d="M1000 560 C 1200 480, 1300 520, 1480 560" stroke="#22D3EE" stroke-width="6" fill="none" stroke-dasharray="14 12"/></svg>`, b.p2);
    b.mini = $(`<div class="glass" style="left:1180px;top:390px;width:560px;height:340px;overflow:hidden"><img src="${THUMB('heart')}" style="width:100%;height:100%;object-fit:cover"><div class="a mn" style="right:18px;top:16px;padding:6px 18px;border-radius:999px;background:#22D3EE;color:#14122b;font-weight:700;font-size:24px">Next slide ▶</div></div>`, b.p2);
    // 3: record
    b.p3 = $(`<div class="a"></div>`, cam);
    b.rec = $(`<div class="glass" style="left:480px;top:380px;width:960px;height:420px;padding:44px 56px"><div style="display:flex;align-items:center;gap:22px"><div id="dot" style="width:46px;height:46px;border-radius:50%;background:#F43F5E;box-shadow:0 0 40px #F43F5E"></div><div class="mono" id="tm" style="font-size:72px">00:00</div><div style="margin-left:auto;font-size:30px;font-weight:600;color:#D9D4FF">Lesson · Human Heart</div></div><div id="wv" style="display:flex;align-items:center;gap:8px;height:130px;margin-top:34px"></div><div id="saved" style="margin-top:20px;font-size:34px;font-weight:700;color:#D9F99D">✓ Saved for students who missed it</div></div>`, b.p3);
    b.rec.querySelector('#wv').innerHTML = Array.from({ length: 48 }, () => `<div style="flex:1;border-radius:6px;background:linear-gradient(#22D3EE,#8B5CF6);height:20px"></div>`).join('');
  },
  update(t, f, b) {
    const T = i => f.t0(i), n = i => (i + 1 < f.n ? f.t0(i + 1) - .1 : f.sc.end);
    const showP = (el, i) => { const on = t >= T(i) - .1 && t < n(i); el.style.display = on ? 'block' : 'none'; return on; };
    if (showP(b.p0, 0)) { const k = S(t, T(0), T(0) + 2.4); appear(b.qrBox, t, T(0) - .05, { dx: -100, dy: 0 }); appear(b.ph0, t, T(0) + .1, { dx: 120, dy: 0 });
      css(b.scan, { top: 440 + Math.abs(Math.sin(k * 6)) * 380 + 'px', opacity: k < .82 ? 1 : 0 }); b.ph0.querySelector('#ok').style.opacity = S(t, T(0) + 2.0, T(0) + 2.4); b.qrBox.style.borderColor = k > .85 ? '#A3E635' : ''; }
    if (showP(b.p1, 1)) { appear(b.wifi, t, T(1), { dx: -80, dy: 0, s0: 1.3 }); appear(b.off, t, T(1) + .5, { dx: 100, dy: 0 }); }
    if (showP(b.p2, 2)) { appear(b.ph2, t, T(2) - .05, { dx: -120, dy: 0 }); const bk = S(t, T(2) + .3, T(2) + 1.2); b.beam.querySelector('#bm').style.strokeDashoffset = -t * 60; b.beam.style.opacity = bk;
      appear(b.mini, t, T(2) + .3, { dx: 140, dy: 0 }); const press = t > T(2) + 1.6; b.ph2.querySelector('.nxt').style.transform = `scale(${press ? 1 - .15 * Math.exp(-(t - T(2) - 1.6) * 8) : 1})`; b.mini.querySelector('.mn').style.opacity = press ? 1 : 0; }
    if (showP(b.p3, 3)) { appear(b.rec, t, T(3) - .05, { dy: 60 }); const k = t - T(3); b.rec.querySelector('#tm').textContent = '00:' + String(Math.floor(k * 12) % 60).padStart(2, '0'); b.rec.querySelector('#dot').style.opacity = .5 + .5 * (Math.sin(k * 8) > 0);
      [...b.rec.querySelector('#wv').children].forEach((d, i) => d.style.height = 16 + 100 * Math.abs(Math.sin(k * 5 + i * .6) * Math.cos(k * 2 + i * .21)) + 'px'); b.rec.querySelector('#saved').style.opacity = S(t, T(3) + 2.2, T(3) + 2.6); }
  },
  cams: [[0, 960, 600, 1], [1, 1000, 590, 1.04], [2, 1000, 560, 1.05], [3, 960, 590, 1.06]],
};

// ---- ERP ----
const NAMES = ['Aarav Patel', 'Diya Patel', 'Riya Nair', 'Kabir Rao', 'Ananya Gowda'];
const ERP_NAV = [['🏠', 'Dashboard'], ['📝', 'Admissions'], ['🎓', 'Exams'], ['🎯', 'OBE · NAAC'], ['💳', 'Fees'], ['👥', 'HR & Payroll'], ['🚌', 'Transport'], ['🏨', 'Hostel'], ['📚', 'Library'], ['💼', 'Placements'], ['🪪', 'Certificates'], ['📣', 'Notices'], ['🔀', 'Workflows'], ['📈', 'Analytics'], ['✨', 'And more']];
const PANE_OF = [0, 1, 2, 3, 4, 5, 6, 7, 8];            // phrase -> pane
const NAV_OF = [[0], [1], [2], [3], [4, 5], [6], [7, 8, 9], [10], [11], [12], [13], [14]];
function erpPanes() {
  const P = [];
  P[0] = `<div style="display:flex;gap:18px;margin-bottom:22px">${tile('🧑‍🎓', 'Students', 2480, '#8B5CF6')}${tile('👩‍🏫', 'Staff', 164, '#22D3EE')}${tile('✅', 'Present today', 94, '#16A34A', '', '%')}${tile('₹', 'Fees collected', 12400000, '#F59E0B', '₹')}</div>
  <div style="display:flex;gap:22px"><div class="it" style="flex:1.4;height:300px;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px;position:relative"><div style="font-size:24px;font-weight:700">Weekly attendance</div><div style="position:absolute;left:34px;right:34px;bottom:26px;top:80px;display:flex;align-items:flex-end;gap:22px">${[88, 92, 95, 90, 94, 78].map((v, i) => `<div style="flex:1;text-align:center;font-size:20px;color:${SUB}"><div class="bar" style="height:${v * 1.6}px;border-radius:10px;background:linear-gradient(#8B5CF6,#22D3EE)"></div>${'MTWTFS'[i]}</div>`).join('')}</div></div>
  <div class="it" style="flex:1;height:300px;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px;font-size:24px;line-height:2.1"><b>Today</b><br>✅ 38 admissions verified<br>📄 Hall tickets ready<br>🚌 7 buses on route</div></div>`;
  P[1] = `<div style="display:flex;gap:16px;height:100%">${['Applied', 'Documents', 'Fee paid', 'Merit list', 'Admitted'].map((c, i) => `<div class="it" style="flex:1;border-radius:20px;background:#f6f3ff;padding:16px;font-size:23px;font-weight:700;color:${i === 4 ? '#15803d' : INK}">${c}</div>`).join('')}</div>`;
  P[2] = `<div style="display:flex;gap:26px"><div class="it" style="width:430px;border-radius:22px;border:2px dashed #c4b5fd;padding:26px 28px"><div style="display:flex;justify-content:space-between"><b style="font-size:28px">HALL TICKET</b><span style="font-size:22px;color:${SUB}">Sem 3 · 2026</span></div><div style="font-size:34px;font-weight:700;margin:16px 0 4px">Aarav Patel</div><div style="font-size:23px;color:${SUB}">BCom · Roll 2301 · Centre: Block A</div><div style="display:flex;gap:18px;margin-top:20px;align-items:center"><div style="width:110px;height:110px;background:repeating-conic-gradient(#14122b 0 25%,#fff 0 50%) 0 0/22px 22px;border-radius:10px"></div><div style="font-size:21px;line-height:1.7;color:${INK}">Cost Accounting · 10 Nov<br>Corporate Acc. · 12 Nov<br>Business Law · 14 Nov</div></div></div>
  <div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;overflow:hidden"><div style="padding:16px 24px;font-size:24px;font-weight:700;background:#f6f3ff">Results · SGPA</div>${NAMES.map((n, i) => row([avatar(n[0], ['#8B5CF6', '#22D3EE', '#E879F9', '#F59E0B', '#16A34A'][i]), `<span style="flex:1;font-weight:600">${n}</span>`, `<b class="cnt" data-v="${[84, 91, 78, 88, 95][i]}" style="width:70px">0</b>`, tag(['A', 'A+', 'B+', 'A', 'O'][i], '#7C3AED')], { fs: 23 })).join('')}<div style="padding:14px 24px;text-align:right"><span style="padding:12px 26px;border-radius:12px;background:#16A34A;color:#fff;font-weight:700;font-size:24px">Publish results ✓</span></div></div></div>`;
  P[3] = `<div style="display:flex;gap:30px"><div class="it" style="border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:24px;font-weight:700;margin-bottom:14px">CO–PO mapping</div><div style="display:grid;grid-template-columns:90px repeat(6,74px);gap:8px;font-size:21px;font-weight:700;text-align:center"><div></div>${['PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PO6'].map(x => `<div style="color:${SUB}">${x}</div>`).join('')}${['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map((c, i) => `<div style="color:${SUB};line-height:60px">${c}</div>` + [0, 1, 2, 3, 4, 5].map(j => { const v = [3, 2, 1, 0, 2, 3][(i * 2 + j * 5) % 6]; return `<div style="height:60px;line-height:60px;border-radius:12px;background:rgba(139,92,246,${.12 + v * .24});color:${v > 1 ? '#fff' : INK}">${v || '–'}</div>`; }).join('')).join('')}</div></div>
  <div style="flex:1"><div class="it" style="font-size:24px;font-weight:700;margin-bottom:12px">Attainment (target 60%)</div>${['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map((c, i) => `<div class="it" style="display:flex;align-items:center;gap:14px;margin-bottom:14px;font-size:22px;font-weight:600"><span style="width:50px">${c}</span><div style="flex:1;height:26px;border-radius:13px;background:#eee9fb;overflow:hidden"><div class="hbar" style="width:${[82, 74, 68, 91, 63][i]}%;height:100%;background:linear-gradient(90deg,#22D3EE,#8B5CF6)"></div></div><b>${[82, 74, 68, 91, 63][i]}%</b></div>`).join('')}<div class="it" style="display:inline-block;margin-top:8px;padding:14px 30px;border-radius:14px;background:#8B5CF6;color:#fff;font-weight:700;font-size:25px">⬇ Export AQAR report</div></div></div>`;
  P[4] = `<div style="display:flex;gap:26px"><div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:24px 28px"><div style="font-size:24px;font-weight:700">Fees collected</div><div style="display:flex;align-items:flex-end;gap:16px;height:170px;margin:16px 0">${[40, 55, 48, 72, 66, 90].map(v => `<div class="bar" style="flex:1;height:${v * 1.6}px;border-radius:9px;background:linear-gradient(#F59E0B,#FCD34D)"></div>`).join('')}</div><div class="it" style="padding:16px 20px;border-radius:16px;background:#ecfdf3;border:1.5px solid #86efac;font-size:24px;font-weight:700;color:#15803d">✓ ₹45,000 paid · UPI · Receipt sent</div></div>
  <div class="it" style="width:470px;border-radius:22px;border:1.5px solid #e6e1fa;padding:24px 28px"><div style="font-size:24px;font-weight:700">Payslip · October</div>${[['Basic', '₹52,000', ''], ['HRA', '₹20,800', ''], ['PF', '−₹6,240', '#dc2626'], ['Prof. tax', '−₹200', '#dc2626'], ['TDS', '−₹2,150', '#dc2626']].map(([a, b2, c]) => row([`<span style="flex:1">${a}</span>`, `<b style="color:${c || INK}">${b2}</b>`], { fs: 23, p: '12px 0' })).join('')}<div style="display:flex;justify-content:space-between;margin-top:14px;font-size:30px;font-weight:800"><span>Net pay</span><span style="color:#15803d">₹64,210</span></div></div></div>`;
  P[5] = `<div class="it" style="position:relative;height:520px;border-radius:24px;overflow:hidden;background:#eef2ff"><svg width="1170" height="520" viewBox="0 0 1170 520"><g stroke="#dfe3f5" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="520"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="1170" y2="${i * 100}"/>`).join('')}</g><path d="M0 380 C 200 300, 300 470, 520 330 S 900 150, 1170 210" stroke="#fff" stroke-width="34" fill="none"/><path id="route" d="M70 340 C 220 300, 330 440, 520 330 S 860 160, 1100 200" stroke="#8B5CF6" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="1 0"/>${[[70, 340], [330, 392], [520, 330], [790, 215], [1100, 200]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#8B5CF6" stroke-width="6"/>`).join('')}</svg><div id="bus" class="a" style="width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;background:#F59E0B;display:grid;place-items:center;font-size:46px;box-shadow:0 0 0 12px rgba(245,158,11,.3),0 12px 30px rgba(0,0,0,.3)">🚌</div><div id="eta" class="a" style="left:40px;top:34px;padding:16px 26px;border-radius:18px;background:#fff;box-shadow:0 14px 40px rgba(20,18,43,.18);font-size:28px;font-weight:700">Bus 7 · arriving in <span style="color:#8B5CF6">9 min</span></div></div>`;
  P[6] = `<div style="display:flex;gap:22px"><div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:26px;font-weight:700;margin-bottom:12px">🏨 Hostel · Block A</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${Array.from({ length: 24 }, (_, i) => `<div style="height:56px;border-radius:10px;background:${[3, 9, 17, 20].includes(i) ? '#eee9fb' : '#8B5CF6'};opacity:${[3, 9, 17, 20].includes(i) ? 1 : .85}"></div>`).join('')}</div><div style="margin-top:14px;font-size:24px;color:${SUB}">20 of 24 rooms allotted</div></div>
  <div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:26px;font-weight:700;margin-bottom:16px">📚 Library</div>${[['Cost Accounting', '#8B5CF6', 'Due in 3 days'], ['Business Law', '#22D3EE', 'Returned ✓'], ['Python Basics', '#E879F9', 'Due in 9 days']].map(([n, c, d]) => `<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px"><div style="width:48px;height:68px;border-radius:6px;background:${c}"></div><div><div style="font-size:24px;font-weight:700">${n}</div><div style="font-size:21px;color:${SUB}">${d}</div></div></div>`).join('')}</div>
  <div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:26px;font-weight:700;margin-bottom:12px">💼 Placements</div><div class="cnt dsp" data-v="36" style="font-size:80px;color:#8B5CF6;line-height:1">0</div><div style="font-size:23px;color:${SUB};margin-bottom:12px">offers this year</div>${[['Infosys', 'Offer', '#16A34A'], ['Deloitte', 'Interview', '#F59E0B'], ['HDFC Bank', 'Applied', '#8B5CF6']].map(([n, s, c]) => row([`<span style="flex:1;font-weight:600">${n}</span>`, tag(s, c)], { fs: 22, p: '9px 0' })).join('')}</div></div>`;
  P[9] = `<div class="it" style="position:relative;height:520px;border-radius:24px;background:#fbfaff;border:1.5px solid #e6e1fa;overflow:hidden"><div class="a" style="inset:0;background-image:radial-gradient(#d4cdf5 2px,transparent 2px);background-size:34px 34px"></div><svg class="a" style="left:0;top:0" width="1170" height="520"><g fill="none" stroke="#8B5CF6" stroke-width="5" stroke-linecap="round"><path class="draw wf" d="M290 130 H 380 V 260 H 440"/><path class="draw wf" d="M690 260 H 760 V 130 H 810"/><path class="draw wf" d="M1010 150 V 330 H 960"/></g></svg>${[['📝', 'Leave applied', 60, 90, '#22D3EE'], ['👨‍🏫', 'HOD approves', 440, 220, '#8B5CF6'], ['🏛️', 'Principal approves', 810, 90, '#E879F9'], ['💳', 'Payroll updated', 760, 300, '#16A34A']].map(([ic, n, x, y, c]) => `<div class="it nd" style="position:absolute;left:${x}px;top:${y}px;width:260px;height:84px;border-radius:18px;background:#fff;border:2.5px solid ${c};display:flex;align-items:center;gap:14px;padding:0 20px;font-size:25px;font-weight:700;box-shadow:0 12px 30px ${c}33"><span style="font-size:36px">${ic}</span>${n}</div>`).join('')}<div class="a" id="drag" style="left:0;top:0;font-size:46px">👆</div></div>`;
  P[10] = `<div style="display:flex;gap:22px"><div class="it" style="flex:1.5;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:24px;font-weight:700">Admissions by month</div><svg width="640" height="270" viewBox="0 0 640 270"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5CF6" stop-opacity=".45"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></linearGradient></defs><path d="M10 230 L 80 190 L 150 200 L 220 120 L 290 140 L 360 70 L 430 90 L 500 40 L 570 30 L 630 20 L 630 260 L 10 260Z" fill="url(#ag)"/><path class="draw" d="M10 230 L 80 190 L 150 200 L 220 120 L 290 140 L 360 70 L 430 90 L 500 40 L 570 30 L 630 20" fill="none" stroke="#8B5CF6" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
  <div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:22px 26px"><div style="font-size:24px;font-weight:700;margin-bottom:12px">Department health</div>${[['Commerce', 92, '#16A34A'], ['Computer Sci.', 85, '#22D3EE'], ['Management', 71, '#F59E0B'], ['Arts', 64, '#E879F9']].map(([n, v, c]) => `<div style="margin-bottom:16px;font-size:22px;font-weight:600"><div style="display:flex;justify-content:space-between"><span>${n}</span><b>${v}</b></div><div style="height:16px;border-radius:8px;background:#eee9fb;overflow:hidden"><div class="hbar" style="width:${v}%;height:100%;background:${c}"></div></div></div>`).join('')}</div></div>`;
  P[7] = `<div style="display:flex;gap:30px;align-items:flex-start"><div class="it" style="flex:1.3;border-radius:22px;border:3px double #c4b5fd;padding:34px 40px;text-align:center;background:linear-gradient(#fff,#faf8ff)"><div style="font-size:23px;letter-spacing:.2em;color:${SUB};font-weight:700">DEMO COLLEGE</div><div class="dsp" style="font-size:50px;margin:10px 0 18px;color:#6D28D9">Bonafide Certificate</div><div style="font-size:26px;line-height:1.7">This is to certify that <b>Aarav Patel</b> is a bona fide student of BCom Sem 3 for the year 2026–27.</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px"><div style="width:96px;height:96px;border-radius:50%;border:5px solid #8B5CF6;display:grid;place-items:center;font-size:44px">🏫</div><div style="font-size:21px;color:${SUB}">Principal<div style="width:150px;border-top:2px solid ${INK};margin-top:30px"></div></div></div></div>
  <div class="it" style="width:330px;border-radius:26px;background:linear-gradient(160deg,#8B5CF6,#22D3EE);padding:26px;color:#fff;text-align:center;box-shadow:0 24px 50px rgba(99,102,241,.4)"><div style="font-size:21px;letter-spacing:.2em;font-weight:700">STUDENT ID</div><div style="width:130px;height:130px;border-radius:50%;background:#fff;margin:16px auto;display:grid;place-items:center;font-size:66px">🧑‍🎓</div><div style="font-size:30px;font-weight:800">Aarav Patel</div><div style="font-size:21px;opacity:.9;margin-bottom:14px">BCom · Roll 2301</div><div style="width:130px;height:130px;margin:0 auto;border-radius:12px;background:repeating-conic-gradient(#14122b 0 25%,#fff 0 50%) 0 0/26px 26px"></div></div></div>`;
  P[8] = `<div style="display:flex;gap:26px"><div class="it" style="flex:1;border-radius:22px;border:1.5px solid #e6e1fa;padding:26px 30px"><div style="font-size:23px;color:${SUB};font-weight:700">New notice</div><div style="font-size:34px;font-weight:800;margin:8px 0 14px">Mid-semester exams from 10 Nov</div><div style="display:flex;gap:12px;margin-bottom:20px">${tag('English ✓', '#7C3AED')}${tag('हिंदी ✓', '#0891B2')}${tag('ಕನ್ನಡ ✓', '#C026D3')}</div><div style="padding:16px 22px;border-radius:14px;background:#ecfdf3;border:1.5px solid #86efac;font-size:26px;font-weight:700;color:#15803d">✓ Delivered to <span class="cnt" data-v="1842">0</span> parents</div></div>
  <div style="width:430px">${[['English', 'Mid-semester exams start on 10 November.', '#7C3AED', 'Flex'], ['हिंदी', 'मध्य-सेमेस्टर परीक्षाएँ 10 नवंबर से शुरू।', '#0891B2', 'Deva'], ['ಕನ್ನಡ', 'ಮಧ್ಯಂತರ ಪರೀಕ್ಷೆಗಳು ನವೆಂಬರ್ 10 ರಿಂದ.', '#C026D3', 'Knda']].map(([l, tx, c, ff]) => `<div class="it" style="margin-bottom:16px;padding:16px 20px;border-radius:20px 20px 20px 6px;background:${c}14;border:1.5px solid ${c}55;font-family:${ff},Flex;font-size:25px;font-weight:700;line-height:1.35"><div style="font-size:17px;color:${c};margin-bottom:4px">${l}</div>${tx}</div>`).join('')}</div></div>`;
  P[11] = `<div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;padding:10px 20px">${['Timetable', 'Homework', 'LMS courses', 'Mentoring', 'Research projects', 'Question bank', 'Surveys', 'Events', 'Inventory', 'Procurement', 'Canteen', 'Alumni', 'Grievances', 'Student welfare', 'Discipline', 'Documents', 'Data import', 'Single sign-on', 'Audit trail', 'Consent (DPDP)', 'Badges', 'Polls', 'Chat', 'Broadcasts', 'Calendar', 'Reports', 'Scanning', 'Retention'].map((n, i) => `<div class="it" style="padding:14px 28px;border-radius:999px;font-size:27px;font-weight:700;color:#fff;background:${['#8B5CF6', '#22D3EE', '#E879F9', '#16A34A', '#F59E0B', '#6366F1'][i % 6]};box-shadow:0 10px 24px ${['#8B5CF6', '#22D3EE', '#E879F9', '#16A34A', '#F59E0B', '#6366F1'][i % 6]}55">${n}</div>`).join('')}</div>`;
  return P;
}
SCENES.erp = {
  accent: [99, 102, 241],
  build(cam, f, b) {
    b.win = win(cam, 230, 316, 1460, 604, 'Zynetix ERP · Demo College', { light: true });
    b.side = $(`<div class="a" style="left:0;top:0;bottom:0;width:260px;background:#f3f0ff;padding:14px 12px;overflow:hidden"></div>`, b.win.body);
    b.nav = ERP_NAV.map(([ic, n], i) => $(`<div style="padding:4px 16px;border-radius:12px;font-size:21px;font-weight:600;color:${SUB};white-space:nowrap">${ic}&nbsp; ${n}</div>`, b.side));
    b.panes = erpPanes().map(h => $(`<div class="a" style="left:290px;top:22px;width:1140px;bottom:20px;color:${INK}">${h}</div>`, b.win.body));
    b.panes.forEach(p => p.style.display = 'none');
    // admissions kanban cards live in pane 1
    const kan = b.panes[1].children; b.cards = NAMES.map((n, i) => ({ n, e: $(`<div style="position:absolute;width:196px;border-radius:14px;background:#fff;padding:12px 14px;box-shadow:0 6px 18px rgba(20,18,43,.14);font-size:21px;font-weight:700;border-left:6px solid ${['#8B5CF6', '#22D3EE', '#E879F9', '#F59E0B', '#16A34A'][i]}">${n}<div style="font-size:17px;color:${SUB};font-weight:500">BCom · Sem 1</div></div>`, b.panes[1]) }));
    b.panes[1].style.position = 'absolute';
  },
  update(t, f, b) {
    appear(b.win.g, t, f.t0(0) - .15, { dy: 80, s0: .88 });
    const idx = Math.max(0, [...Array(f.n).keys()].filter(i => t >= f.t0(i) - .05).pop() ?? 0);
    b.nav.forEach((n, i) => { const on = NAV_OF[idx].includes(i); css(n, { background: on ? '#8B5CF6' : 'transparent', color: on ? '#fff' : SUB, transform: on ? 'translateX(8px)' : 'none' }); });
    b.panes.forEach((p, i) => { const on = i === idx; p.style.display = on ? 'block' : 'none'; if (on) { const ta = f.t0(i) + .08; p.style.opacity = E.out(S(t, f.t0(i) - .05, f.t0(i) + .25)); anim(p, t, ta, i === 9 ? .35 : i === 11 ? .07 : .09); } });
    // kanban: cards march to their column as the phrase is spoken
    if (idx === 1) { const t1 = f.t0(1), d = f.t1(1) - t1; b.cards.forEach(({ e }, i) => { const prog = S(t, t1 + .4 + i * .1, t1 + d * .95) * (2 + (i % 3)) + (i === 0 ? 2 : 0); const col = Math.min(4, Math.floor(prog) + (i % 2)); const x = 6 + C(col, 0, 4) * 228 + (prog % 1) * 0, y = 70 + (i % 3) * 82 + (i > 2 ? 0 : 0);
      css(e, { left: x + 'px', top: y + 'px', opacity: E.out(S(t, t1 + .2 + i * .08, t1 + .5 + i * .08)), transition: 'none' }); }); } else b.cards.forEach(({ e }) => e.style.opacity = 0);
    // bus
    if (idx === 5) { const r = b.panes[5].querySelector('#route'), k = S(t, f.t0(5) + .2, f.t1(5) + .6), p = r.getPointAtLength(r.getTotalLength() * (.06 + .88 * k)); const bus = b.panes[5].querySelector('#bus'); css(bus, { left: p.x + 'px', top: p.y + 'px' });
      b.panes[5].querySelector('#eta span').textContent = Math.max(1, Math.round(9 * (1 - k))) + ' min'; r.style.strokeDasharray = '18 14'; r.style.strokeDashoffset = -t * 40; }
    // workflow cursor dragging a node
    if (idx === 9) { const d = b.panes[9].querySelector('#drag'), k = S(t, f.t0(9) + .2, f.t0(9) + 1.6); css(d, { left: L(120, 470, E.io(k)) + 'px', top: L(330, 250, E.io(k)) + 'px', opacity: k < 1 ? 1 : 1 - S(t, f.t0(9) + 1.7, f.t0(9) + 2) }); b.panes[9].querySelectorAll('.wf').forEach((p, i) => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len * (1 - S(t, f.t0(9) + 1.0 + i * .7, f.t0(9) + 1.6 + i * .7)); }); }
  },
  cams: [[0, 960, 540, 1], [1, 960, 540, 1.03], [3, 960, 540, 1.05], [5, 960, 540, 1.03], [9, 960, 540, 1.05]],
};

// ---- the three apps + one hub ----
const APPSCR = {
  teacher: `<div class="a" style="left:0;top:0;right:0;bottom:0;padding:62px 22px 0"><div style="font-size:26px;font-weight:700">BCom Sem 3 A</div><div style="font-size:19px;color:${SUB};margin-bottom:12px">Attendance · Period 2</div>${NAMES.concat(['Ishaan Shah', 'Meera Iyer']).map((n, i) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #eee9fb;font-size:20px;font-weight:600"><span style="flex:1">${n}</span><span class="tg" data-i="${i}" style="width:62px;text-align:center;padding:5px 0;border-radius:999px;font-size:17px;font-weight:800"></span></div>`).join('')}<div class="svb" style="position:absolute;left:22px;right:22px;bottom:24px;height:62px;border-radius:18px;background:#8B5CF6;color:#fff;text-align:center;line-height:62px;font-size:24px;font-weight:700">Save attendance</div></div>`,
  student: `<div class="a" style="left:0;top:0;right:0;bottom:0;padding:62px 22px 0"><div style="font-size:26px;font-weight:700">Hi Aarav 👋</div><div style="font-size:19px;color:${SUB};margin-bottom:14px">Today</div>${[['📘 Cost Accounting', 'Ex 4.2 · due tomorrow', '#8B5CF6'], ['💻 Python Basics', 'Lab record · Fri', '#22D3EE'], ['⚖️ Business Law', 'Case study · Mon', '#E879F9']].map(([a, b2, c]) => `<div class="it" style="padding:14px 16px;border-radius:18px;background:${c}18;border:1.5px solid ${c}55;margin-bottom:12px"><div style="font-size:21px;font-weight:700">${a}</div><div style="font-size:18px;color:${SUB}">${b2}</div></div>`).join('')}<div class="it" style="margin-top:8px;padding:16px;border-radius:18px;background:#14122b;color:#fff"><div style="font-size:18px;opacity:.7">Unit test 1</div><div class="dsp" style="font-size:44px">18 <span style="font-size:24px;opacity:.7">/ 20</span></div></div></div>`,
  parent: `<div class="a" style="left:0;top:0;right:0;bottom:0;padding:62px 22px 0"><div style="font-size:26px;font-weight:700">Aarav ▾</div><div style="font-size:19px;color:${SUB};margin-bottom:14px">BCom Sem 3 A</div><div class="it" style="display:flex;gap:16px;align-items:center;padding:16px;border-radius:18px;background:#ecfdf3;margin-bottom:12px"><div class="rg" style="width:84px;height:84px;border-radius:50%;background:conic-gradient(#16A34A 0 92%,#d1fae5 0);display:grid;place-items:center"><div style="width:62px;height:62px;border-radius:50%;background:#ecfdf3;display:grid;place-items:center;font-weight:800;font-size:20px">92%</div></div><div style="font-size:21px;font-weight:700">Attendance<div style="font-size:18px;color:${SUB};font-weight:500">Present today ✓</div></div></div><div class="it" style="padding:16px;border-radius:18px;background:#fff7ed;border:1.5px solid #fdba74;margin-bottom:12px"><div style="font-size:19px;color:${SUB}">Fee due</div><div class="dsp" style="font-size:38px">₹12,500</div><div style="margin-top:8px;display:inline-block;padding:10px 26px;border-radius:12px;background:#F59E0B;color:#fff;font-weight:700;font-size:20px">Pay now</div></div><div class="nt" style="padding:14px 16px;border-radius:18px;background:#14122b;color:#fff;font-size:19px;font-weight:600">🔔 Aarav was marked present</div></div>`,
};
SCENES.apps = {
  accent: [232, 121, 249],
  build(cam, f, b) {
    b.ph = [['teacher', 'Teacher', '#22D3EE'], ['student', 'Student', '#8B5CF6'], ['parent', 'Parent', '#E879F9']].map(([k, n, c]) => { const e = phone(cam, 0, 0, APPSCR[k]); const lb = $(`<div class="a" style="left:0;top:0;width:330px;text-align:center;font-size:34px;font-weight:700;color:${c}">${n} app</div>`, cam); return { k, e, lb, c }; });
    b.hub = $(`<div class="a" style="left:0;top:0;width:1920px;height:1080px"></div>`, cam);
    const pos = [[960, 600, 'Zynetix core', 160], [560, 430, '🖥️ Board', 96], [1360, 430, '🏫 ERP', 96], [430, 700, '👩‍🏫 Teacher', 88], [960, 810, '🧑‍🎓 Student', 80], [1490, 700, '👪 Parent', 88]];
    b.hn = pos.map(([x, y, n, r], i) => ({ x, y, e: $(`<div class="a" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;display:grid;place-items:center;text-align:center;font-weight:700;font-size:${i ? 26 : 36}px;background:${i ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#22D3EE,#8B5CF6,#E879F9)'};border:2px solid rgba(255,255,255,.25);box-shadow:0 0 60px ${i ? 'rgba(139,92,246,.35)' : 'rgba(139,92,246,.7)'}">${n}</div>`, b.hub) }));
    b.hs = $(`<svg class="a" style="left:0;top:0" width="1920" height="1080"></svg>`, b.hub); b.hub.insertBefore(b.hs, b.hub.firstChild);
    b.hs.innerHTML = b.hn.slice(1).map(n => `<line x1="960" y1="600" x2="${n.x}" y2="${n.y}" stroke="rgba(139,92,246,.6)" stroke-width="4"/>`).join('') + b.hn.slice(1).map(() => `<circle r="9" fill="#fff" style="filter:drop-shadow(0 0 10px #22D3EE)"/>`).join('');
  },
  update(t, f, b) {
    const [t0, t1, t2, t3, t4] = [0, 1, 2, 3, 4].map(i => f.t0(i));
    const focus = t >= t3 ? 2 : t >= t2 ? 1 : t >= t1 ? 0 : -1, hub = t >= t4 - .05;
    const ea = E.io(S(t, t0 - .05, t0 + .8));
    b.ph.forEach((p, i) => {
      const isF = focus === i, x0 = [470, 795, 1120][i], y0 = 250 + (i === 1 ? -10 : 14);
      const fk = E.io(S(t, [t1, t2, t3][i] - .05, [t1, t2, t3][i] + .5)), un = E.io(S(t, [t2, t3, t4][i] - .05, [t2, t3, t4][i] + .4));
      const sc = L(.7, .82, ea) * (1 + .15 * (fk - un)), dim = focus === -1 ? 1 : isF ? 1 : .35;
      const x = L(960 - 165, x0, ea) + (fk - un) * (960 - 165 - x0) * .9 + (focus >= 0 && !isF ? (i < focus ? -1 : 1) * 120 * Math.min(1, E.io(S(t, t1 - .05, t1 + .5))) : 0);
      css(p.e, { left: x + 'px', top: y0 + 'px', opacity: C(ea * 2) * dim * (1 - E.io(S(t, t4 - .05, t4 + .35))), transform: `scale(${sc}) rotate(${(1 - ea) * (i - 1) * 14}deg)`, zIndex: isF ? 5 : 1 });
      p.lb.style.display = 'none';
      if (isF || i === 1) p.e.querySelectorAll('.it').forEach((e, j) => appear(e, t, [t1, t2, t3][i] + .1 + j * .12, { dy: 24, d: .35 }));
    });
    // teacher attendance ticks flip as the phrase is spoken
    b.ph[0].e.querySelectorAll('.tg').forEach((e, j) => { const on = t > t1 + .25 + j * .22; e.textContent = on ? 'P' : 'A'; e.style.background = on ? '#dcfce7' : '#fee2e2'; e.style.color = on ? '#15803d' : '#b91c1c'; });
    const sv = b.ph[0].e.querySelector('.svb'); sv.style.background = t > t1 + 2.0 ? '#16A34A' : '#8B5CF6'; sv.textContent = t > t1 + 2.0 ? '✓ Saved' : 'Save attendance';
    const nt = b.ph[2].e.querySelector('.nt'); appear(nt, t, t3 + 1.0, { dy: 40, s0: .8 });
    // hub
    css(b.hub, { opacity: E.out(S(t, t4 - .05, t4 + .45)) });
    b.hn.forEach((n, i) => appear(n.e, t, t4 + .05 + i * .1, { dy: 0, s0: .5, d: .5 }));
    [...b.hs.querySelectorAll('circle')].forEach((c, i) => { const n = b.hn[i + 1], k = ((t * .5 + i * .17) % 1), fw = i % 2 ? k : 1 - k; c.setAttribute('cx', L(960, n.x, fw)); c.setAttribute('cy', L(600, n.y, fw)); });
  },
  cams: [[0, 960, 640, 1], [4, 960, 600, 1]],
};

// ---- closing ----
SCENES.close = {
  accent: [34, 211, 238],
  build(cam, f, b) {
    b.g = glow(cam, 960, 520, 700, '139,92,246', .5);
    b.l = ['Welcome|#22D3EE|Flex', 'स्वागत है|#E879F9|Deva', 'ಸ್ವಾಗತ|#A3E635|Knda'].map((s, i) => { const [tx, c, ff] = s.split('|'); return $(`<div class="glass" style="left:${230 + i * 520}px;top:400px;width:480px;height:250px;display:grid;place-items:center;font-size:76px;font-weight:700;font-family:${ff},Flex;color:${c};border-color:${c}99;box-shadow:0 0 60px ${c}44">${tx}</div>`, cam); });
    b.b = [['🔒', 'Private', '#8B5CF6'], ['🛡️', 'Safe · DPDP-ready', '#22D3EE'], ['🏫', 'Schools', '#A3E635'], ['🎓', 'Colleges', '#FBBF24'], ['🏛️', 'Universities', '#E879F9']].map(([ic, n, c], i) => $(`<div class="glass" style="left:${[210, 210, 120, 640, 1160][i]}px;top:${[330, 540, 760, 760, 760][i] - (i < 2 ? 0 : 0)}px;width:${i < 2 ? 700 : 480}px;height:${i < 2 ? 170 : 150}px;display:flex;align-items:center;gap:24px;padding:0 36px;font-size:${i < 2 ? 54 : 44}px;font-weight:700;border-color:${c}99;box-shadow:0 0 50px ${c}33"><span style="font-size:70px">${ic}</span>${n}</div>`, cam));
    b.b.slice(0, 2).forEach((e, i) => css(e, { left: [610, 610][i] + 'px' }));
    b.mark = $(`<svg class="a" width="200" height="200" viewBox="0 0 54 54" style="left:860px;top:190px"><rect width="54" height="54" rx="15" fill="url(#lg)"/><path d="M15 15h24L21 39h18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, cam);
    b.nm = $(`<div class="a dsp" style="left:0;width:1920px;top:410px;text-align:center;font-size:160px;letter-spacing:.14em">ZYNETIX</div>`, cam);
    b.tg = $(`<div class="a dsp grad" style="left:0;width:1920px;top:610px;text-align:center;font-size:84px">Learning, made magical.</div>`, cam);
    b.cta = $(`<div class="a" style="left:0;width:1920px;top:740px;text-align:center"><span style="display:inline-block;padding:26px 70px;border-radius:999px;font-size:48px;font-weight:700;background:linear-gradient(135deg,#22D3EE,#8B5CF6,#E879F9);box-shadow:0 0 80px rgba(139,92,246,.7)">Book your demo today</span><div style="margin-top:26px;font-size:34px;color:#B8B0E8;font-weight:600">zynetix.in</div></div>`, cam);
  },
  update(t, f, b) {
    const T = i => f.t0(i), w0 = f.ph[0].words, w1 = f.ph[1].words;
    [1, 2, 4].forEach((wi, i) => appear(b.l[i], t, w0[wi][1], { dy: 90, s0: .8 })); b.l.forEach(e => e.style.opacity *= 1 - S(t, T(1) - .02, T(1) + .25));
    [0, 1, 4, 5, 7].forEach((wi, i) => appear(b.b[i], t, w1[wi][1], { dy: 60, s0: .8, tb: T(2) - .02 }));
    const k = E.back(S(t, T(2), T(2) + .7)); css(b.mark, { opacity: C(k * 3), transform: `scale(${L(.2, 1, k)}) rotate(${L(-120, 0, E.out(S(t, T(2), T(2) + .8)))}deg)` });
    css(b.nm, { opacity: E.out(S(t, T(2) + .1, T(2) + .6)), letterSpacing: L(.5, .14, E.out(S(t, T(2), T(2) + 1))) + 'em' });
    const w2 = f.ph[2].words; b.tg.innerHTML = w2.slice(1).map(w => `<span style="opacity:${S(t, w[1], w[1] + .2)}">${w[0]}</span>`).join(' ');
    appear(b.cta, t, T(3), { dy: 40, s0: .85 }); b.cta.firstChild.style.transform = `scale(${1 + .04 * Math.sin((t - T(3)) * 5)})`;
    b.g.style.opacity = .5 + .3 * Math.sin(t * 2);
  },
  cams: [[0, 960, 540, 1], [2, 960, 540, 1.0]],
};

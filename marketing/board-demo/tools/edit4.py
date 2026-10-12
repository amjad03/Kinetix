"""v4 editor: perceptual sync first.

Rules (see RESEARCH.md / SYNC_AUDIT.md):
  * The voice is built from pieces split at every anchor word (tools/tts4.py), so anchor onsets are exact.
  * Each capture act is time-warped so its *settled* frame (UI animation finished) is on screen 0.2 s before
    the anchor word; ink acts are already drawing 0.3 s before it. Results are held >= 1.5 s.
  * One camera framing per beat; it moves only in the first 0.5 s of the beat, before any action.
  * Small UI is lifted out of the window as a live, enlarged "pop-out" card, complete before the word.
  * Montages are sequential full-window shots (one feature per shot), never 2x2 grids.
  * If an action cannot land in time the solver inserts a pause before the anchor (<= 0.3 s inside a
    sentence, <= 0.7 s at a full stop), else speeds the capture up to 3x.
Writes renders/video.mp4, renders/timeline4.json (voice pieces, sfx, anchors).

    venv/bin/python tools/edit4.py [--qa] [--parallel N] [--dry]
"""
import json, math, os, pickle, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose as C

HERE = C.HERE
FPS, W, H = 30, C.W, C.H
WX, WY, WW, WH = C.WX, C.WY, C.WW, C.WH
BEATS = json.load(open(os.path.join(HERE, 'data', 'beats4.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo4.json')))
OVR = json.load(open(os.path.join(HERE, 'data', 'rects4.json'))) if os.path.exists(os.path.join(HERE, 'data', 'rects4.json')) else {}
CHAPS = [c for c in BEATS['chapters'] if c['title']]
SHORT = ['Sign in', 'Ink', 'Smart ink', 'Pages', 'Lessons', 'AI helper', 'Class', 'Homework', 'Record', 'Comfort', 'Safe', 'Sync']
args = sys.argv[1:]
LEAD, INK_LEAD, HOLD = 0.30, 0.50, 1.5
CAPTURED = ('act', 'hl', 'tile')

# ------------------------------------------------------------------ capture index
CAPDIR = os.path.join(HERE, 'renders')
CAPMP4 = os.path.join(CAPDIR, 'capture.mp4')
cap = [json.loads(l) for l in open(os.path.join(CAPDIR, 'capture.jsonl'))]
NCAP = len(cap)
cbeats, snaps, taps = {}, {}, []
for hd in cap:
    for e in hd.get('ev', []):
        if 'beat' in e:
            cbeats[e['beat']] = {'in': hd['i'], 'acts': [], 'end': None}
        if 'beatEnd' in e and e['beatEnd'] in cbeats:
            cbeats[e['beatEnd']]['end'] = hd['i']
        if 'act' in e and e.get('beatOf') in cbeats:
            cbeats[e['beatOf']]['acts'].append({'f': hd['i'], 'ev': hd['i'], 'kind': e['kind'], 'rect': e.get('rect'), 'label': e.get('label'), 'now': e.get('now', False)})
        if 'tap' in e:
            taps.append((hd['i'], e['tap']))
for b in cbeats.values():
    if b['end'] is None:
        b['end'] = NCAP - 1


def refine():
    """First changed frame (f) and settled frame (s) of every act, from a quarter-size grey pass."""
    ck = os.path.join(CAPDIR, 'refine4.json')
    stamp = [os.path.getsize(CAPMP4), int(os.path.getmtime(CAPMP4))]
    if os.path.exists(ck):
        c = json.load(open(ck))
        if c['stamp'] == stamp:
            for bid, cb in cbeats.items():
                for j, a in enumerate(cb['acts']):
                    a['f'], a['s'] = c['r'][f'{bid}/{j}']
            return
    need = {}
    for cb in cbeats.values():
        for a in cb['acts']:
            a['d'] = {}
            for f in range(max(1, a['f'] - (4 if a['now'] else 1)), min(NCAP, a['f'] + 150)):
                need.setdefault(f, []).append(a)
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', CAPMP4, '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    prev = None
    for f in range(NCAP):
        raw = p.stdout.read(480 * 270)
        if len(raw) < 480 * 270:
            break
        cur = np.frombuffer(raw, np.uint8).reshape(270, 480).astype(np.int16)
        if prev is not None and f in need:
            for a in need[f]:
                r = a['rect'] or [0, 0, W, H]
                x0, y0, x1, y1 = r[0] // 4, r[1] // 4, (r[0] + r[2]) // 4 + 1, (r[1] + r[3]) // 4 + 1
                a['d'][f] = int(np.sum(np.abs(cur[y0:y1, x0:x1] - prev[y0:y1, x0:x1]) > 10))
                a['area'] = max(1, (y1 - y0) * (x1 - x0))
        prev = cur
    p.stdout.close(); p.wait()
    out = {}
    for bid, cb in cbeats.items():
        for j, a in enumerate(cb['acts']):
            d, area = a.pop('d'), a.get('area', 1000)
            big, small = max(3, min(0.002 * area, 12)), max(2, 0.0006 * area)
            fs = sorted(d)
            lim = min(a['ev'] + 45, cb['end'])
            f0 = next((f for f in fs if a['f'] - (3 if a['now'] else 0) <= f <= lim and d[f] >= big), a['f'])
            if a['kind'] == 'hl':
                a['f'] = a['s'] = a['ev']
                out[f'{bid}/{j}'] = [a['ev'], a['ev']]
                continue
            s = f0
            for f in range(f0, min(f0 + 40, NCAP - 4, cb['end'] - 3)):
                if all(d.get(f + k, 0) < small for k in (1, 2, 3)):
                    s = f; break
            else:
                s = f0 + 12
            s = min(s + 4, cb['end'] - 1)  # margin: past any one-frame intermediate state
            a['f'], a['s'] = f0, s
            out[f'{bid}/{j}'] = [f0, s]
    json.dump({'stamp': stamp, 'r': out}, open(ck, 'w'))


refine()

# ------------------------------------------------------------------ script <-> capture
beats = []
for ch in BEATS['chapters']:
    for b in ch['beats']:
        cb = cbeats.get(b['id'])
        ca = list(cb['acts']) if cb else []
        k = 0
        acts = []
        for j, a in enumerate(b['acts']):
            e = dict(a)
            if a['kind'] in CAPTURED:
                if k < len(ca):
                    e['cap'] = dict(ca[k], k=k)
                    ov = OVR.get(f"{b['id']}/{k}")
                    if ov:
                        e['cap']['rect'] = None if ov == 'none' else ov
                    k += 1
                else:
                    print('WARN no capture act for', b['id'], j)
            acts.append(e)
        if cb and k != len(ca):
            print(f'WARN {b["id"]}: capture has {len(ca)} acts, script uses {k}')
        beats.append({'id': b['id'], 'kind': b['kind'], 'title': b.get('title'), 'acts': acts, 'cb': cb, 'bubble': b.get('bubble'),
                      'chapter': CHAPS.index(ch) + 1 if ch['title'] else 0, 'chtitle': ch['title'], 'first_in_ch': b is ch['beats'][0]})

if '--qa' in args:
    # rect QA: settled frame of every capture act with its rect
    from PIL import ImageFont
    items = [(b['id'], j, a) for b in beats for j, a in enumerate(b['acts']) if 'cap' in a]
    fnt = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    os.makedirs(os.path.join(CAPDIR, 'qa'), exist_ok=True)
    want = {}
    for i, (bid, j, a) in enumerate(items):
        want.setdefault(min(NCAP - 1, a['cap']['s'] + 6), []).append(i)
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', CAPMP4, '-vf', 'scale=640:360', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    imgs = {}
    for f in range(NCAP):
        raw = p.stdout.read(640 * 360 * 3)
        if len(raw) < 640 * 360 * 3:
            break
        for i in want.get(f, []):
            imgs[i] = Image.frombuffer('RGB', (640, 360), raw, 'raw', 'RGB', 0, 1).copy()
    p.wait()
    for s0 in range(0, len(items), 16):
        sheet = Image.new('RGB', (4 * 640, 4 * 390), (0, 0, 0))
        d = ImageDraw.Draw(sheet)
        for q, i in enumerate(range(s0, min(len(items), s0 + 16))):
            bid, j, a = items[i]
            x, y = (q % 4) * 640, (q // 4) * 390
            if i in imgs:
                sheet.paste(imgs[i], (x, y + 30))
            r = a['cap']['rect']
            if r:
                d.rectangle([x + r[0] / 3, y + 30 + r[1] / 3, x + (r[0] + r[2]) / 3, y + 30 + (r[1] + r[3]) / 3], outline=(255, 40, 40), width=3)
            d.text((x + 4, y + 4), f"{bid}/{a['cap']['k']} {a['kind']} {a.get('label') or ''} f{a['cap']['f']} s{a['cap']['s']}", font=fnt, fill=(255, 230, 120))
        sheet.save(os.path.join(CAPDIR, 'qa', f'rects_{s0 // 16 + 1:02d}.jpg'), quality=75)
    print(len(items), 'acts')
    sys.exit(0)

# ------------------------------------------------------------------ timeline solver


def piece_times(bid, extra):
    """Offsets (s) of each voice piece inside the beat; extra[k] = pause added before piece k."""
    ps = VO[bid]
    t, out = 0.0, []
    for k, p in enumerate(ps):
        if k:
            prev = ps[k - 1]
            t += 0.30 if prev['end'] in '.?!' and prev['end'] else (0.14 if prev['end'] in ',:;' and prev['end'] else 0.06)
        t += extra.get(k, 0.0)
        out.append(t)
        t += p['dur']
    return out, t


def anchor_pieces(bid):
    return [k for k, p in enumerate(VO[bid]) if p['anchor']]


def max_pause(bid, k):
    prev = VO[bid][k - 1] if k else None
    if prev is None:
        return 0.0
    return 0.7 if prev['end'] in ('.', '?', '!', ':') and prev['end'] else 0.3


def rect_area(r):
    return r[2] * r[3] if r else W * H


def union(rs):
    rs = [r for r in rs if r]
    if not rs:
        return None
    x0 = min(r[0] for r in rs); y0 = min(r[1] for r in rs)
    x1 = max(r[0] + r[2] for r in rs); y1 = max(r[1] + r[3] for r in rs)
    return [x0, y0, x1 - x0, y1 - y0]


def view_for(rect, zmax=1.45):
    if not rect:
        return (0, 0, W, H)
    x, y, w, h = rect
    w2, h2 = w * 1.25 + 60, h * 1.25 + 60
    vw = max(w2, h2 * 16 / 9, W / zmax)
    if vw >= W * 0.88:
        return (0, 0, W, H)
    vh = vw * 9 / 16
    cx, cy = x + w / 2, y + h / 2
    return (min(max(cx - vw / 2, 0), W - vw), min(max(cy - vh / 2, 0), H - vh), vw, vh)


def tile_view(r):
    """Montage shot: frame the feature's panel large (top-aligned; a tall panel may be cut at the bottom)."""
    if not r:
        return (0, 0, W, H)
    vw = max(min(r[2] * 1.15 + 40, W), W / 1.8)
    if vw >= W * 0.88:
        return (0, 0, W, H)
    vh = vw * 9 / 16
    if r[3] < vh:
        y0 = r[1] + r[3] / 2 - vh / 2
    else:
        y0 = r[1] - 12
    x0 = r[0] + r[2] / 2 - vw / 2
    return (min(max(x0, 0), W - vw), min(max(y0, 0), H - vh), vw, vh)


def plan_beat(b):
    """Framing, pop-out card and per-act lead for a capture beat."""
    capacts = [a for a in b['acts'] if 'cap' in a]
    if b['kind'] == 'grid':
        for a in capacts:
            a['view'] = tile_view(a['cap']['rect'])
        return
    rects = [a['cap']['rect'] for a in capacts]
    u = union(rects)
    allink = capacts and all(a.get('ink') for a in capacts)
    # the camera only frames ink (the drawing area exists before the stroke); UI acts keep the full
    # window and get a pop-out card or spotlight instead, so nothing is zoomed into empty space
    b['view'] = view_for(u) if (capacts and allink) else (0, 0, W, H)
    b['card'] = None
    if u and not allink:
        v = b['view']; sx = WW / v[2]
        dw, dh = (u[2] + 32) * sx, (u[3] + 32) * sx
        sc = min(2.1, 0.80 * WW / dw, 0.66 * WH / dh)
        if sc >= 1.25 and dw < 0.55 * WW and dh < 0.6 * WH:
            b['card'] = {'rect': [u[0] - 16, u[1] - 16, u[2] + 32, u[3] + 32], 'scale': sc}


def build():
    out_beats, cards = [], []
    t = 0.4
    prev = None
    for b in beats:
        if b['first_in_ch'] and b['chapter']:
            at = (prev['E0'] if prev else t)
            cards.append({'at': at, 'num': b['chapter'], 'title': b['chtitle'], 'dur': 1.15})
            t = at + 1.15
            gate = t
        else:
            gate = prev['E0'] if prev else t
        bid = b['id']
        plan_beat(b) if b['cb'] else None
        extra = {}
        apc = anchor_pieces(bid)
        lead = [INK_LEAD if a.get('ink') else (0.35 if a['kind'] == 'tile' else LEAD if 'cap' in a else 0.25) for a in b['acts']]
        # spacing inside the beat
        for _ in range(3):
            pt, _tot = piece_times(bid, extra)
            A = [pt[k] for k in apc]
            for j in range(1, len(b['acts'])):
                a, pa = b['acts'][j], b['acts'][j - 1]
                need = 0.9
                if 'cap' in a and 'cap' in pa:
                    g = (a['cap']['s' if not a.get('ink') else 'f'] - pa['cap']['s' if not pa.get('ink') else 'f']) / FPS
                    need = max(need, g / 3.0 + (lead[j] - lead[j - 1]))
                if b['kind'] in ('grid', 'recap'):
                    need = max(need, 1.7)
                elif 'cap' in a and not a.get('ink'):
                    need = max(need, 1.6)  # each result is on screen >= 1.5 s before the next one replaces it
                short = need - (A[j] - A[j - 1])
                if short > 0.01:
                    k = apc[j]
                    add = min(short, max_pause(bid, k) - extra.get(k, 0.0))
                    if add > 0.01:
                        extra[k] = extra.get(k, 0.0) + add
        pt, tot = piece_times(bid, extra)
        A_rel = [pt[k] for k in apc]
        if b['cb']:
            S = gate
            a0 = b['acts'][0]
            pre = 0.8
            if 'cap' in a0:
                pre = max(0.9, (a0['cap']['s' if not a0.get('ink') else 'f'] - b['cb']['in']) / FPS / 3.0)
            if b['kind'] == 'grid':
                pre = 0.35
            vo_start = max(S + 0.25, S + pre + lead[0] - A_rel[0], (prev['vo_end'] + 0.25) if prev else 0)
        else:
            S = gate
            vo_start = max(S + 0.35, (prev['vo_end'] + 0.3) if prev else 0.6)
            if b['kind'] == 'explain' and b['id'] == 'i1':
                vo_start = S + 0.8
        for j, a in enumerate(b['acts']):
            a['A'] = vo_start + A_rel[j]
            a['T'] = a['A'] - lead[j]
        vo_end = vo_start + tot
        last_A = b['acts'][-1]['A'] if b['acts'] else vo_start
        E0 = max(vo_end + 0.15, last_A + HOLD + 0.1)
        if b['kind'] == 'endcard':
            E0 = vo_end + 2.6
        nb = dict(b, S=S, vo_start=vo_start, vo_end=vo_end, E0=E0, offsets=[vo_start + x for x in pt], extra=extra)
        out_beats.append(nb)
        prev = nb
    for i, b in enumerate(out_beats):
        nxt_card = next((c for c in cards if abs(c['at'] - b['E0']) < 1e-6), None)
        b['E'] = out_beats[i + 1]['S'] if i + 1 < len(out_beats) and not nxt_card else (nxt_card['at'] if nxt_card else b['E0'])
    return out_beats, cards


beats, cards = build()
TOTAL = beats[-1]['E']
NOUT = int(TOTAL * FPS) + 1
if '--dry' in args:
    for b in beats:
        print(b['id'], round(b['S'], 2), round(b['vo_start'], 2), round(b['E'], 2), 'card' if b.get('card') else '', {k: round(v, 2) for k, v in b['extra'].items()})
    print('total', round(TOTAL, 1), 'anchors', sum(len(b['acts']) for b in beats))
    sys.exit(0)

# ------------------------------------------------------------------ capture time-warp


def knots(b):
    ks = [(b['S'], b['cb']['in'])]
    for a in b['acts']:
        if 'cap' in a:
            fr = a['cap']['f'] if a.get('ink') else (a['cap']['ev'] if a['kind'] == 'hl' else a['cap']['s'])
            if fr <= ks[-1][1]:
                fr = ks[-1][1]
            ks.append((a['T'], fr))
    return ks


def cap_index(b, t):
    ks = b['_knots']
    for (T0, k0), (T1, k1) in zip(ks, ks[1:]):
        if t < T1:
            D, G = T1 - T0, (k1 - k0) / FPS
            if G <= D:
                return k0 if t < T1 - G else k1 - (T1 - t) * FPS
            if G <= 3 * D:
                return k0 + (t - T0) / D * (k1 - k0)
            st = k1 - 3 * D * FPS
            return st + (t - T0) * 3 * FPS
    T0, k0 = ks[-1]
    last = [a for a in b['acts'] if 'cap' in a]
    if last and not last[-1].get('ink'):  # the result stays on screen >= HOLD before anything moves on
        T0 += HOLD + 0.3
        if t < T0:
            return k0
    return min(b['cb']['end'], k0 + (t - T0) * FPS)


def tile_index(b, j, t):
    tl = [a for a in b['acts'] if 'cap' in a]
    a = tl[j]
    nxt = tl[j + 1]['cap']['f'] - 3 if j + 1 < len(tl) else b['cb']['end']
    return int(max(a['cap']['f'], min(max(a['cap']['s'], nxt), a['cap']['s'] + max(0.0, t - a['T'] - HOLD - 0.1) * FPS)))


for b in beats:
    if b['cb'] and b['kind'] != 'grid':
        b['_knots'] = knots(b)

# ------------------------------------------------------------------ decoding


class Decoder:
    def __init__(self):
        self.p, self.n, self.cur = None, -1, None

    def start(self, first):
        if self.p:
            self.p.kill(); self.p.wait()
        vf = ['-vf', f'select=gte(n\\,{first})', '-fps_mode', 'passthrough'] if first > 0 else []
        self.p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-threads', '2', '-i', CAPMP4, *vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.n = first - 1

    def get(self, idx):
        idx = max(0, min(NCAP - 1, int(idx)))
        if self.p is None or idx < self.n or idx - self.n > 90:
            self.start(max(0, idx - 1))
        while self.n < idx:
            raw = self.p.stdout.read(W * H * 3)
            if len(raw) < W * H * 3:
                break
            self.n += 1
            self.cur = raw
        return Image.frombuffer('RGB', (W, H), self.cur, 'raw', 'RGB', 0, 1)


def grab(f):
    pth = os.path.join(CAPDIR, f'snap4_{f}.png')
    if not os.path.exists(pth):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', CAPMP4, '-vf', f'select=eq(n\\,{f})', '-vframes', '1', pth])
    return Image.open(pth).convert('RGB')


# ------------------------------------------------------------------ drawing helpers
ease = C.ease
F = C.font


def lerp(a, b, s):
    return tuple(a[i] + (b[i] - a[i]) * s for i in range(len(a)))


def pill(text, size=21, bg=C.BLUE + (245,)):
    if any('ऀ' <= ch <= 'ॿ' for ch in text):
        fnt = C.ImageFont.truetype(os.path.join(C.FONTS, 'NotoSansDevanagari-700.ttf'), size)
    elif any('ಀ' <= ch <= '೿' for ch in text):
        fnt = C.ImageFont.truetype(os.path.join(C.FONTS, 'NotoSansKannada-700.ttf'), size)
    else:
        fnt = F(700, size)
    return C.pill(text, fnt, bg=bg, pad=(int(size * 0.8), int(size * 0.4)))


def paste_a(dst, im, xy, a=1.0):
    if a <= 0.01:
        return
    im = C.with_alpha(im, a) if a < 0.999 else im
    dst.paste(im, (int(xy[0]), int(xy[1])), im)


_shadow_cache = {}


def card_shadow(w, h):
    key = (w // 8, h // 8)
    if key not in _shadow_cache:
        pad = 40
        sh = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([pad, pad + 14, pad + w, pad + h + 14], radius=22, fill=(0, 0, 0, 150))
        _shadow_cache[key] = (sh.filter(ImageFilter.GaussianBlur(20)), pad)
    return _shadow_cache[key]


def to_win(view, x, y):
    sx = WW / view[2]
    return (x - view[0]) * sx, (y - view[1]) * sx


def draw_label_near(win, box, text, al):
    p = pill(text, 26)
    x0, y0, x1, y1 = box
    above = y0 - p.height - 14 > 6
    py = y0 - p.height - 12 if above else min(WH - p.height - 8, y1 + 12)
    px = min(max((x0 + x1) / 2 - p.width / 2, 10), WW - p.width - 10)
    paste_a(win, p, (px, py + (1 - al) * 10), al)


def outline(win, box, al, width=4):
    ImageDraw.Draw(win, 'RGBA').rounded_rectangle(box, radius=12, outline=C.CYAN + (int(240 * al),), width=width)


def dim_except(win, box, al):
    if al <= 0.01:
        return
    m = Image.new('L', (WW // 4, WH // 4), int(135 * al))
    ImageDraw.Draw(m).rounded_rectangle([box[0] / 4 - 2, box[1] / 4 - 2, box[2] / 4 + 2, box[3] / 4 + 2], radius=4, fill=0)
    m = m.filter(ImageFilter.GaussianBlur(2)).resize((WW, WH), Image.BILINEAR)
    win.paste(Image.new('RGB', (WW, WH), C.NAVY), (0, 0), m)


def avatar(kind, size):
    """Flat cartoon head-and-shoulders: 'kavya' (teacher) or 'aarav' (student)."""
    s = 4
    im = Image.new('RGBA', (size * s, size * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    R = size * s
    bg = (64, 132, 255) if kind == 'kavya' else (255, 170, 60)
    d.ellipse([0, 0, R - 1, R - 1], fill=bg + (255,))
    body = (236, 72, 120) if kind == 'kavya' else (40, 120, 220)
    d.ellipse([R * 0.16, R * 0.66, R * 0.84, R * 1.3], fill=body + (255,))
    skin = (198, 140, 100)
    d.rectangle([R * 0.43, R * 0.55, R * 0.57, R * 0.72], fill=skin + (255,))
    hair = (30, 22, 20)
    if kind == 'kavya':
        d.ellipse([R * 0.26, R * 0.16, R * 0.74, R * 0.70], fill=hair + (255,))
        d.rectangle([R * 0.26, R * 0.42, R * 0.74, R * 0.72], fill=hair + (255,))
    d.ellipse([R * 0.32, R * 0.22, R * 0.68, R * 0.62], fill=skin + (255,))
    if kind == 'aarav':
        d.chord([R * 0.30, R * 0.15, R * 0.70, R * 0.45], 180, 360, fill=hair + (255,))
    else:
        d.chord([R * 0.30, R * 0.18, R * 0.70, R * 0.44], 180, 360, fill=hair + (255,))
    for ex in (0.43, 0.57):
        d.ellipse([R * ex - R * 0.022, R * 0.39, R * ex + R * 0.022, R * 0.435], fill=(30, 30, 40, 255))
    d.arc([R * 0.43, R * 0.44, R * 0.57, R * 0.54], 20, 160, fill=(120, 40, 40, 255), width=s * 2)
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, R - 1, R - 1], fill=255)
    im.putalpha(Image.composite(im.split()[3], Image.new('L', im.size, 0), mask))
    return im.resize((size, size), Image.LANCZOS)


AV = {}


def av(kind, size):
    if (kind, size) not in AV:
        AV[(kind, size)] = avatar(kind, size)
    return AV[(kind, size)]


def bubble(f, text, al, x, y):
    """Aarav's speech bubble (student perspective)."""
    if al <= 0.01:
        return
    fnt = F(700, 28)
    tw = fnt.getlength(text)
    bw, bh = int(tw + 48), 64
    im = Image.new('RGBA', (bw + 90, bh + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([86, 0, 86 + bw, bh], radius=30, fill=(255, 255, 255, 250))
    d.polygon([(96, bh - 18), (70, bh + 8), (120, bh - 2)], fill=(255, 255, 255, 250))
    d.text((86 + 24, 14), text, font=fnt, fill=(14, 22, 44))
    a = av('aarav', 78)
    im.paste(a, (0, bh - 52), a)
    paste_a(f, im, (x - im.width, y - im.height + (1 - al) * 16), al)


# ------------------------------------------------------------------ stage scenes (intro, compare, recap)
CHALK = C.ImageFont.truetype(os.path.join(C.FONTS, 'Kalam-400.ttf'), 62)


def ink_path(pts, s):
    """Partial polyline up to fraction s."""
    if s <= 0:
        return []
    L = [0.0]
    for p, q in zip(pts, pts[1:]):
        L.append(L[-1] + math.dist(p, q))
    tgt = L[-1] * min(1, s)
    out = [pts[0]]
    for i in range(1, len(pts)):
        if L[i] <= tgt:
            out.append(pts[i])
        else:
            r = (tgt - L[i - 1]) / max(1e-6, L[i] - L[i - 1])
            out.append(lerp(pts[i - 1], pts[i], r)); break
    return out


def scene_board(f, b, t):
    """i1/i2: chalkboard -> giant tablet ('smart board')."""
    acts = b['acts']
    ap = lambda j: ease((t - acts[j]['T']) / 0.22) if j < len(acts) else 0
    bx0, by0, bx1, by1 = 380, 200, 1540, 820
    d = ImageDraw.Draw(f, 'RGBA')
    if b['id'] == 'i1':
        s = ap(0)
        sc = 0.92 + 0.08 * s
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        x0, y0, x1, y1 = cx - (cx - bx0) * sc, cy - (cy - by0) * sc, cx + (bx1 - cx) * sc, cy + (by1 - cy) * sc
        d.rounded_rectangle([x0 - 22, y0 - 22, x1 + 22, y1 + 22], radius=18, fill=(122, 82, 46, int(255 * s)))
        d.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=(34, 74, 52, int(255 * s)))
        d.rectangle([x0 + 40, y1 + 6, x1 - 40, y1 + 20], fill=(150, 110, 70, int(255 * s)))
        w = ap(1)
        if w > 0:
            txt = 'Refraction of light'
            prog = min(1, max(0, (t - acts[1]['T'] + 0.25) / 1.3))
            n = int(len(txt) * prog)
            d.text((x0 + 70, y0 + 60), txt[:n], font=CHALK, fill=(235, 235, 225, int(230 * w)))
            if prog > 0.6:
                d.text((x0 + 70, y0 + 170), 'n = sin i / sin r'[:int(16 * (prog - 0.6) / 0.4)], font=CHALK, fill=(235, 235, 225, int(200 * w)))
            rng = np.random.default_rng(int(t * 10))
            for _ in range(40):
                px, py = rng.uniform(x0, x1), rng.uniform(y1 - 120, y1)
                d.ellipse([px, py, px + 3, py + 3], fill=(240, 240, 230, int(70 * w)))
        return
    # i2: morph to a tablet
    m = ap(0)
    frame_c = lerp((122, 82, 46), (22, 24, 30), m)
    face = lerp((34, 74, 52), (250, 250, 247), m)
    d.rounded_rectangle([bx0 - 22, by0 - 22, bx1 + 22, by1 + 22], radius=int(18 + 20 * m), fill=tuple(int(v) for v in frame_c) + (255,))
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=int(8 + 14 * m), fill=tuple(int(v) for v in face) + (255,))
    if m > 0.5:
        glow = int(120 * (m - 0.5) * 2)
        d.rounded_rectangle([bx0 - 30, by0 - 30, bx1 + 30, by1 + 30], radius=40, outline=C.BLUE + (glow,), width=4)
    if m < 1:
        d.text((bx0 + 70, by0 + 60), 'Refraction of light', font=CHALK, fill=(235, 235, 225, int(230 * (1 - m))))
    w = (t - acts[1]['T'] + 0.25) / 1.6
    if w > 0:
        blue = C.BLUE + (255,)
        slab = [(760, 470), (1160, 470), (1160, 640), (760, 640), (760, 470)]
        ray = [(640, 330), (900, 470), (1000, 640), (1240, 780)]
        p1 = ink_path(slab, w * 2)
        if len(p1) > 1:
            d.line(p1, fill=blue, width=7, joint='curve')
        p2 = ink_path(ray, (w - 0.45) * 2.2)
        if len(p2) > 1:
            d.line(p2, fill=(230, 60, 80, 255), width=7, joint='curve')
        tip = (p2 or p1)[-1] if (p2 or p1) else (760, 470)
        d.text((bx0 + 70, by0 + 50), 'Refraction of light'[:int(19 * min(1, w * 1.5))], font=C.ImageFont.truetype(os.path.join(C.FONTS, 'Kalam-400.ttf'), 58), fill=(20, 40, 90, 255))
        if w < 1.4:
            C.draw_stylus(f, tip[0], tip[1], 0.0 if w < 1.2 else 0.4, -4, 1.0)
        # a tap ripple and a speech wave ("tap it, talk to it")
        tt = t - acts[1]['A']
        if 1.0 < tt < 1.6:
            k = (tt - 1.0) / 0.6
            d.ellipse([1300 - 60 * k, 300 - 60 * k, 1300 + 60 * k, 300 + 60 * k], outline=C.BLUE + (int(220 * (1 - k)),), width=5)
        if tt > 1.5:
            for i in range(5):
                hh = 18 + 26 * abs(math.sin(t * 7 + i))
                d.rounded_rectangle([1380 + i * 18, 300 - hh / 2, 1390 + i * 18, 300 + hh / 2], radius=4, fill=C.BLUE + (230,))
    if len(acts) > 2:
        s = ap(2)
        if s > 0:
            p = pill('Smart board  =  a giant touch screen for the class', 34)
            paste_a(f, p, ((W - p.width) / 2, 880 + (1 - s) * 14), s)


JOBS = [('Attendance', (120, 200, 120)), ('Slides', (255, 170, 60)), ('A quiz', (200, 120, 255)), ('Homework', (255, 110, 120))]


def scene_jobs(f, b, t):
    acts = b['acts']
    s0 = ease((t - acts[0]['T']) / 0.22)
    a = av('kavya', 220)
    paste_a(f, a, ((W - 220) / 2, 380 + (1 - s0) * 20), s0)
    clk = pill('8:30 am', 34, bg=(18, 40, 90, 240))
    paste_a(f, clk, ((W - clk.width) / 2, 640), s0)
    for j, (name, col) in enumerate(JOBS):
        s = ease((t - acts[j + 1]['T']) / 0.2)
        if s <= 0:
            continue
        ang = -math.pi / 2 + j * math.pi / 2 + 0.45 + t * 0.25
        x = W / 2 + 470 * math.cos(ang); y = 500 + 270 * math.sin(ang)
        p = pill(name, 40, bg=col + (245,))
        sc = 0.6 + 0.4 * s
        pp = p.resize((int(p.width * sc), int(p.height * sc)), Image.BILINEAR)
        paste_a(f, pp, (x - pp.width / 2, y - pp.height / 2), s)


def scene_cast(f, b, t):
    for j, (kind, name, role) in enumerate([('kavya', 'Ms Kavya', 'Science teacher'), ('aarav', 'Aarav', 'Student, Class 10 B')]):
        a = b['acts'][j]
        s = ease((t - a['T']) / 0.22)
        if s <= 0:
            continue
        cx = W / 2 + (-330 if j == 0 else 330)
        im = av(kind, 300)
        paste_a(f, im, (cx - 150, 300 + (1 - s) * 24), s)
        fn = F(700, 54)
        C.kinetic(f, name, cx - fn.getlength(name) / 2, 640, fn, (t - a['T']) * FPS + 6)
        p = pill(role, 28, bg=(18, 40, 90, 235))
        paste_a(f, p, (cx - p.width / 2, 724), s)


def scene_compare(f, b, t):
    labels = [('BEFORE', (60, 66, 84), (255, 140, 140)), ('WITH KINETIX', (20, 60, 150), C.CYAN)]
    for j, a in enumerate(b['acts']):
        s = ease((t - a['T']) / 0.25)
        if s <= 0:
            continue
        x0 = 170 if j == 0 else 990
        y0 = 330 + (1 - s) * 30
        card = Image.new('RGBA', (760, 470), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        d.rounded_rectangle([0, 0, 759, 469], radius=28, fill=labels[j][1] + (245,), outline=(255, 255, 255, 50), width=2)
        d.text((40, 36), labels[j][0], font=F(700, 30), fill=labels[j][2])
        d.text((40, 110), a['text'], font=F(700, 52), fill=(255, 255, 255))
        d.text((40, 290), a['sub'], font=F(700, 72), fill=labels[j][2])
        paste_a(f, card, (x0, y0), s)
        if j == 1:
            d2 = ImageDraw.Draw(f, 'RGBA')
            d2.polygon([(942, 540), (978, 565), (942, 590)], fill=(255, 255, 255, int(220 * s)))


def scene_logo(f, b, t, tag='It does the busywork, so teachers can teach.'):
    a = b['acts'][0]
    age = (t - a['T']) * FPS
    s = ease(age / 7)
    fl = F(700, 140)
    tw = fl.getlength('KINETIX')
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text(((W - tw) / 2, 360), 'KINETIX', font=fl, fill=C.BLUE + (int(200 * s),))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    f.paste(glow, (0, 0), glow)
    ImageDraw.Draw(f, 'RGBA').text(((W - tw) / 2, 360 + (1 - s) * 18), 'KINETIX', font=fl, fill=(255, 255, 255, int(255 * s)))
    sub = 'Board  ·  the AI smartboard'
    fs = F(500, 42)
    paste_a(f, C.text_img(sub, fs, C.CYAN), ((W - fs.getlength(sub)) / 2, 540), ease((age - 3) / 6))
    if len(b['acts']) > 1:
        a2 = b['acts'][1]
        fs2 = F(700, 44)
        paste_a(f, C.text_img(tag, fs2), ((W - fs2.getlength(tag)) / 2, 640 + (1 - ease((t - a2['T']) / 0.22)) * 12), ease((t - a2['T']) / 0.22))


# ------------------------------------------------------------------ chrome: progress bar, titles, captions
F_PROG = F(700, 15)


def progress(f, chap, t):
    d = ImageDraw.Draw(f, 'RGBA')
    n = len(CHAPS)
    gap = 6
    sw = (WW - gap * (n - 1)) / n
    y = 1067
    for k in range(n):
        x0 = WX + k * (sw + gap)
        d.rounded_rectangle([x0, y, x0 + sw, y + 5], radius=2, fill=(255, 255, 255, 34))
        if k + 1 < chap:
            d.rounded_rectangle([x0, y, x0 + sw, y + 5], radius=2, fill=C.BLUE + (200,))
        elif k + 1 == chap:
            cb = [b for b in beats if b['chapter'] == chap]
            fr = min(1, max(0, (t - cb[0]['S']) / max(1, cb[-1]['E'] - cb[0]['S'])))
            d.rounded_rectangle([x0, y, x0 + sw * fr, y + 5], radius=2, fill=C.CYAN + (255,))
    b = 'KINETIX Board'
    d.text((WX + WW - C.F_BRAND.getlength(b), 40), b, font=C.F_BRAND, fill=(255, 255, 255, 170))


F_CAP = F(700, 32)


def caption(f, b, t):
    """The piece being spoken, current word highlighted (word times from tts4, exact piece starts)."""
    for k, p in enumerate(VO[b['id']]):
        st = b['offsets'][k]
        if st - 0.05 <= t <= st + p['dur'] + 0.2:
            ws = [[w, st + s, st + e] for w, s, e in p['words']]
            if len(ws) > 9:  # split long pieces at punctuation near the middle
                cut = min(range(3, len(ws) - 2), key=lambda i: (0 if ws[i - 1][0][-1] in ',.:;?!' else 1, abs(i - len(ws) / 2)))
                ws = ws[:cut] if t < ws[cut][1] else ws[cut:]
            full = ' '.join(w[0] for w in ws)
            tw = F_CAP.getlength(full)
            x = (W - tw) / 2
            y = WY + WH + 12
            d = ImageDraw.Draw(f, 'RGBA')
            d.rounded_rectangle([x - 18, y - 4, x + tw + 18, y + 40], radius=12, fill=(4, 8, 20, 170))
            for w, s, e in ws:
                col = (150, 165, 200) if t < s else (C.CYAN if t < e else (240, 244, 255))
                d.text((x, y), w, font=F_CAP, fill=col)
                x += F_CAP.getlength(w + ' ')
            return


# ------------------------------------------------------------------ main render
SFX = []


def card_geom(b, view):
    r = b['card']['rect']
    sx = WW / view[2]
    x0, y0 = to_win(view, r[0], r[1])
    dw, dh = r[2] * sx, r[3] * sx
    sc = b['card']['scale']
    cw, ch = dw * sc, dh * sc
    cx = WW / 2 + ((x0 + dw / 2) - WW / 2) * 0.25
    cy = WH / 2 + ((y0 + dh / 2) - WH / 2) * 0.25 - 10
    cx = min(max(cx, cw / 2 + 20), WW - cw / 2 - 20)
    cy = min(max(cy, ch / 2 + 60), WH - ch / 2 - 20)
    return (x0, y0, dw, dh), (cx - cw / 2, cy - ch / 2, cw, ch)


def render_capture_beat(b, t, dec, state):
    pb = state.get('prevbeat')
    if b['kind'] == 'grid':
        tl = [a for a in b['acts'] if 'cap' in a]
        j = max([i for i, a in enumerate(tl) if a['T'] <= t] or [0])
        a = tl[j]
        idx = tile_index(b, j, t)
        board = dec.get(idx)
        view = a['view']
        k = ease((t - a['T']) / 0.3)
        z = 1.0 + 0.04 * (1 - k)
        v = (view[0] + view[2] * (1 - 1 / z) / 2, view[1] + view[3] * (1 - 1 / z) / 2, view[2] / z, view[3] / z)
        win = board.resize((WW, WH), Image.BILINEAR, box=(v[0], v[1], v[0] + v[2], v[1] + v[3]))
        if state.get('shot') != (b['id'], j):
            if state.get('shot') is not None:
                SFX.append((t, 'swish', 0.6))
            state['shot'] = (b['id'], j); state['shot_from'] = (state.get('last_win'), t)
        lf, t0 = state['shot_from']
        if lf is not None and t - t0 < 0.15:
            win = Image.blend(lf, win, (t - t0) / 0.15)
        p = pill(a['label'], 34)
        paste_a(win, p, (28, WH - p.height - 24), ease((t - a['T']) / 0.18))
        d = ImageDraw.Draw(win, 'RGBA')
        for q in range(len(tl)):
            d.ellipse([WW - 40 - (len(tl) - q) * 22, WH - 40, WW - 28 - (len(tl) - q) * 22, WH - 28], fill=(C.BLUE + (255,)) if q == j else (120, 130, 160, 200))
        return win, None
    idx = cap_index(b, t)
    board = dec.get(idx)
    hd = cap[int(idx)]
    # camera: ease from the previous framing during the first 0.5 s of the beat, then still
    v0 = pb['view'] if (pb and pb.get('view') and not b['first_in_ch']) else (0, 0, W, H)
    view = lerp(v0, b['view'], ease((t - b['S']) / 0.5))
    sx = WW / view[2]
    win = board.resize((WW, WH), Image.BILINEAR, box=(view[0], view[1], view[0] + view[2], view[1] + view[3]))
    # stylus + ripples on the board layer
    layer = win
    dd = ImageDraw.Draw(layer, 'RGBA')
    for (tf_, p) in taps:
        kk = (idx - tf_) / 10
        if 0 <= kk < 1 and b['cb']['in'] <= tf_ <= b['cb']['end']:
            x, y = to_win(view, *p)
            rr = (12 + 36 * ease(kk)) * sx
            dd.ellipse([x - rr, y - rr, x + rr, y + rr], outline=C.BLUE + (int(220 * (1 - kk)),), width=3)
    # taps -> click sfx; pen down & moving -> scratch
    pi = state.get('pidx')
    if pi is not None and int(idx) > pi:
        for (tf_, p) in taps:
            if pi < tf_ <= int(idx):
                SFX.append((t, 'click', 1.0))
        ph = cap[pi]
        if hd['h'] < 0.02 and ph['h'] < 0.02 and hd.get('v', 1):
            sp = math.dist((hd['x'], hd['y']), (ph['x'], ph['y']))
            if sp > 1.5:
                SFX.append((t, 'scratch', min(1.0, sp / 40)))
    state['pidx'] = int(idx)
    if hd.get('v', 1):
        px, py = to_win(view, hd['x'], hd['y'])
        drift = 1 if idx == int(idx) else 0
        C.draw_stylus(win, px + 2 * math.sin(t * 1.3), py + 1.5 * math.sin(t * 0.9), hd['h'], -4, sx)
    acts = [a for a in b['acts'] if 'cap' in a]
    cur = max([a for a in acts if a['T'] <= t], key=lambda a: a['T'], default=None)
    card = b.get('card')
    if card and acts:
        c_in = acts[0]['A'] - 0.42
        c_out = b['E'] - 0.22
        k = min(ease((t - c_in) / 0.3), ease((c_out - t) / 0.2)) if t >= c_in else 0
        if k > 0:
            if abs(t - c_in) < 1 / FPS / 2 + 1e-6 or (state.get('card_on') != b['id'] and t >= c_in):
                SFX.append((t, 'pop', 0.8)); state['card_on'] = b['id']
            (x0, y0, dw, dh), (cx0, cy0, cw, ch) = card_geom(b, view)
            src = win.crop((int(x0), int(y0), int(x0 + dw), int(y0 + dh)))
            bx = lerp((x0, y0, dw, dh), (cx0, cy0, cw, ch), k)
            dim = Image.new('RGB', (WW, WH), C.NAVY)
            win = Image.blend(win, dim, 0.55 * k)
            im = src.resize((max(1, int(bx[2])), max(1, int(bx[3]))), Image.BICUBIC)
            sh, pad = card_shadow(int(bx[2]), int(bx[3]))
            shr = sh.resize((int(bx[2]) + 2 * pad, int(bx[3]) + 2 * pad))
            win.paste(shr, (int(bx[0] - pad), int(bx[1] - pad)), shr)
            mask = C.rounded((im.width, im.height), 16, (255, 255, 255, 255)).split()[3]
            win.paste(im, (int(bx[0]), int(bx[1])), mask)
            outline(win, [bx[0] - 3, bx[1] - 3, bx[0] + bx[2] + 3, bx[1] + bx[3] + 3], k, 3)
            # highlight of the current act inside the card
            if cur is not None and k > 0.99:
                r = cur['cap']['rect']
                if r and (cur['kind'] == 'hl' or rect_area(r) < 0.6 * rect_area(card['rect'])):
                    q = bx[2] / dw
                    rx, ry = to_win(view, r[0], r[1])
                    box = [bx[0] + (rx - x0) * q - 4, bx[1] + (ry - y0) * q - 4, bx[0] + (rx - x0 + r[2] * sx) * q + 4, bx[1] + (ry - y0 + r[3] * sx) * q + 4]
                    outline(win, box, ease((t - cur['T']) / 0.15), 5)
            if cur is not None and cur.get('label'):
                al = ease((t - cur['T']) / 0.15) * k
                draw_label_near(win, [bx[0], bx[1], bx[0] + bx[2], bx[1] + bx[3]], cur['label'], al)
            return win, view
    if cur is not None:
        r = cur['cap']['rect']
        # stays up until the next act replaces it (no dip between acts), fades only as the beat ends
        al = min(ease((t - cur['T']) / 0.15), ease((b['E'] - 0.05 - t) / 0.15))
        if r and not cur.get('ink'):
            x0, y0 = to_win(view, r[0], r[1])
            box = [x0 - 6, y0 - 6, x0 + r[2] * sx + 6, y0 + r[3] * sx + 6]
            bw, bh = box[2] - box[0], box[3] - box[1]
            sc = min(2.4, 0.5 * WW / bw, 0.3 * WH / bh)
            if bw < 0.42 * WW and bh < 0.3 * WH and sc >= 1.3:
                # lift the small control out of the window, enlarged, over a dimmed board
                if state.get('pop') != (b['id'], cur['T']):
                    state['pop'] = (b['id'], cur['T'])
                    if t - cur['T'] < 0.1:
                        SFX.append((t, 'pop', 0.7))
                src = win.crop((int(box[0]), int(box[1]), int(box[2]), int(box[3])))
                win = Image.blend(win, Image.new('RGB', (WW, WH), C.NAVY), 0.55 * al)
                k = al
                cw, ch = bw * (1 + (sc - 1) * k), bh * (1 + (sc - 1) * k)
                cx = min(max((box[0] + box[2]) / 2, cw / 2 + 16), WW - cw / 2 - 16)
                cy = min(max((box[1] + box[3]) / 2, ch / 2 + 70), WH - ch / 2 - 16)
                im = src.resize((max(1, int(cw)), max(1, int(ch))), Image.BICUBIC)
                shd, pad = card_shadow(int(cw), int(ch))
                shd = shd.resize((int(cw) + 2 * pad, int(ch) + 2 * pad))
                win.paste(shd, (int(cx - cw / 2 - pad), int(cy - ch / 2 - pad)), shd)
                win.paste(im, (int(cx - cw / 2), int(cy - ch / 2)), C.rounded((im.width, im.height), 12, (255, 255, 255, 255)).split()[3])
                pb = [cx - cw / 2 - 3, cy - ch / 2 - 3, cx + cw / 2 + 3, cy + ch / 2 + 3]
                outline(win, pb, al, 4)
                if cur.get('label'):
                    draw_label_near(win, pb, cur['label'], al)
                return win, view
            if (box[2] - box[0]) < WW * 0.9 or (box[3] - box[1]) < WH * 0.9:
                dim_except(win, box, 0.9 * al)
                outline(win, box, al)
            if cur.get('label'):
                draw_label_near(win, box, cur['label'], al)
        elif cur.get('label'):
            p = pill(cur['label'], 30)
            paste_a(win, p, (28, WH - p.height - 24), al)
    return win, view


def main(n0=0, n1=None, out=None):
    n1 = NOUT if n1 is None else n1
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    dec = Decoder()
    state = {}
    montage = {}
    for n in range(n0, n1):
        t = n / FPS
        card = next((c for c in cards if c['at'] <= t < c['at'] + c['dur']), None)
        bi = max(i for i, b in enumerate(beats) if b['S'] <= t or i == 0)
        b = beats[bi]
        if state.get('beat') != b['id']:
            state['prevbeat'] = beats[bi - 1] if bi else None
            state['beat'] = b['id']; state['beat_from'] = (state.get('last_win'), t)
        f = C.STAGE.copy()
        chap = card['num'] if card else b['chapter']
        progress(f, chap, t)
        if card:
            age = (t - card['at']) * FPS
            k = ease(age / 9)
            if k < 1 and state.get('last_win') is not None:
                C.place_window(f, state['last_win'], scale=1 - 0.12 * k, tilt=-10 * k, alpha=1 - k, dy=20 * k)
            if abs(t - card['at']) < 0.5 / FPS:
                SFX.append((t, 'whoosh', 1.0))
            num = f'CHAPTER {card["num"]:02d}'
            fn = F(400, 30)
            C.kinetic(f, num, (W - fn.getlength(num)) / 2, 448, fn, age - 2, fill=C.CYAN)
            ft = F(700, 66)
            C.kinetic(f, card['title'], (W - ft.getlength(card['title'])) / 2, 495, ft, age - 4)
            write(ff, f)
            continue
        win = None
        for a in b['acts']:  # pop sfx for stage elements
            if a['kind'] in ('scene', 'text', 'cmp', 'logo', 'tag', 'chip', 'phone', 'mont') and abs(t - a['T']) < 0.5 / FPS:
                SFX.append((t, 'pop' if a['kind'] != 'mont' else 'swish', 0.6))
        if b['kind'] == 'explain':
            {'i1': scene_board, 'i2': scene_board, 'i3': scene_jobs, 'i5': scene_cast}[b['id']](f, b, t)
        elif b['kind'] == 'logo':
            scene_logo(f, b, t)
        elif b['kind'] == 'endcard':
            scene_logo(f, b, t, tag='Every lesson, connected.')
            b2 = dict(b, acts=[b['acts'][0], {'T': b['acts'][0]['T'] + 0.9}])
            scene_logo(f, b2, t, tag='Every lesson, connected.')
        elif b['kind'] == 'compare':
            scene_compare(f, b, t)
        elif b['kind'] == 'recap':
            j = max([i for i, a in enumerate(b['acts']) if a['T'] <= t] or [0])
            a = b['acts'][j]
            if a['src'] not in montage:
                sb = next(x for x in beats if x['id'] == a['src'])
                ca = [x for x in sb['acts'] if 'cap' in x]
                fr = (ca[-1]['cap']['s'] + 20) if ca else sb['cb']['end'] - 5
                if a['src'] == 'b123':
                    fr = sb['cb']['end'] - 2
                montage[a['src']] = grab(min(fr, NCAP - 1))
            img = montage[a['src']]
            k = (t - a['T'])
            z = 1.0 + 0.06 * min(1, max(0, k) / 2.0)
            vw, vh = W / z, H / z
            win = img.resize((WW, WH), Image.BILINEAR, box=((W - vw) / 2, (H - vh) / 2, (W + vw) / 2, (H + vh) / 2))
            if a['src'] == 'b121':  # every app in sync: the three apps over the board
                for q, nm in enumerate(['teacher-navHome.jpg', 'student-navHome.jpg', 'parent-navHome.jpg']):
                    ph = C.phone_img(nm)
                    s2 = ease((k - 0.12 * q) / 0.2)
                    paste_a(win, ph, (WW / 2 - 1.5 * (ph.width - 10) + q * (ph.width - 10), 150 + (1 - s2) * 40), s2)
            p = pill(a['label'], 40)
            paste_a(win, p, (36, WH - p.height - 30), ease(k / 0.18))
            if state.get('mshot') != j:
                state['mshot'] = j; state['mfrom'] = (state.get('last_win'), t)
            lf, t0 = state['mfrom']
            if lf is not None and t - t0 < 0.15:
                win = Image.blend(lf, win, (t - t0) / 0.15)
        else:
            win, view = render_capture_beat(b, t, dec, state)
            b['_lastview'] = view
        if win is not None:
            pbf, t0 = state['beat_from']
            entering = b['first_in_ch'] or (state.get('prevbeat') and not state['prevbeat']['cb'])
            if entering and t - b['S'] < 0.45:
                k = ease((t - b['S']) / 0.45)
                C.place_window(f, win, scale=0.9 + 0.1 * k, tilt=12 * (1 - k), alpha=k, dy=24 * (1 - k))
                if t - b['S'] < 0.5 / FPS:
                    SFX.append((t, 'whoosh', 0.6))
            else:
                if pbf is not None and t - t0 < 0.2 and b['kind'] != 'recap' and state.get('prevbeat') and state['prevbeat']['kind'] == 'grid' or (b['kind'] == 'grid' and pbf is not None and t - t0 < 0.2):
                    win = Image.blend(pbf, win, min(1, (t - t0) / 0.2))
                C.place_window(f, win)
            state['last_win'] = win
        # stage overlays: phones, chips, Aarav
        for a in b['acts']:
            if a['kind'] == 'phone' and a['T'] <= t < b['E']:
                im = C.phone_img(a['img'])
                ph = [x for x in b['acts'] if x['kind'] == 'phone']
                j = ph.index(a)
                s = ease((t - a['T']) / 0.22) * ease((b['E'] - t) / 0.3)
                x = WX + WW - (len(ph) - j) * (im.width - 10) - 10
                paste_a(f, im, (x + (1 - s) * 200, WY + 150), s)
        chips = [a for a in b['acts'] if a['kind'] == 'chip' and a['T'] <= t]
        x = WX + 30
        for a in chips:
            p = pill(a['text'], 30, bg=(14, 160, 110, 245))
            s = ease((t - a['T']) / 0.2)
            paste_a(f, p, (x, WY + 30 + (1 - s) * 12), s)
            x += p.width + 8
        if b.get('bubble'):
            a = b['acts'][b['bubble']['at']]
            s = min(ease((t - a['T']) / 0.22), ease((b['E'] - 0.1 - t) / 0.2)) if t >= a['T'] else 0
            bubble(f, b['bubble']['text'], s, WX + WW - 30, WY + WH - 40)
        if b.get('title'):
            C.kinetic(f, b['title'], WX, 58, C.F_TITLE, (t - b['S']) * FPS + 4)
            if b['chapter']:
                ImageDraw.Draw(f).text((WX + 2, 30), f'{b["chapter"]:02d}  ·  {b["chtitle"].upper()}', font=C.F_CRUMB, fill=C.CYAN)
        caption(f, b, t)
        write(ff, f)
    ff.stdin.close(); ff.wait()


def write(ff, f):
    ff.stdin.write(f.tobytes())


def chunks():
    cuts = sorted({int(math.ceil(c['at'] * FPS)) for c in cards})
    edges = [0] + [c for c in cuts if 0 < c < NOUT] + [NOUT]
    out = []
    for i in range(len(edges) - 1):  # split long chapters in two at a beat start
        a, z = edges[i], edges[i + 1]
        if z - a > 1500:
            mids = [int(math.ceil(b['S'] * FPS)) for b in beats if a + 400 < b['S'] * FPS < z - 400 and b['cb'] and b['kind'] != 'grid']
            if mids:
                m = min(mids, key=lambda x: abs(x - (a + z) / 2))
                out += [(a, m), (m, z)]; continue
        out.append((a, z))
    return out


def timeline():
    tl = {'frames': NOUT, 'total': TOTAL, 'cards': [c['at'] for c in cards],
          'pieces': [{'file': p['file'], 'at': b['offsets'][k]} for b in beats for k, p in enumerate(VO[b['id']])],
          'anchors': [{'beat': b['id'], 'kind': a['kind'], 'label': a.get('label') or a.get('text') or a.get('el') or '', 'A': round(a['A'], 3),
                       'word': VO[b['id']][anchor_pieces(b['id'])[j]]['words'][0][0]} for b in beats for j, a in enumerate(b['acts'])]}
    return tl


def parallel(workers):
    import time
    from concurrent.futures import ThreadPoolExecutor
    segdir = os.path.join(CAPDIR, 'seg')
    os.makedirs(segdir, exist_ok=True)
    rng = chunks()
    t0 = time.time()

    def run(r):
        seg = os.path.join(segdir, f'{r[0]:06d}.mp4')
        subprocess.run([sys.executable, os.path.abspath(__file__), '--seg', seg, '--n0', str(r[0]), '--n1', str(r[1])], check=True, stdout=subprocess.DEVNULL)
        print('seg', r, round(time.time() - t0), 's', flush=True)
        return seg
    with ThreadPoolExecutor(workers) as ex:
        segs = sorted(ex.map(run, sorted(rng, key=lambda r: r[0] - r[1])))
    sfx = []
    for sg in segs:
        sfx += pickle.load(open(sg + '.sfx', 'rb'))
    lst = os.path.join(segdir, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{sg}'\n" for sg in segs))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', os.path.join(CAPDIR, 'video.mp4')], check=True)
    for sg in segs:
        os.remove(sg); os.remove(sg + '.sfx')
    tl = timeline()
    tl['sfx'] = sorted(sfx)
    json.dump(tl, open(os.path.join(CAPDIR, 'timeline4.json'), 'w'), indent=0)
    print('frames', NOUT, 'seconds', round(TOTAL, 1))


if __name__ == '__main__':
    if '--seg' in args:
        seg = args[args.index('--seg') + 1]
        main(int(args[args.index('--n0') + 1]), int(args[args.index('--n1') + 1]), seg)
        pickle.dump(SFX, open(seg + '.sfx', 'wb'))
    elif '--timeline' in args:
        json.dump(timeline(), open(os.path.join(CAPDIR, 'timeline4.json'), 'w'), indent=0)
    else:
        parallel(int(args[args.index('--parallel') + 1]) if '--parallel' in args else 6)

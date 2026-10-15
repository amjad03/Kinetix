"""v5 editor: one plain, product-demo look for the board, the ERP and the apps.

Picture: always the real product. The recording sits on a quiet slate background with rounded corners and a soft
shadow (like a screen recording in a keynote), and the camera eases in on the part being talked about. Text is
limited to a small "chapter · feature" line above the recording and one line of captions below it.

Sync (same rules as the v4 board demo): the voice is made in pieces split at the anchor words (tools/tts5.py), so
each anchor's start time is exact. Every recording is time-warped so the moment that belongs to an anchor (a board
act's settled frame, a clip's mark) is on screen LEAD seconds before the word, and stays for at least HOLD seconds.

    python3 tools/edit5.py --dry              timeline only
    python3 tools/edit5.py --stills 12,80     QA stills -> renders/stills/
    python3 tools/edit5.py --parallel 4       renders/video5.mp4 (+ data/timeline5.json for the audio)
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FPS, W, H = 30, 1920, 1080
LEAD, INK_LEAD, HOLD = 0.30, 0.45, 1.4
args = sys.argv[1:]
FONTS = os.path.join(ROOT, 'packages', 'zynetix_ui', 'fonts')
BEATS = json.load(open(os.path.join(HERE, 'data', 'beats5.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo5.json')))

# ------------------------------------------------------------------ look
BG = (22, 24, 29)                      # slate
INK = (240, 241, 244)
MUTED = (150, 156, 168)
ACCENT = (96, 165, 250)                # the one accent colour (a calm blue), used sparingly
IX, IY, IW, IH = 144, 64, 1632, 918    # where a 16:9 recording sits
RAD = 18


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


F_LABEL = font('Inter-500.ttf', 26)
F_CHAP = font('Inter-500.ttf', 26)
F_CAP = font('Inter-500.ttf', 36)
F_TITLE = font('SansFlexDisplay-500.ttf', 92)
F_SUB = font('Inter-400.ttf', 36)
F_BRAND = font('SansFlexDisplay-500.ttf', 132)


def ease(s):
    s = min(1.0, max(0.0, s))
    return s * s * (3 - 2 * s)


def lerp(a, b, s):
    return a + (b - a) * s


def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    return m


def shadow(w, h, r, blur=28, alpha=150, spread=10):
    pad = blur * 3
    s = Image.new('L', (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(s).rounded_rectangle([pad - spread // 2, pad + 6, pad + w + spread // 2, pad + h + 18], r + 6, fill=alpha)
    s = s.filter(ImageFilter.GaussianBlur(blur))
    img = Image.new('RGBA', s.size, (0, 0, 0, 0))
    img.putalpha(s)
    return img, pad


STAGE = Image.new('RGB', (W, H), BG)
_g = np.linspace(0, 1, H)[:, None]
STAGE = Image.fromarray(np.clip(np.array(STAGE, np.float32) + (np.dstack([_g * 6, _g * 7, _g * 9]) - 4), 0, 255).astype(np.uint8))
SH16, SHP16 = shadow(IW, IH, RAD)
MASK16 = rounded_mask(IW, IH, RAD)
PH_H = 900                             # phone screen height on stage
PH_W = round(PH_H * 1170 / 2532)
PH_R = 58
MASKPH = rounded_mask(PH_W, PH_H, PH_R)
SHPH, SHPPH = shadow(PH_W + 28, PH_H + 28, PH_R + 14, blur=30, alpha=170)

# ------------------------------------------------------------------ sources


def ffprobe_frames(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,width,height', '-of', 'json', p], capture_output=True, text=True).stdout
    s = json.loads(out)['streams'][0]
    return int(s['nb_read_packets']), int(s['width']), int(s['height'])


CAPDIR = os.path.join(HERE, 'renders', 'board')
CAPMP4 = os.path.join(CAPDIR, 'capture.mp4')
cap = [json.loads(l) for l in open(os.path.join(CAPDIR, 'capture.jsonl'))]
NCAP = len(cap)
cbeats = {}
for hd in cap:
    for e in hd.get('ev', []):
        if 'beat' in e:
            cbeats[e['beat']] = {'in': hd['i'], 'acts': [], 'end': None}
        if 'beatEnd' in e and e['beatEnd'] in cbeats:
            cbeats[e['beatEnd']]['end'] = hd['i']
        if 'act' in e and e.get('beatOf') in cbeats:
            cbeats[e['beatOf']]['acts'].append({'f': hd['i'], 'ev': hd['i'], 'kind': e['kind'], 'rect': e.get('rect'), 'now': e.get('now', False), 'ink': False})
for b in cbeats.values():
    if b['end'] is None:
        b['end'] = NCAP - 1
# which board acts draw ink (from the v4 script that drove the capture)
for ch in json.load(open(os.path.join(HERE, '..', 'board-demo', 'data', 'beats4.json')))['chapters']:
    for b4 in ch['beats']:
        inks = [bool(a.get('ink')) for a in b4['acts'] if a['kind'] in ('act', 'hl', 'tile')]
        for a, ink in zip(cbeats.get(b4['id'], {}).get('acts', []), inks):
            a['ink'] = ink


def refine():
    """First changed (f) and settled (s) frame of every board act (from a quarter-size grey pass; cached)."""
    ck = os.path.join(CAPDIR, 'refine5.json')
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
            lim = min(a['ev'] + 45, cb['end'])
            f0 = next((f for f in sorted(d) if a['f'] - (3 if a['now'] else 0) <= f <= lim and d[f] >= big), a['f'])
            if a['kind'] == 'hl':
                out[f'{bid}/{j}'] = [a['ev'], a['ev']]; a['f'] = a['s'] = a['ev']; continue
            s = f0
            for f in range(f0, min(f0 + 40, NCAP - 4, cb['end'] - 3)):
                if all(d.get(f + k, 0) < small for k in (1, 2, 3)):
                    s = f; break
            else:
                s = f0 + 12
            s = min(s + 4, cb['end'] - 1)
            a['f'], a['s'] = f0, s
            out[f'{bid}/{j}'] = [f0, s]
    json.dump({'stamp': stamp, 'r': out}, open(ck, 'w'))


refine()


def clip_info(src):
    """A recorded clip: 'v3d/x', 'erp/x', 'apps/x' -> path, frames, size, marks, rects."""
    grp, name = src.split('/', 1)
    p = os.path.join(HERE, grp, 'clips', name + '.mp4')
    meta = json.load(open(os.path.join(HERE, grp, 'clips', name + '.json')))
    n, w, h = ffprobe_frames(p)
    return {'path': p, 'n': n, 'w': w, 'h': h, 'marks': meta.get('marks', []), 'rects': meta.get('rects', []), 'phone': h > w, 'grp': grp}


# ------------------------------------------------------------------ beats -> units with anchors
units = []      # one per beat
chap_of = {}
for ci, ch in enumerate(BEATS['chapters']):
    for bi, b in enumerate(ch['beats']):
        u = {'id': b['id'], 'kind': b['kind'], 'label': b.get('label'), 'chap': ch.get('title') or '', 'first': bi == 0, 'b': b, 'anchors': []}
        if b['kind'] == 'board':
            cb = cbeats[b['src']]
            u.update(path=CAPMP4, src_in=cb['in'], src_end=cb['end'], phone=False, grp='board')
            for a in cb['acts']:
                u['anchors'].append({'f': a['f'], 's': a['s'], 'ink': a['ink'], 'rect': a['rect'], 'hl': a['kind'] == 'hl'})
        elif b['kind'] in ('clip', 'app', 'erp'):
            ci_ = clip_info(b['src'])
            u.update(path=ci_['path'], src_in=0, src_end=ci_['n'] - 1, phone=ci_['phone'], grp=ci_['grp'], srcw=ci_['w'], srch=ci_['h'])
            ms = ci_['marks']
            idx = b.get('m') or list(range(b['vo'].count('^')))
            for k in idx:
                m = ms[min(k, len(ms) - 1)] if ms else {'t': 0.5}
                fr = min(ci_['n'] - 1, int(round(m['t'] * FPS)))
                rect = None
                for r in ci_['rects']:
                    if abs(r['t'] - m['t']) < 0.6:
                        rect = [r['x'], r['y'], r['w'], r['h']]
                u['anchors'].append({'f': max(0, fr - 6), 's': fr, 'ink': False, 'rect': rect, 'hl': False})
            if ci_['grp'] == 'v3d':
                u['fixed_view'] = (300, 60, 1320, 1320 * 9 / 16)      # the 3D model fills the frame
        u['n_anchor_words'] = b.get('vo', '').count('^')
        units.append(u)

# a board beat whose capture has fewer acts than the voice has anchors (b83, b123): spread the anchors evenly
for u in units:
    na = u['n_anchor_words']
    if u['kind'] == 'board' and len(u['anchors']) < na:
        span = u['src_end'] - u['src_in']
        u['anchors'] = [{'f': u['src_in'] + int(span * (k + .5) / na), 's': u['src_in'] + int(span * (k + .6) / na), 'ink': False, 'rect': None, 'hl': True} for k in range(na)]
    if len(u['anchors']) > na:
        u['anchors'] = u['anchors'][:na]

# ------------------------------------------------------------------ timeline solver


def pieces(bid):
    return VO.get(bid, [])


def piece_times(bid, extra):
    ps = pieces(bid)
    t, out = 0.0, []
    for k, p in enumerate(ps):
        if k:
            e = ps[k - 1]['end']
            t += 0.30 if e in ('.', '?', '!') else (0.14 if e in (',', ':', ';') else 0.06)
        t += extra.get(k, 0.0)
        out.append(t)
        t += p['dur']
    return out, t


def max_pause(bid, k):
    if not k:
        return 0.0
    return 0.8 if pieces(bid)[k - 1]['end'] in ('.', '?', '!', ':') else 0.35


def view_for(rect, zmax=1.55):
    if not rect:
        return (0, 0, W, H)
    x, y, w, h = rect
    vw = max(w * 1.3 + 80, (h * 1.3 + 80) * 16 / 9, W / zmax)
    if vw >= W * 0.86:
        return (0, 0, W, H)
    vh = vw * 9 / 16
    cx, cy = x + w / 2, y + h / 2
    return (min(max(cx - vw / 2, 0), W - vw), min(max(cy - vh / 2, 0), H - vh), vw, vh)


def build():
    t = 0.3
    prev = None
    for u in units:
        bid = u['id']
        if u['kind'] == 'card':
            u.update(S=t, vo_start=t + 0.5, vo_end=t + 0.5, E=t + 2.4, offsets=[], A=[])
            if u['b'].get('vo'):
                pt, tot = piece_times(bid, {})
                u['vo_start'] = t + 0.6; u['vo_end'] = u['vo_start'] + tot; u['offsets'] = [u['vo_start'] + x for x in pt]; u['E'] = max(u['E'], u['vo_end'] + 0.4)
            t = u['E']; prev = u
            continue
        apc = [k for k, p in enumerate(pieces(bid)) if p['anchor']]
        anc = u['anchors']
        lead = [INK_LEAD if a['ink'] else LEAD for a in anc]
        extra = {}
        for _ in range(3):
            pt, _tot = piece_times(bid, extra)
            A = [pt[k] for k in apc]
            for j in range(1, len(anc)):
                g = (anc[j]['s'] - anc[j - 1]['s']) / FPS
                need = max(1.0 if anc[j]['ink'] else 1.3, g / 3.0 + lead[j] - lead[j - 1])
                short = need - (A[j] - A[j - 1])
                if short > 0.01:
                    k = apc[j]
                    add = min(short, max_pause(bid, k) - extra.get(k, 0.0))
                    if add > 0.01:
                        extra[k] = extra.get(k, 0.0) + add
        pt, tot = piece_times(bid, extra)
        A_rel = [pt[k] for k in apc]
        S = t
        gap = 0.45 if u['first'] else 0.22
        if anc:
            pre = max(0.8, (anc[0]['s'] - u['src_in']) / FPS / 3.0) if 'src_in' in u else 0.6
            vo_start = max(S + 0.3, S + pre + lead[0] - A_rel[0], (prev['vo_end'] + gap) if prev else 0)
        else:
            vo_start = max(S + 0.35, (prev['vo_end'] + gap) if prev else 0.6)
        u['A'] = [vo_start + x for x in A_rel]
        for j, a in enumerate(anc):
            a['A'] = u['A'][j]
            a['T'] = a['A'] - lead[j]
        vo_end = vo_start + tot
        last = u['A'][-1] if u['A'] else vo_start
        E = max(vo_end + 0.25, last + HOLD + 0.1)
        if u['kind'] == 'brand':
            E = vo_end + 0.6
        if u['b'].get('hold'):
            E += u['b']['hold']
        u.update(S=S, vo_start=vo_start, vo_end=vo_end, E=E, offsets=[vo_start + x for x in pt], extra=extra)
        t = E
        prev = u
    return t


TOTAL = build() + 0.5
NOUT = int(TOTAL * FPS)

# ------------------------------------------------------------------ time-warp: output time -> source frame


def knots(u):
    ks = [(u['S'], u['src_in'])]
    for a in u['anchors']:
        fr = a['f'] if a['ink'] else a['s']
        fr = max(fr, ks[-1][1])
        T = max(a['T'], ks[-1][0] + 0.05)
        ks.append((T, fr))
    return ks


def src_index(u, t):
    ks = u['_knots']
    for (T0, k0), (T1, k1) in zip(ks, ks[1:]):
        if t < T1:
            D, G = T1 - T0, (k1 - k0) / FPS
            if G <= D:                       # real time, waiting at the start
                return k0 if t < T1 - G else k1 - (T1 - t) * FPS
            if G <= 3 * D:                   # sped up to fit
                return k0 + (t - T0) / D * (k1 - k0)
            st = k1 - 3 * D * FPS            # cut: start at 3x from where it can still arrive in time
            return st + (t - T0) * 3 * FPS
    T0, k0 = ks[-1]
    T0 += HOLD
    if t < T0:
        return k0
    return min(u['src_end'], k0 + (t - T0) * FPS)


for u in units:
    if 'src_in' in u:
        u['_knots'] = knots(u)


# camera: eases to each anchor's framing just before its action starts; ink and small UI get a closer look
def cam_keys(u):
    if u.get('fixed_view'):
        return [(u['S'], u['fixed_view'])]
    ks = [(u['S'], (0, 0, W, H))]
    for a in u['anchors']:
        v = view_for(a['rect'], zmax=1.6 if a['ink'] else 1.45) if (a['rect'] and not u.get('phone')) else (0, 0, W, H)
        if a['rect'] and not a['ink'] and a['rect'][2] * a['rect'][3] > 0.2 * W * H:
            v = (0, 0, W, H)
        # time the action starts (source reaches 'f')
        tf = a['T'] - 0.4
        ks.append((tf, v))
    return ks


def cam_at(u, t):
    ks = u['_cam']
    v = ks[0][1]
    for (t1, v1) in ks[1:]:
        if t < t1 - 0.75:
            break
        s = ease((t - (t1 - 0.75)) / 0.75)
        v = tuple(lerp(a, b, s) for a, b in zip(v, v1))
    return v


for u in units:
    u['_cam'] = cam_keys(u)

# ------------------------------------------------------------------ captions


def caption_chunks(u):
    """Caption lines (<= 52 chars) with their times, from the voice pieces' word times."""
    out = []
    for off, p in zip(u.get('offsets', []), pieces(u['id'])):
        for w, s, e in p['words']:
            out.append((w, off + s, off + e))
    lines, cur = [], []
    for w in out:
        txt = ' '.join(x[0] for x in cur + [w])
        if cur and (len(txt) > 52 or cur[-1][0][-1] in '.?!'):
            lines.append(cur); cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return [(' '.join(x[0] for x in l), l[0][1], l[-1][2]) for l in lines]


for u in units:
    u['_caps'] = caption_chunks(u)

# ------------------------------------------------------------------ decoding


class Decoder:
    def __init__(self):
        self.path = None; self.p = None; self.pos = -1; self.img = None; self.size = None

    def get(self, path, idx, size):
        idx = int(idx)
        if path != self.path or idx < self.pos or idx > self.pos + 90:
            self.open(path, idx, size)
        while self.pos < idx:
            raw = self.p.stdout.read(self.size[0] * self.size[1] * 3)
            if len(raw) < self.size[0] * self.size[1] * 3:
                break
            self.pos += 1
            self.img = raw
        return Image.frombuffer('RGB', self.size, self.img, 'raw', 'RGB', 0, 1)

    def open(self, path, idx, size):
        if self.p:
            self.p.kill()
        self.path, self.size = path, size
        self.p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-ss', f'{idx / FPS:.4f}', '-i', path, '-vf', f'scale={size[0]}:{size[1]}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, bufsize=10 ** 8)
        self.pos = idx - 1
        raw = self.p.stdout.read(size[0] * size[1] * 3)
        self.pos += 1
        self.img = raw if raw else bytes(size[0] * size[1] * 3)


DEC = {}


def grab(u, idx):
    key = u['path']
    d = DEC.setdefault(key, Decoder())
    size = (W, H) if not u.get('phone') else (1170, 2532)
    return d.get(u['path'], max(0, min(idx, u['src_end'])), size)


# ------------------------------------------------------------------ drawing


TXT = {}


def text_img(s, fnt, fill):
    k = (s, id(fnt), fill)
    if k not in TXT:
        bb = fnt.getbbox(s)
        im = Image.new('RGBA', (bb[2] - bb[0] + 4, bb[3] - bb[1] + 8), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((-bb[0] + 2, -bb[1] + 4), s, font=fnt, fill=fill)
        TXT[k] = im
    return TXT[k]


def paste_a(dst, im, xy, a):
    if a <= 0:
        return
    if a < 1:
        im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * a)))
    dst.paste(im, (int(xy[0]), int(xy[1])), im)


def place16(frame, src, view):
    x, y, w, h = view
    im = src.crop((int(x), int(y), int(x + w), int(y + h))).resize((IW, IH), Image.BICUBIC) if (w, h) != (W, H) else src.resize((IW, IH), Image.BICUBIC)
    frame.paste(SH16, (IX - SHP16, IY - SHP16), SH16)
    frame.paste(im, (IX, IY), MASK16)


def place_phone(frame, src, x_center):
    x = int(x_center - PH_W / 2); y = int((H - PH_H) / 2) - 6
    frame.paste(SHPH, (x - 14 - SHPPH, y - 14 - SHPPH), SHPH)
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([x - 14, y - 14, x + PH_W + 14, y + PH_H + 14], PH_R + 14, fill=(8, 8, 10), outline=(70, 72, 80), width=2)
    frame.paste(src.resize((PH_W, PH_H), Image.BICUBIC), (x, y), MASKPH)


STILL = {}


def still(name):
    if name not in STILL:
        STILL[name] = Image.open(os.path.join(HERE, 'stills', name)).convert('RGB')
    return STILL[name]


def draw_brand(frame, s=1.0):
    mark = 120
    cx, cy = W // 2, H // 2 - 40
    tw = text_img('Zynetix', F_BRAND, INK)
    total = mark + 36 + tw.width
    x0 = cx - total // 2
    m = Image.new('RGBA', (mark, mark), (0, 0, 0, 0))
    dd = ImageDraw.Draw(m)
    dd.rounded_rectangle([0, 0, mark - 1, mark - 1], 30, fill=ACCENT + (255,))
    k = mark / 54
    dd.line([(15 * k, 15 * k), (39 * k, 15 * k), (21 * k, 39 * k), (39 * k, 39 * k)], fill=(255, 255, 255, 255), width=int(5 * k), joint='curve')
    paste_a(frame, m, (x0, cy - mark // 2), s)
    paste_a(frame, tw, (x0 + mark + 36, cy - tw.height // 2 - 6), s)


def render_unit(frame, u, t):
    k = u['kind']
    if k == 'card':
        a = min(ease((t - u['S']) / 0.4), ease((u['E'] - t) / 0.4))
        ti = text_img(u['b']['title'], F_TITLE, INK)
        paste_a(frame, ti, ((W - ti.width) / 2, H / 2 - ti.height + 6 + (1 - a) * 12), a)
        if u['b'].get('sub'):
            su = text_img(u['b']['sub'], F_SUB, MUTED)
            paste_a(frame, su, ((W - su.width) / 2, H / 2 + 34), a)
        return
    if k == 'brand':
        shots = u['b']['shots']
        j = max([i for i, A in enumerate(u['A']) if t >= A - 0.35] or [0])
        if shots[j] == 'brand':
            draw_brand(frame, ease((t - u['S']) / 0.5))
        else:
            src = still(shots[j] + '.jpg')
            if src.height > src.width:
                place_phone(frame, src, W / 2)
            else:
                place16(frame, src, (0, 0, W, H))
        return
    if k == 'end':
        draw_brand(frame, ease((t - u['S']) / 0.6))
        su = text_img(u['b'].get('sub', ''), F_SUB, MUTED)
        paste_a(frame, su, ((W - su.width) / 2, H / 2 + 60), ease((t - u['S'] - 0.4) / 0.6))
        return
    idx = src_index(u, t)
    src = grab(u, idx)
    if u.get('phone'):
        place_phone(frame, src, W / 2)
    else:
        place16(frame, src, cam_at(u, t))


def draw_chrome(frame, u, t):
    if u['kind'] in ('card', 'brand', 'end') and not u.get('label'):
        pass
    # chapter · feature, above the recording
    if u['kind'] not in ('card', 'brand', 'end') and (u['chap'] or u['label']):
        a = ease((t - u['S']) / 0.35) * ease((u['E'] - t) / 0.25 + 0.2)
        x = IX + 4
        if u['chap']:
            ci = text_img(u['chap'].upper() if False else u['chap'], F_CHAP, MUTED)
            paste_a(frame, ci, (x, 18), a); x += ci.width + 14
        if u['label']:
            if u['chap']:
                dot = text_img('·', F_CHAP, MUTED); paste_a(frame, dot, (x, 18), a); x += dot.width + 14
            li = text_img(u['label'], F_LABEL, INK)
            paste_a(frame, li, (x, 18), a)
    # captions below the recording
    for txt, s, e in u.get('_caps', []):
        if s - 0.08 <= t <= e + 0.35:
            a = min(ease((t - s + 0.08) / 0.12), ease((e + 0.35 - t) / 0.15))
            ci = text_img(txt, F_CAP, INK)
            paste_a(frame, ci, ((W - ci.width) / 2, IY + IH + 22), a)
            break


def unit_at(t):
    for i, u in enumerate(units):
        if u['S'] <= t < u['E']:
            return i
    return len(units) - 1


XF = 0.22   # cross-dissolve between beats


def frame_at(f):
    t = f / FPS
    i = unit_at(t)
    u = units[i]
    fr = STAGE.copy()
    render_unit(fr, u, t)
    if i > 0 and t < u['S'] + XF and units[i - 1]['kind'] not in ('card',) and u['kind'] not in ('card',):
        prev = STAGE.copy()
        render_unit(prev, units[i - 1], min(t, units[i - 1]['E'] - 1 / FPS))
        fr = Image.blend(prev, fr, ease((t - u['S']) / XF))
    draw_chrome(fr, u, t)
    return fr


# ------------------------------------------------------------------ output


def timeline_json():
    tl = {'total': TOTAL, 'units': []}
    for u in units:
        tl['units'].append({'id': u['id'], 'kind': u['kind'], 'S': u['S'], 'E': u['E'], 'first': u['first'],
                            'pieces': [{'file': p['file'], 'at': off} for p, off in zip(pieces(u['id']), u.get('offsets', []))],
                            'A': u.get('A', [])})
    json.dump(tl, open(os.path.join(HERE, 'data', 'timeline5.json'), 'w'), indent=1)


def render_range(f0, f1, out):
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(f0, f1):
        ff.stdin.write(frame_at(f).tobytes())
        if f % 300 == 0:
            print(out[-12:], f, '/', f1, flush=True)
    ff.stdin.close(); ff.wait()


if __name__ == '__main__':
    timeline_json()
    if '--dry' in args:
        for u in units:
            print(f"{u['id']:6} {u['kind']:6} S={u['S']:7.2f} vo={u['vo_start']:7.2f}-{u['vo_end']:7.2f} E={u['E']:7.2f} extra={ {k: round(v, 2) for k, v in u.get('extra', {}).items()} }")
        print('total', round(TOTAL, 1), 's')
        sys.exit(0)
    if '--stills' in args:
        os.makedirs(os.path.join(HERE, 'renders', 'stills'), exist_ok=True)
        for s in args[args.index('--stills') + 1].split(','):
            frame_at(int(float(s) * FPS)).save(os.path.join(HERE, 'renders', 'stills', f'{s}.jpg'), quality=88)
        sys.exit(0)
    if '--range' in args:
        a, b, out = args[args.index('--range') + 1].split(':')
        render_range(int(a), int(b), out)
        sys.exit(0)
    n = int(args[args.index('--parallel') + 1]) if '--parallel' in args else 1
    os.makedirs(os.path.join(HERE, 'renders', 'parts'), exist_ok=True)
    # chunk boundaries on beat starts keep each worker's decoders sequential
    cuts = [0] + [int(u['S'] * FPS) for u in units[1:]] + [NOUT]
    target = NOUT / (n * 3)
    chunks, s = [], 0
    for c in cuts[1:]:
        if c - s >= target or c == NOUT:
            chunks.append((s, c)); s = c
    procs, parts = [], []
    for i, (a, b) in enumerate(chunks):
        out = os.path.join(HERE, 'renders', 'parts', f'p{i:03d}.mp4')
        parts.append(out)
        if os.path.exists(out) and '--resume' in args:
            continue
        while len([p for p in procs if p.poll() is None]) >= n:
            import time; time.sleep(0.5)
        procs.append(subprocess.Popen([sys.executable, __file__, '--range', f'{a}:{b}:{out}']))
    for p in procs:
        p.wait()
    lst = os.path.join(HERE, 'renders', 'parts', 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(HERE, 'renders', 'video5.mp4')], check=True)
    print('video', os.path.join(HERE, 'renders', 'video5.mp4'), round(TOTAL, 1), 's')

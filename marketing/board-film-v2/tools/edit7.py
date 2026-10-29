"""v7 board film editor (Before/After), built on the v5 capture index, sync solver and time-warp.
v5 notes follow: one plain, product-demo look for the board, the ERP and the apps.

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
LEAD, INK_LEAD, HOLD = 0.30, 0.45, 1.9
args = sys.argv[1:]
FONTS = os.path.join(ROOT, 'packages', 'zynetix_ui', 'fonts')
BEATS = json.load(open(os.path.join(HERE, 'data', 'beats7.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo7.json')))

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
F_PHT = font('SansFlexDisplay-500.ttf', 76)


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
    ck = os.path.join(CAPDIR, 'refine7.json')
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
    p = os.path.join(HERE, '..', 'demo-v5', grp, 'clips', name + '.mp4')
    meta = json.load(open(os.path.join(HERE, '..', 'demo-v5', grp, 'clips', name + '.json')))
    n, w, h = ffprobe_frames(p)
    return {'path': p, 'n': n, 'w': w, 'h': h, 'marks': meta.get('marks', []), 'rects': meta.get('rects', []), 'phone': h > w, 'grp': grp}


# ------------------------------------------------------------------ beats -> units with anchors
units = []      # one per beat
chap_of = {}
for ci, ch in enumerate(BEATS['chapters']):
    for bi, b in enumerate(ch['beats']):
        u = {'id': b['id'], 'kind': b['kind'], 'label': b.get('title'), 'ci': ci, 'chap': ch.get('title') or '', 'first': bi == 0, 'b': b, 'anchors': []}
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
                u['fixed_view'] = (180, 120, 1560, 1560 * 9 / 16)      # the 3D model fills the frame
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
            pre = max(0.45, (anc[0]['s'] - u['src_in']) / FPS / 3.0) if 'src_in' in u else 0.6
            vo_start = max(S + 0.3, S + pre + lead[0] - A_rel[0], (prev['vo_end'] + gap) if prev else 0)
        else:
            vo_start = max(S + 0.35, (prev['vo_end'] + gap) if prev else 0.6) + u['b'].get('pre', 0.0)
            if u['kind'] in ('black', 'still', 'plate'):
                vo_start += 0.5
        u['A'] = [vo_start + x for x in A_rel]
        for j, a in enumerate(anc):
            a['A'] = u['A'][j]
            a['T'] = a['A'] - lead[j]
        vo_end = vo_start + tot
        last = u['A'][-1] if u['A'] else vo_start
        E = max(vo_end + 0.7, last + HOLD + 0.1)
        if u['kind'] in ('black', 'still'):
            E = vo_end + 1.6 if pieces(bid) else S + u['b'].get('hold', 4.0)
        if u['kind'] == 'plate':
            E = vo_end + 1.6
        if u['kind'] == 'logo':
            E = S + u['b'].get('hold', 2.4)
        if u['kind'] == 'end':
            E = vo_end + 3.2
        if u['b'].get('hold'):
            E += u['b']['hold']
        u.update(S=S, vo_start=vo_start, vo_end=vo_end, E=E, offsets=[vo_start + x for x in pt], extra=extra)
        t = E
        prev = u
    return t


TOTAL = build() + 1.0
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


def unit_at(t):
    for i, u in enumerate(units):
        if u['S'] <= t < u['E']:
            return i
    return len(units) - 1



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



# ================================================================== v7 look
FILM = os.path.join(HERE, 'fonts')
F_SERIF = ImageFont.truetype(os.path.join(FILM, 'InstrumentSerif-Regular.ttf'), 76)
F_SERIF_I = ImageFont.truetype(os.path.join(FILM, 'InstrumentSerif-Italic.ttf'), 46)
F_TTL = ImageFont.truetype(os.path.join(FILM, 'InstrumentSerif-Regular.ttf'), 58)
F_WORD = font('SansFlexDisplay-500.ttf', 140)
F_SMALL = font('Inter-500.ttf', 30)
INK = (244, 242, 236)
WARM = (236, 196, 140)
BLACK = Image.new('RGB', (W, H), (0, 0, 0))
CANVA = os.path.join(HERE, 'canva')
rng = np.random.default_rng(1)
GRAIN = [(rng.standard_normal((H // 2, W // 2)) * 7).astype(np.float32) for _ in range(6)]
ACT_OF = {}
for ch in BEATS['chapters']:
    for b in ch['beats']:
        ACT_OF[b['id']] = ch['id']

IMG = {}


def photo(name, grade):
    k = (name, grade)
    if k not in IMG:
        im = Image.open(os.path.join(CANVA, name + '.jpg')).convert('RGB').resize((W, H), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32)
        lum = a.mean(axis=2, keepdims=True)
        if grade == 'cold':
            a = a * 0.72 + lum * 0.28                       # less colour
            a = a * np.array([0.90, 0.98, 1.08]) + np.array([2, 6, 12])
            a = (a - 128) * 0.94 + 122                     # softer contrast, lifted blacks
        else:
            a = a * 0.92 + lum * 0.0
            a = a * np.array([1.06, 1.0, 0.90]) + np.array([6, 2, -4])
            a = (a - 128) * 1.04 + 130
        IMG[k] = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return IMG[k]


def grain(frame, f, amt=1.0):
    g = GRAIN[f % len(GRAIN)]
    gi = Image.fromarray(np.clip(g * amt + 128, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    return Image.fromarray(np.clip(np.asarray(frame).astype(np.int16) + (np.asarray(gi).astype(np.int16) - 128)[..., None], 0, 255).astype(np.uint8))


VIG = None


def vignette(frame, s=0.42):
    global VIG
    if VIG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        VIG = Image.fromarray((np.clip((d - 0.55) / 0.9, 0, 1) ** 1.6 * 255).astype(np.uint8))
    frame.paste((0, 0, 0), (0, 0), VIG.point(lambda v: int(v * s)))


def kenburns(im, k, move):
    """k: 0..1 through the shot."""
    k = ease(k) * 0.6 + k * 0.4
    if move == 'push':
        z, ox, oy = 1.0 + 0.11 * k, 0, -10 * k
    elif move == 'pull':
        z, ox, oy = 1.12 - 0.10 * k, 0, 0
    else:  # pan
        z, ox, oy = 1.10, -90 + 180 * k, 0
    w, h = W / z, H / z
    x0 = (W - w) / 2 - ox / z
    y0 = (H - h) / 2 - oy / z
    return im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))


SCREEN = {}


def screen_box(name):
    """The bright display in a classroom photo: its bounding box and a soft mask of the screen pixels (so hands or
    pens in front of it stay in front)."""
    if name not in SCREEN:
        a = np.asarray(Image.open(os.path.join(CANVA, name + '.jpg')).convert('L').resize((W, H))).astype(np.float32)
        m = a > 225
        ys, xs = np.where(m[: int(H * 0.8)])
        # the largest bright block: take rows/cols with many bright pixels
        rows = np.where(m.sum(axis=1) > W * 0.12)[0]
        cols = np.where(m.sum(axis=0) > H * 0.12)[0]
        x0, x1, y0, y1 = cols.min(), cols.max(), rows.min(), rows.max()
        soft = np.clip((a - 200) / 35, 0, 1)
        box = np.zeros_like(soft); box[y0:y1, x0:x1] = 1
        mk = Image.fromarray((soft * box * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        SCREEN[name] = ((int(x0), int(y0), int(x1), int(y1)), mk)
    return SCREEN[name]


CAPFRAMES = {}


def cap_frame(beat, k):
    """A frame from a board capture beat, k seconds in (looping the beat)."""
    cb = cbeats[beat]
    n = max(1, cb['end'] - cb['in'])
    idx = cb['in'] + int(k * FPS) % n
    u = {'path': CAPMP4, 'src_end': NCAP - 1}
    return grab(u, idx)


def home_frame():
    if 'home' not in CAPFRAMES:
        cb = cbeats['b16']
        CAPFRAMES['home'] = grab({'path': CAPMP4, 'src_end': NCAP - 1}, cb['in'] + 20).copy()
    return CAPFRAMES['home']


def plate(frame, u, t):
    b = u['b']
    im = photo(b['img'], 'warm')
    k = (t - u['S']) / max(1, u['E'] - u['S'])
    base = kenburns(im, k, 'push' if b['img'] == 'plate' else 'pull')
    (x0, y0, x1, y1), mk = screen_box(b['img'])
    scr_src = home_frame() if b['screen'] == 'home' else cap_frame(b['screen'], t - u['S'])
    # place the screen into the photo, then apply the same camera move to both
    comp = im.copy()
    scr = scr_src.resize((x1 - x0, y1 - y0), Image.BICUBIC)
    on = 1.0
    if b['id'] == 'p1':                                    # the board switches on as Zynetix is named
        A = u['A'][0] if u['A'] else u['S'] + 1
        on = ease((t - (A - 0.2)) / 0.7)
    if on > 0:
        m = mk.crop((x0, y0, x1, y1)).point(lambda v: int(v * on))
        comp.paste(scr, (x0, y0), m)
        glow = Image.new('L', (W // 8, H // 8), 0)
        ImageDraw.Draw(glow).rectangle([x0 / 8, y0 / 8, x1 / 8, y1 / 8], fill=int(70 * on))
        glow = glow.filter(ImageFilter.GaussianBlur(6)).resize((W, H), Image.BILINEAR)
        comp = Image.composite(Image.new('RGB', (W, H), (255, 246, 230)), comp, glow.point(lambda v: v // 3))
    frame.paste(kenburns(comp, k, 'push' if b['img'] == 'plate' else 'pull'))


def board_view(u, t):
    """Full-frame board with a gentle camera push toward the act being talked about."""
    ks = [(u['S'], (0, 0, W, H))]
    for a in u['anchors']:
        r = a['rect']
        v = (0, 0, W, H)
        if r and r[2] * r[3] < 0.55 * W * H:
            x, y, w, h = r
            vw = max(w * 1.25 + 120, (h * 1.25 + 120) * 16 / 9, W / 1.35)
            if vw < W * 0.95:
                vh = vw * 9 / 16
                cx, cy = x + w / 2, y + h / 2
                v = (min(max(cx - vw / 2, 0), W - vw), min(max(cy - vh / 2, 0), H - vh), vw, vh)
        ks.append((a['T'] - 0.4, v))
    v = ks[0][1]
    for (t1, v1) in ks[1:]:
        if t < t1 - 0.9:
            break
        s = ease((t - (t1 - 0.9)) / 0.9)
        v = tuple(lerp(a, b, s) for a, b in zip(v, v1))
    # slow drift so the picture always breathes
    d = 0.02 * (t - u['S']) / max(1, u['E'] - u['S'])
    x, y, w, h = v
    return (x + w * d / 2, y + h * d / 2, w * (1 - d), h * (1 - d))


def title(frame, text, a):
    if not text or a <= 0:
        return
    pad = 60
    region = frame.crop((0, H - 220, 900, H)).resize((90, 22))
    light = np.asarray(region).mean() > 165
    ti = text_img(text, F_TTL, (28, 28, 32) if light else INK)
    if not light:
        band = Image.new('L', (W, H), 0)
        ImageDraw.Draw(band).rectangle([0, H - 260, 900, H], fill=170)
        band = band.filter(ImageFilter.GaussianBlur(70)).point(lambda v: int(v * a))
        frame.paste((10, 10, 12), (0, 0), band)
    bar = Image.new('RGBA', (4, ti.height - 12), ((196, 128, 48) if light else WARM) + (255,))
    paste_a(frame, bar, (pad, H - 92 - ti.height + 10), a)
    paste_a(frame, ti, (pad + 22, H - 92 - ti.height + (1 - a) * 10), a)


def logo(frame, a, sub=None, sub2=None):
    mark = 132
    tw = text_img('Zynetix', F_WORD, INK)
    total = mark + 36 + tw.width
    x0 = (W - total) // 2
    cy = H // 2 - 40
    m = Image.new('RGBA', (mark, mark), (0, 0, 0, 0))
    dd = ImageDraw.Draw(m)
    dd.rounded_rectangle([0, 0, mark - 1, mark - 1], 34, fill=(96, 150, 240, 255))
    kk = mark / 54
    dd.line([(15 * kk, 15 * kk), (39 * kk, 15 * kk), (21 * kk, 39 * kk), (39 * kk, 39 * kk)], fill=(255, 255, 255, 255), width=int(5 * kk), joint='curve')
    paste_a(frame, m, (x0, cy - mark // 2 + (1 - a) * 14), a)
    paste_a(frame, tw, (x0 + mark + 36, cy - tw.height // 2 - 10 + (1 - a) * 14), a)
    if sub:
        si = text_img(sub, F_SERIF_I, WARM)
        paste_a(frame, si, ((W - si.width) / 2, cy + 110), a)
    if sub2:
        s2 = text_img(sub2, F_SMALL, (170, 168, 160))
        paste_a(frame, s2, ((W - s2.width) / 2, cy + 180), a)


STAGE_DARK = Image.fromarray(np.clip(np.dstack([np.full((H, W), 14.0), np.full((H, W), 12.0), np.full((H, W), 11.0)]) + np.exp(-(((np.mgrid[0:H, 0:W][1] - W / 2) / 900.0) ** 2 + ((np.mgrid[0:H, 0:W][0] - H / 2) / 520.0) ** 2))[..., None] * np.array([34, 26, 18]), 0, 255).astype(np.uint8))


def render7(i, t, f):
    u = units[i]
    k = u['kind']
    b = u['b']
    fr = BLACK.copy()
    if k == 'black':
        a = min(ease((t - u['S'] - 0.3) / 0.8), ease((u['E'] - t) / 0.6))
        ti = text_img(b['text'], F_SERIF, INK)
        paste_a(fr, ti, ((W - ti.width) / 2, (H - ti.height) / 2 + (1 - a) * 8), a)
        return fr, 0.0
    if k == 'still':
        im = photo(b['img'], b.get('grade', 'cold'))
        fr = kenburns(im, (t - u['S']) / max(1, u['E'] - u['S'] + 0.6), b.get('move', 'push'))
        vignette(fr, 0.5 if b.get('grade', 'cold') == 'cold' else 0.35)
        return grain(fr, f, 1.0), 0.0
    if k == 'plate':
        plate(fr, u, t)
        vignette(fr, 0.3)
        return grain(fr, f, 0.6), 0.0
    if k == 'logo':
        fr = STAGE_DARK.copy()
        logo(fr, ease((t - u['S'] - 0.1) / 0.8), sub='Smart Board')
        return fr, 0.0
    if k == 'end':
        fr = STAGE_DARK.copy()
        logo(fr, ease((t - u['S'] - 0.1) / 0.8), sub='Runs on your existing smart boards', sub2='Book a demo  ·  zynetix.in')
        return fr, 0.0
    src = grab(u, src_index(u, t))
    if u.get('grp') == 'v3d':
        z = 1.25 + 0.04 * (t - u['S']) / max(1, u['E'] - u['S'])
        w, h = W / z, H / z
        fr = src.resize((W, H), Image.BICUBIC, box=((W - w) / 2, (H - h) / 2 + 30, (W + w) / 2, (H + h) / 2 + 30))
    else:
        x, y, w, h = board_view(u, t)
        fr = src.resize((W, H), Image.BICUBIC, box=(x, y, x + w, y + h))
    return fr, 1.0


def title_alpha7(i, t):
    u = units[i]
    if not u['label']:
        return 0.0
    same_prev = i > 0 and units[i - 1]['label'] == u['label']
    same_next = i + 1 < len(units) and units[i + 1]['label'] == u['label']
    a_in = 1.0 if same_prev else ease((t - u['S'] - 0.5) / 0.5)
    a_out = 1.0 if same_next else ease((u['E'] - t) / 0.35)
    return min(a_in, a_out)


def bars(fr, t):
    """2.39:1 letterbox through the old day; it opens up as the board switches on."""
    p1 = next(u for u in units if u['id'] == 'p1')
    A = p1['A'][0] if p1['A'] else p1['S']
    k = 1 - ease((t - A) / 1.4)
    if k <= 0:
        return
    hb = int(138 * k)
    d = ImageDraw.Draw(fr)
    d.rectangle([0, 0, W, hb], fill=(0, 0, 0)); d.rectangle([0, H - hb, W, H], fill=(0, 0, 0))


def xfade_len(a, b):
    if a['kind'] in ('still', 'plate', 'black') or b['kind'] in ('still', 'plate', 'black', 'logo', 'end'):
        return 0.7
    return 0.3


def frame_at(f):
    t = f / FPS
    i = unit_at(t)
    u = units[i]
    fr, ta = render7(i, t, f)
    if ta:
        title(fr, u['label'], title_alpha7(i, t))
    if i > 0:
        L = xfade_len(units[i - 1], u)
        if t < u['S'] + L:
            pt = min(t, units[i - 1]['E'] - 1 / FPS)
            prev, pta = render7(i - 1, pt, f)
            if pta:
                title(prev, units[i - 1]['label'], title_alpha7(i - 1, pt))
            fr = Image.blend(prev, fr, ease((t - u['S']) / L))
    bars(fr, t)
    if t < 0.8:
        fr = Image.blend(BLACK, fr, ease(t / 0.8))
    if t > TOTAL - 1.2:
        fr = Image.blend(fr, BLACK, ease((t - (TOTAL - 1.2)) / 1.2))
    return fr
# ------------------------------------------------------------------ output


def timeline_json():
    tl = {'total': TOTAL, 'units': []}
    for u in units:
        tl['units'].append({'id': u['id'], 'kind': u['kind'], 'S': u['S'], 'E': u['E'], 'first': u['first'],
                            'pieces': [{'file': p['file'], 'at': off} for p, off in zip(pieces(u['id']), u.get('offsets', []))],
                            'A': u.get('A', [])})
    json.dump(tl, open(os.path.join(HERE, 'data', 'timeline7.json'), 'w'), indent=1)


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
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(HERE, 'renders', 'video7.mp4')], check=True)
    print('video', os.path.join(HERE, 'renders', 'video7.mp4'), round(TOTAL, 1), 's')

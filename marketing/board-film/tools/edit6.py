"""v6 board-film editor (built on the v5 editor's capture index, sync solver and time-warp): one plain, product-demo look for the board, the ERP and the apps.

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
LEAD, INK_LEAD, HOLD = 0.30, 0.45, 1.3
BEAT = 60 / 96
args = sys.argv[1:]
FONTS = os.path.join(ROOT, 'packages', 'zynetix_ui', 'fonts')
BEATS = json.load(open(os.path.join(HERE, 'data', 'beats6.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo6.json')))

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


CAPDIR = os.path.join(HERE, '..', 'demo-v5', 'renders', 'board')
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
    p = os.path.join(HERE, '..', 'demo-v5', grp, 'clips', name + '.mp4')
    meta = json.load(open(os.path.join(HERE, '..', 'demo-v5', grp, 'clips', name + '.json')))
    n, w, h = ffprobe_frames(p)
    return {'path': p, 'n': n, 'w': w, 'h': h, 'marks': meta.get('marks', []), 'rects': meta.get('rects', []), 'phone': h > w, 'grp': grp}


# ------------------------------------------------------------------ beats -> units with anchors
units = []      # one per beat
chap_of = {}
for ci, ch in enumerate(BEATS['chapters']):
    for bi, b in enumerate(ch['beats']):
        u = {'id': b['id'], 'kind': b['kind'], 'label': b.get('title'), 'sub': b.get('sub', ''), 'ci': ci, 'chap': ch.get('title') or '', 'first': bi == 0, 'b': b, 'anchors': []}
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
        if u['first'] and t > 1:
            t = math.ceil((t - 0.05) / BEAT) * BEAT + 0.05     # chapters start on the music's beat
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
        if u['kind'] == 'end':
            E = vo_end + 3.2
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



# ================================================================== v6 look: the board as a product on a dark stage
BG = (22, 25, 30)                      # the 3D viewer's own background, so 3D shots and the stage are one space
ACCENT = (110, 168, 255)
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_glow = np.exp(-(((_xx - 1250) / 900) ** 2 + ((_yy - 520) / 620) ** 2)) * 14   # soft key light behind the board
STAGE = Image.fromarray(np.clip(np.dstack([BG[0] + _glow, BG[1] + _glow * 1.05, BG[2] + _glow * 1.2]) - (_yy[..., None] / H) * 6, 0, 255).astype(np.uint8))
_lg = np.clip((980 - _xx[0]) / 380, 0, 1) ** 1.4                                 # left fade that keeps the title readable
LEFTFADE = Image.fromarray((np.tile(_lg, (H, 1)) * 235).astype(np.uint8), 'L')
BGIMG = Image.new('RGB', (W, H), BG)

F_KICK = font('Inter-700.ttf', 22)
F_T = font('SansFlexDisplay-500.ttf', 80)
F_S = font('Inter-400.ttf', 34)
F_BIG = font('SansFlexDisplay-500.ttf', 150)
F_TAG = font('Inter-500.ttf', 30)

AREA = (760, 96, 1860, 984)            # where the board sits while a title is on screen
IDLE_Z = 0.56


def wrap(s, fnt, width):
    out, cur = [], ''
    for w in s.split():
        t = (cur + ' ' + w).strip()
        if fnt.getlength(t) > width and cur:
            out.append(cur); cur = w
        else:
            cur = t
    return out + ([cur] if cur else [])


def framing(rect, tx=None):
    """Camera for a rect (board pixels): zoom z and focus point, so the rect fills the right-hand area."""
    ax0, ay0, ax1, ay1 = AREA
    aw, ah = ax1 - ax0, ay1 - ay0
    tx = (ax0 + ax1) / 2 if tx is None else tx
    ty = (ay0 + ay1) / 2
    if rect:
        x, y, w, h = rect
        z = min(aw / (w + 140), ah / (h + 140))
        z = max(IDLE_Z, min(1.28, z))
        fx, fy = x + w / 2, y + h / 2
    else:
        z, fx, fy = IDLE_Z, W / 2, H / 2
    # keep the board covering the area (no empty edges inside it) when it is big enough
    if W * z >= aw:
        fx = min(max(fx, (tx - ax0) / z), W - (ax1 - tx) / z)
    else:
        fx = W / 2
    if H * z >= ah:
        fy = min(max(fy, (ty - ay0) / z), H - (ay1 - ty) / z)
    else:
        fy = H / 2
    return (fx, fy, z, tx, ty)


def small_rect(r):
    return r and r[2] * r[3] < 0.30 * W * H


# camera keys per unit: (time, cam); continuous from the previous unit's last camera
_last = framing(None)
for u in units:
    keys = [(u['S'], _last)]
    if u['kind'] == 'board' and u['b'].get('wide'):
        keys.append((u['S'] + 0.6, framing(None)))
    elif u['kind'] == 'board':
        for a in u['anchors']:
            r = a['rect'] if a['rect'] and a['rect'][2] * a['rect'][3] < 0.85 * W * H else None
            keys.append((a['T'] - 0.35, framing(r)))
    elif u['kind'] in ('brand', 'end'):
        keys.append((u['S'] + 0.1, framing(None)))
    u['_cam6'] = keys
    _last = keys[-1][1]


def cam6(u, t):
    ks = u['_cam6']
    c = ks[0][1]
    for (t1, c1) in ks[1:]:
        st = t1 - 0.95
        if t < st:
            break
        s = ease((t - st) / 0.95)
        c = tuple(lerp(a, b, s) for a, b in zip(c, c1))
    # a slow push-in while the shot holds, so nothing is ever completely still
    k = (t - u['S']) / max(1.0, u['E'] - u['S'])
    return (c[0], c[1], c[2] * (1 + 0.025 * k), c[3], c[4])


MASKS = {}


def device(frame, src, cam, spot=None, spot_a=0.0):
    fx, fy, z, tx, ty = cam
    dx, dy, dw, dh = tx - fx * z, ty - fy * z, W * z, H * z
    # shadow and bezel
    pad = max(6, 14 * z)
    sh = Image.new('L', (W // 4, H // 4), 0)
    ImageDraw.Draw(sh).rounded_rectangle([(dx - pad) / 4, (dy - pad + 18) / 4, (dx + dw + pad) / 4, (dy + dh + pad + 30) / 4], 8, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(10)).resize((W, H), Image.BILINEAR)
    frame.paste(Image.new('RGB', (W, H), (4, 5, 7)), (0, 0), sh)
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([dx - pad, dy - pad, dx + dw + pad, dy + dh + pad], int(22 * z + pad), fill=(12, 13, 16), outline=(62, 66, 76), width=2)
    # the screen: only the part of the board that is in frame
    ox0, oy0, ox1, oy1 = max(0, dx), max(0, dy), min(W, dx + dw), min(H, dy + dh)
    if ox1 <= ox0 or oy1 <= oy0:
        return
    sx0, sy0, sx1, sy1 = (ox0 - dx) / z, (oy0 - dy) / z, (ox1 - dx) / z, (oy1 - dy) / z
    ow, oh = int(round(ox1 - ox0)), int(round(oy1 - oy0))
    scr = src.resize((ow, oh), Image.BICUBIC, box=(sx0, sy0, sx1, sy1))
    if spot and spot_a > 0.01:
        x, y, w, h = spot
        m = Image.new('L', (ow // 4 + 1, oh // 4 + 1), int(255 * 0.3 * spot_a))
        rx0, ry0 = (dx + (x - 14) * z - ox0) / 4, (dy + (y - 14) * z - oy0) / 4
        rx1, ry1 = (dx + (x + w + 14) * z - ox0) / 4, (dy + (y + h + 14) * z - oy0) / 4
        ImageDraw.Draw(m).rounded_rectangle([rx0, ry0, rx1, ry1], 6, fill=0)
        m = m.filter(ImageFilter.GaussianBlur(5)).resize((ow, oh), Image.BILINEAR)
        scr.paste((0, 0, 0), (0, 0), m)
        ImageDraw.Draw(scr).rounded_rectangle([rx0 * 4, ry0 * 4, rx1 * 4, ry1 * 4], 10, outline=ACCENT, width=3) if spot_a > 0.6 else None
    mk = Image.new('L', (ow, oh), 0)
    ImageDraw.Draw(mk).rounded_rectangle([dx - ox0, dy - oy0, dx + dw - ox0, dy + dh - oy0], int(16 * z), fill=255)
    frame.paste(scr, (int(ox0), int(oy0)), mk)


def spot_for(u, t):
    """The spotlight on the act being talked about: in just before the act, out before the next one."""
    best, a_out = None, 0.0
    for j, a in enumerate(u['anchors']):
        if not small_rect(a['rect']) or u['b'].get('wide'):
            continue
        t_in, t_out = a['T'] - 0.25, (u['anchors'][j + 1]['T'] - 0.6 if j + 1 < len(u['anchors']) else u['E'] - 0.3)
        if t_in - 0.3 <= t <= t_out + 0.3:
            al = min(ease((t - t_in + 0.3) / 0.3), ease((t_out + 0.3 - t) / 0.3))
            if al > a_out:
                best, a_out = a['rect'], al
    return best, a_out


def title_of(u):
    return (u['label'] or '', u.get('sub') or '', u['chap'])


def draw_title(frame, u, t, a=1.0):
    title, sub, chap = title_of(u)
    if not title or a <= 0:
        return
    # the left fade for readability
    frame.paste(BGIMG, (0, 0), LEFTFADE.point(lambda v: int(v * a)))
    y = 540
    lines = wrap(title, F_T, 600)
    sublines = wrap(sub, F_S, 560)
    block = len(lines) * 92 + 26 + len(sublines) * 46
    y0 = int(540 - block / 2)
    rise = (1 - a) * 18
    if chap:
        n = [c['title'] for c in BEATS['chapters'] if c['title']].index(chap) + 1
        k = text_img(f"{n:02d}   {chap.upper()}", F_KICK, ACCENT)
        paste_a(frame, k, (112, y0 - 58 + rise), a)
    for i, l in enumerate(lines):
        paste_a(frame, text_img(l, F_T, INK), (108, y0 + i * 92 + rise), a)
    for i, l in enumerate(sublines):
        paste_a(frame, text_img(l, F_S, MUTED), (112, y0 + len(lines) * 92 + 26 + i * 46 + rise), a)


def draw_logo(frame, cx, cy, a, size=1.0, tag=None):
    mark = int(118 * size)
    tw = text_img('Zynetix', F_BIG, INK)
    total = mark + 34 + tw.width
    x0 = cx - total // 2
    m = Image.new('RGBA', (mark, mark), (0, 0, 0, 0))
    dd = ImageDraw.Draw(m)
    dd.rounded_rectangle([0, 0, mark - 1, mark - 1], int(30 * size), fill=ACCENT + (255,))
    k = mark / 54
    dd.line([(15 * k, 15 * k), (39 * k, 15 * k), (21 * k, 39 * k), (39 * k, 39 * k)], fill=(255, 255, 255, 255), width=int(5 * k), joint='curve')
    paste_a(frame, m, (x0, cy - mark // 2), a)
    paste_a(frame, tw, (x0 + mark + 34, cy - tw.height // 2 - 8), a)
    if tag:
        ti = text_img(tag, F_TAG, MUTED)
        paste_a(frame, ti, (cx - ti.width / 2, cy + 104), a)


BOARD_STILL = None


def board_still():
    global BOARD_STILL
    if BOARD_STILL is None:
        BOARD_STILL = Image.open(os.path.join(HERE, '..', 'demo-v5', 'stills', 'board.jpg')).convert('RGB')
    return BOARD_STILL


def title_alpha(i, t):
    """Titles stay put when consecutive beats share a title; they fade in/out only when the title changes."""
    u = units[i]
    if not u['label']:
        return 0.0
    same_prev = i > 0 and title_of(units[i - 1])[:2] == title_of(u)[:2]
    same_next = i + 1 < len(units) and title_of(units[i + 1])[:2] == title_of(u)[:2]
    a_in = 1.0 if same_prev else ease((t - u['S'] - 0.15) / 0.45)
    a_out = 1.0 if same_next else ease((u['E'] - t) / 0.3)
    return min(a_in, a_out)


def render6(frame, i, t):
    u = units[i]
    k = u['kind']
    if k == 'clip' and u.get('grp') == 'v3d':
        src = grab(u, src_index(u, t))
        z = 1.18 + 0.03 * (t - u['S']) / max(1, u['E'] - u['S'])
        # the model sits right of centre, in the same space as the stage
        sw, sh = int(W * z), int(H * z)
        im = src.resize((sw, sh), Image.BICUBIC)
        frame.paste(im, (int(1270 - 960 * z), int(540 - 470 * z)))
        return True
    if k == 'brand':
        A = u['A']
        if len(A) > 1 and t >= A[1] - 0.4:
            a = ease((t - A[1] + 0.4) / 0.3)
            cam = framing(None, tx=960)
            cam = (cam[0], cam[1], 0.66 + 0.04 * ease((t - A[1]) / 4), 960, 560)
            device(frame, board_still(), cam)
            if a < 1:
                fr2 = STAGE.copy(); draw_logo(fr2, W // 2, 520, 1.0, tag='SMART BOARD')
                frame.paste(Image.blend(fr2, frame, a))
        else:
            a = ease((t - u['S']) / 0.6)
            draw_logo(frame, W // 2, 520, a, tag='SMART BOARD')
        return False
    if k == 'end':
        A = u['A']
        if len(A) > 1 and t >= A[1] - 0.4:
            a = ease((t - A[1] + 0.4) / 0.6)
            draw_logo(frame, W // 2, 500, a, tag='Book your demo today')
            return False
        device(frame, board_still(), cam6(u, t))
        return True
    src = grab(u, src_index(u, t))
    sp, sa = spot_for(u, t)
    device(frame, src, cam6(u, t), sp, sa)
    return True


def frame_at(f):
    t = f / FPS
    i = unit_at(t)
    u = units[i]
    fr = STAGE.copy()
    titled = render6(fr, i, t)
    if i > 0 and t < u['S'] + 0.35:
        prev = STAGE.copy()
        pt = min(t, units[i - 1]['E'] - 1 / FPS)
        ptitled = render6(prev, i - 1, pt)
        if ptitled:
            draw_title(prev, units[i - 1], pt, title_alpha(i - 1, pt))
        if titled:
            draw_title(fr, u, t, title_alpha(i, t))
        return Image.blend(prev, fr, ease((t - u['S']) / 0.35))
    if titled:
        draw_title(fr, u, t, title_alpha(i, t))
    return fr


# ------------------------------------------------------------------ output


def timeline_json():
    tl = {'total': TOTAL, 'units': []}
    for u in units:
        tl['units'].append({'id': u['id'], 'kind': u['kind'], 'S': u['S'], 'E': u['E'], 'first': u['first'],
                            'pieces': [{'file': p['file'], 'at': off} for p, off in zip(pieces(u['id']), u.get('offsets', []))],
                            'A': u.get('A', [])})
    json.dump(tl, open(os.path.join(HERE, 'data', 'timeline6.json'), 'w'), indent=1)


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
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(HERE, 'renders', 'video6.mp4')], check=True)
    print('video', os.path.join(HERE, 'renders', 'video6.mp4'), round(TOTAL, 1), 's')

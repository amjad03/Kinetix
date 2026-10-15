"""v3 editor: builds the video from the beat list.

Every beat has a VO clip and acts anchored to words (data/words.json). The capture
(renders/capture.mp4 + capture.jsonl, recorded at a natural pace) is time-warped per beat so each act's
frame lands 100 ms before its anchor word; montage beats become 2-up/2x2 grids whose tiles light up on
their words; the hook, chapter cards, recap and end card are drawn on the stage. Writes
renders/video.mp4, renders/timeline.json (VO placement, card times for the music) and SYNC_AUDIT.md.

    python3 edit.py [--stills dir] [--from SECONDS --to SECONDS]
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose as C  # stage, window, stylus, text pieces (v2 compositor)

HERE = C.HERE
FPS, W, H = 30, C.W, C.H
WX, WY, WW, WH = C.WX, C.WY, C.WW, C.WH
LEAD = 0.10  # visual onset this long before the anchor word
BEATS = json.load(open(os.path.join(HERE, 'data', 'beats.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo.json')))
WORDS = json.load(open(os.path.join(HERE, 'data', 'words.json')))
CHAPS = [c for c in BEATS['chapters'] if c['title']]
NCH = len(CHAPS)
args = sys.argv[1:]
STILLS = args[args.index('--stills') + 1] if '--stills' in args else None


def norm(t):
    return ''.join(ch for ch in t.lower() if ch.isalnum())


def word_time(bid, w, n=0):
    key = norm(w)
    for tok, st, en in WORDS[bid]:
        if norm(tok).startswith(key) or (len(key) >= 5 and norm(tok).startswith(key[:5])):
            if n == 0:
                return st
            n -= 1
    raise KeyError(f'{bid}: word {w!r} not in {[t[0] for t in WORDS[bid]]}')


# ------------------------------------------------------------------ capture index

CAPDIR = os.environ.get('CAPDIR') or os.path.join(HERE, 'renders')
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
            cbeats[e['beatOf']]['acts'].append({'f': hd['i'], 'kind': e['kind'], 'rect': e.get('rect'), 'label': e.get('label'), 'now': e.get('now', False)})
        if 'snap' in e:
            snaps[e['snap']] = hd['i']
        if 'tap' in e:
            taps.append((hd['i'], e['tap']))
for b in cbeats.values():
    if b['end'] is None:
        b['end'] = NCAP - 1

# ------------------------------------------------------------------ refine acts: the first frame the board
# actually changes inside the act's area after the press (a quarter-size grey pre-pass of the capture)

def refine_acts():
    ck = os.path.join(CAPDIR, 'refine_cache.json')
    stamp = [os.path.getsize(CAPMP4), int(os.path.getmtime(CAPMP4))]
    if os.path.exists(ck):
        c = json.load(open(ck))
        if c['stamp'] == stamp:
            for bid, cb in cbeats.items():
                for j, a in enumerate(cb['acts']):
                    if f'{bid}/{j}' in c['ref']:
                        a['press'], a['f'] = a['f'], c['ref'][f'{bid}/{j}']
            return
    need = {}
    for bid, cb in cbeats.items():
        for a in cb['acts']:
            if a['kind'] in ('act', 'tile'):
                for f in range(a['f'] - (4 if a.get('now') else 1), min(NCAP, a['f'] + 120)):
                    need.setdefault(f, []).append(a)
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', CAPMP4, '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                         stdout=subprocess.PIPE)
    prev = None
    for f in range(NCAP):
        raw = p.stdout.read(480 * 270)
        if len(raw) < 480 * 270:
            break
        cur = np.frombuffer(raw, np.uint8).reshape(270, 480).astype(np.int16)
        if prev is not None and f in need:
            for a in need[f]:
                if a.get('ref') is not None or f < a['f'] - (3 if a.get('now') else 0):
                    continue
                r = a.get('rect') or [0, 0, W, H]
                x0, y0, x1, y1 = r[0] // 4, r[1] // 4, (r[0] + r[2]) // 4 + 1, (r[1] + r[3]) // 4 + 1
                area = max(1, (y1 - y0) * (x1 - x0))
                if int(np.sum(np.abs(cur[y0:y1, x0:x1] - prev[y0:y1, x0:x1]) > 10)) >= max(3, min(0.002 * area, 12)):
                    a['ref'] = f
        prev = cur
    p.stdout.close()
    p.wait()
    for cb in cbeats.values():
        for a in cb['acts']:
            if a['kind'] in ('act', 'tile'):
                a['press'] = a['f']
                a['f'] = a.get('ref') or a['f']
    json.dump({'stamp': stamp, 'ref': {f'{bid}/{j}': a['f'] for bid, cb in cbeats.items() for j, a in enumerate(cb['acts']) if 'press' in a}}, open(ck, 'w'))


refine_acts()

# ------------------------------------------------------------------ timeline (seconds)

def build(extra):
    global beats, cards
    beats = []  # flat list with timing
    t = 0.6
    cards = []
    for ci, ch in enumerate(BEATS['chapters']):
        if ch['title']:
            cnum = CHAPS.index(ch) + 1
            card_at = t + 0.15
            cards.append({'at': card_at, 'num': cnum, 'title': ch['title'], 'dur': 1.3})
            t = card_at + 1.15  # VO starts just as the window lands
        for b in ch['beats']:
            bid = b['id']
            kind = b.get('kind', 'act')
            dur = VO[bid]
            cb = cbeats.get(bid)
            acts = []
            cap_acts = [a for a in (cb['acts'] if cb else [])]
            ci_ = 0
            for a in b['acts']:
                ak = a.get('kind', 'text' if kind in ('text', 'logo') else 'act')
                ent = {'kind': ak, 'w': a['w'], 'label': a.get('label') or a.get('text'), 'img': a.get('img'), 'snap': a.get('snap'), 'text': a.get('text')}
                ent['wt'] = word_time(bid, a['w'], a.get('n', 0))
                if ak in ('act', 'hl', 'tile'):
                    if ci_ < len(cap_acts):
                        ent['cap'] = cap_acts[ci_]
                        ci_ += 1
                    else:
                        print(f'WARN {bid}: capture has no act for {a["w"]}')
                acts.append(ent)
            if cb and ci_ != len(cap_acts):
                print(f'WARN {bid}: capture has {len(cap_acts)} acts, script uses {ci_}')
            vo_start = t + extra.get(bid, 0.0)
            # an act needs a little lead-in in the picture: push the voice if the first anchor is too early
            first_act = next((a for a in acts if a['kind'] in ('act', 'tile')), None)
            if first_act and beats:
                prev = beats[-1]
                prev_last = max([a['T'] for a in prev['acts'] if a['kind'] in ('act', 'tile', 'hl')] or [prev['vo_start']])
                need = prev_last + 1.3 - (first_act['wt'] - LEAD)
                if not cards or cards[-1]['at'] < prev['vo_start']:
                    vo_start = max(vo_start, need)
            first_any = next((a for a in acts if a['kind'] in ('act', 'tile', 'hl')), None)
            if first_any and cards and (not beats or cards[-1]['at'] >= beats[-1]['vo_start']):
                # first beat of a chapter: the action must land after the window is back from the card
                vo_start = max(vo_start, cards[-1]['at'] + cards[-1]['dur'] + 0.9 - (first_any['wt'] - LEAD))
            for a in acts:
                a['T'] = vo_start + a['wt'] - LEAD
            beats.append({'id': bid, 'kind': kind, 'title': b.get('title'), 'vo_start': vo_start, 'vo_end': vo_start + dur, 'acts': acts, 'cb': cb,
                          'chapter': CHAPS.index(ch) + 1 if ch['title'] else 0})
            t = max(vo_start + dur + 0.28, vo_start + 2.35)
            if kind == 'endcard':
                t = vo_start + dur + 2.2

    # beat display intervals: from the boundary after the previous beat's last act to the next boundary
    for i, b in enumerate(beats):
        if i == 0:
            b['S'] = 0.0
            continue
        p = beats[i - 1]
        card_between = any(p['vo_end'] <= c['at'] <= b['vo_start'] for c in cards)
        if card_between:
            c = next(c for c in cards if p['vo_end'] <= c['at'] <= b['vo_start'])
            p['E'] = c['at']
            b['S'] = c['at'] + c['dur']
            continue
        p_last = max([a['T'] for a in p['acts'] if a['kind'] in ('act', 'tile', 'hl', 'phone', 'chip', 'text')] or [p['vo_start']])
        first = min([a['T'] for a in b['acts'] if a['kind'] in ('act', 'tile')] or [b['vo_start'] + 0.2])
        gap = first - p_last
        s = p_last + max(0.85, min(gap - 0.7, gap * 0.55))
        s = min(s, first - 0.35)
        p['E'] = s
        b['S'] = s
    beats[-1]['E'] = beats[-1]['vo_end'] + 2.2

    return beats, cards


extra = {}
for _ in range(12):
    beats, cards = build(extra)
    changed = False
    for i, b in enumerate(beats[:-1]):
        nxt = beats[i + 1]['id']
        need = 0.0
        if b['E'] - b['S'] < 2.05:
            need = 2.05 - (b['E'] - b['S'])
        if b['kind'] in ('grid', 'recap'):
            lastT = max(a['T'] for a in b['acts'])
            if b['E'] - lastT < 1.6:
                need = max(need, 1.6 - (b['E'] - lastT))
        if need > 0.01:
            extra[nxt] = extra.get(nxt, 0.0) + need + 0.03
            changed = True
    if not changed:
        break
if '--dry' in args:
    for b in beats:
        for a in b['acts']:
            if 'cap' in a and a['kind'] in ('act', 'tile'):
                c = a['cap']
                print(b['id'], a['w'], 'press', c.get('press'), 'ref', c.get('ref'), 'rect', c.get('rect'), 'in', b['cb']['in'], 'T', round(a['T'], 2))
    sys.exit(0)
TOTAL = beats[-1]['E']
NOUT = int(TOTAL * FPS) + 1

# ------------------------------------------------------------------ capture mapping per beat


def cap_index(b, t):
    """Capture frame shown at output time t for a non-grid beat. The lead-up to each act plays (sped up
    to at most 3x) and then holds on the frame just before it, so the change appears exactly on time."""
    cb = b['cb']
    knots = [a for a in b['acts'] if a['kind'] == 'act' and 'cap' in a]
    lo, hi = cb['in'], cb['end']
    if not knots:
        return min(hi, lo + (t - b['S']) * FPS)
    prev_f, prev_T = lo, b['S']
    for k in knots:
        kf = k['cap']['f']
        if t < k['T']:
            avail = max(0.3, (k['T'] - 0.45) - prev_T)
            start = max(prev_f, kf - 1 - avail * FPS * 3)  # too long even at 3x: cut in later
            s = max(1.0, min(3.0, (kf - 1 - start) / FPS / avail))
            return max(start, min(kf - 1, start + (t - prev_T) * FPS * s))
        prev_f, prev_T = kf, k['T']
    return min(hi, prev_f + (t - prev_T) * FPS)


def tile_index(a, t, nxt):
    f = a['cap']['f']
    end = min(f + 90, (nxt['cap']['press'] - 3) if nxt else f + 90)
    if t < a['T']:
        return f - 1
    return int(max(f, min(end, f + (t - a['T']) * FPS)))


# ------------------------------------------------------------------ decoding


class Decoder:
    def __init__(self):
        self.p = None
        self.n = -1

    restarts = 0

    def start(self, first):
        if self.p:
            self.p.kill()
            self.p.wait()
            Decoder.restarts += 1
            print('decoder restart at', first, 'from', self.n, flush=True)
        # frame-exact: input -ss lands a few frames off on this file, so select by decoded frame number
        vf = ['-vf', f'select=gte(n\\,{first})', '-fps_mode', 'passthrough'] if first > 0 else []
        self.p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-threads', '0', '-i', CAPMP4, *vf,
                                   '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.n = first - 1
        self.cur = None

    def get(self, idx):
        idx = max(0, min(NCAP - 1, int(idx)))
        if self.p is None or idx < self.n or (idx - self.n > 60 and not any(k in want_keep for k in range(self.n + 1, idx - 1))):
            self.start(max(0, idx - 2))  # seek: backwards, first use, or a long skip that no grid tile needs
        while self.n < idx:
            raw = self.p.stdout.read(W * H * 3)
            if len(raw) < W * H * 3:
                break
            self.n += 1
            if self.n >= idx - 0:
                self.cur = raw
            if self.n in want_keep:
                im = Image.frombuffer('RGB', (W, H), raw, 'raw', 'RGB', 0, 1)
                for spec in want_keep[self.n]:
                    kept[(spec[0], self.n)] = crop_tile(im, spec[1], spec[2], spec[3])
        return Image.frombuffer('RGB', (W, H), self.cur, 'raw', 'RGB', 0, 1)


kept = {}
want_keep = {}  # capture frame -> [(tile key, rect, w, h)]
grid_last = {}

# snaps are needed early (hook/recap): extract them with a separate pass
snap_img = {}
for name, f in snaps.items():
    pth = os.path.join(CAPDIR, f'snap_{name}_{f}_{os.path.getsize(CAPMP4)}.png')
    if not os.path.exists(pth):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', CAPMP4, '-vf', f'select=eq(n\\,{f})', '-vframes', '1', pth])
    if os.path.exists(pth):
        snap_img[name] = Image.open(pth).convert('RGB')

# ------------------------------------------------------------------ drawing helpers


def view_for(rect):
    if not rect:
        return (0, 0, W, H)
    x, y, w, h = rect
    w2, h2 = w * 1.3, h * 1.3
    vw = max(w2, h2 * 16 / 9, W / 1.6)
    vh = vw * 9 / 16
    if vw >= W * 0.9:
        return (0, 0, W, H)
    cx, cy = x + w / 2, y + h / 2
    return (min(max(cx - vw / 2, 0), W - vw), min(max(cy - vh / 2, 0), H - vh), vw, vh)


def lerp_view(a, b, s):
    return tuple(a[i] + (b[i] - a[i]) * s for i in range(4))


def camera(b, t):
    """Eased camera: full view between beats, in on each act just before it, never moving during it."""
    full = (0, 0, W, H)
    keys = [(b['S'], full)]
    for a in b['acts']:
        if a['kind'] in ('act', 'hl') and 'cap' in a and a['cap'].get('rect'):
            v = view_for(a['cap']['rect'])
            keys.append((a['T'] - 0.8, keys[-1][1]))
            keys.append((a['T'] - 0.15, v))
    keys.append((b['E'] - 0.65, keys[-1][1]))
    keys.append((b['E'] - 0.05, full))
    keys.sort(key=lambda k: k[0])
    prev = keys[0]
    for k in keys[1:]:
        if t <= k[0]:
            if k[0] - prev[0] <= 1e-6:
                return k[1]
            s = C.ease((t - prev[0]) / (k[0] - prev[0]))
            return lerp_view(prev[1], k[1], s)
        prev = k
    return keys[-1][1]


def spot(win, view, rect, label, al, sx):
    x0 = (rect[0] - view[0]) * sx; y0 = (rect[1] - view[1]) * sx
    x1 = (rect[0] + rect[2] - view[0]) * sx; y1 = (rect[1] + rect[3] - view[1]) * sx
    if x1 - x0 < WW * 0.92 or y1 - y0 < WH * 0.92:
        dim = Image.new('L', (WW // 4, WH // 4), int(120 * al))
        ImageDraw.Draw(dim).rounded_rectangle([x0 / 4 - 2, y0 / 4 - 2, x1 / 4 + 2, y1 / 4 + 2], radius=4, fill=0)
        dim = dim.filter(ImageFilter.GaussianBlur(2)).resize((WW, WH), Image.BILINEAR)
        win.paste(Image.new('RGB', (WW, WH), C.NAVY), (0, 0), dim)
        ImageDraw.Draw(win, 'RGBA').rounded_rectangle([x0, y0, x1, y1], radius=12, outline=C.CYAN + (int(235 * al),), width=3)
    if label:
        p = pill(label)
        above = y0 - p.height - 26 > 8
        py_ = y0 - p.height - 20 if above else min(WH - p.height - 10, y1 + 20)
        px_ = min(max((x0 + x1) / 2 - p.width / 2, 10), WW - p.width - 10)
        pp = C.with_alpha(p, al)
        win.paste(pp, (int(px_), int(py_ + (1 - al) * (8 if above else -8))), pp)


def font_for(text, size, weight=700):
    if any('ऀ' <= ch <= 'ॿ' for ch in text):
        return C.ImageFont.truetype(os.path.join(C.FONTS, f'NotoSansDevanagari-{700 if weight >= 600 else 400}.ttf'), size)
    if any('ಀ' <= ch <= '೿' for ch in text):
        return C.ImageFont.truetype(os.path.join(C.FONTS, f'NotoSansKannada-{700 if weight >= 600 else 400}.ttf'), size)
    return C.font(weight, size)


def pill(text, bg=C.BLUE + (245,)):
    return C.pill(text, font_for(text, 21), bg=bg)


def tile_layout(n):
    gap = 18
    if n == 2:
        w = (WW - 3 * gap) // 2
        h = int(w * 9 / 16)
        y = (WH - h) // 2 - 10
        return [(gap, y, w, h), (2 * gap + w, y, w, h)]
    w = (WW - 3 * gap) // 2
    h = (WH - 3 * gap - 40) // 2
    return [(gap, gap, w, h), (2 * gap + w, gap, w, h), (gap, 2 * gap + h + 30, w, h), (2 * gap + w, 2 * gap + h + 30, w, h)]


def crop_tile(img, rect, tw, th):
    x, y, w, h = rect or (0, 0, W, H)
    asp = tw / th
    if w / h > asp:
        h2 = w / asp
        y -= (h2 - h) / 2
        h = h2
    else:
        w2 = h * asp
        x -= (w2 - w) / 2
        w = w2
    x = min(max(x, 0), max(0, W - w)); y = min(max(y, 0), max(0, H - h))
    w, h = min(w, W), min(h, H)
    return img.crop((int(x), int(y), int(x + w), int(y + h))).resize((tw, th), Image.BICUBIC)


def tile_frame(tiles, rects, labels, active, appear):
    win = Image.new('RGB', (WW, WH), (14, 22, 44))
    d = ImageDraw.Draw(win, 'RGBA')
    for j, (img, r, lab) in enumerate(zip(tiles, rects, labels)):
        x, y, w, h = r
        a = appear[j]
        if img is None or a <= 0:
            d.rounded_rectangle([x, y, x + w, y + h], radius=14, fill=(20, 32, 62, 255))
            continue
        im = img
        if j != active:
            im = Image.blend(im, Image.new('RGB', im.size, (14, 22, 44)), 0.45)
        mask = C.rounded((w, h), 14, (255, 255, 255, 255)).split()[3]
        win.paste(im, (x, y), mask)
        if j == active:
            d.rounded_rectangle([x - 3, y - 3, x + w + 3, y + h + 3], radius=16, outline=C.CYAN + (240,), width=4)
        p = pill(lab, bg=(C.BLUE + (245,)) if j == active else (18, 40, 90, 220))
        win.paste(p, (x + 14, y + h - p.height - 10), p)
    return win


for b in beats:
    if b['kind'] == 'grid' and b['cb']:
        tl = [a for a in b['acts'] if a['kind'] == 'tile' and 'cap' in a]
        rects = tile_layout(len(tl))
        for j, a in enumerate(tl):
            nxt = tl[j + 1] if j + 1 < len(tl) else None
            hi = min(a['cap']['f'] + 91, (nxt['cap']['press'] - 2) if nxt else min(a['cap']['f'] + 91, b['cb']['end']))
            for f in range(a['cap']['f'] - 1, hi):
                want_keep.setdefault(f, []).append(((b['id'], j), a['cap'].get('rect'), rects[j][2], rects[j][3]))
            grid_last[b['id']] = max(grid_last.get(b['id'], 0), hi)


# ------------------------------------------------------------------ hook / recap text scenes


def text_scene(f, b, t):
    """Kinetic statements on the stage (hook)."""
    lines = [a for a in b['acts'] if a['kind'] == 'text']
    big = C.font(700, 76)
    y0 = H / 2 - 60 * len(lines)
    for j, a in enumerate(lines):
        age = (t - a['T']) * FPS
        if age < -1:
            continue
        txt = a['text']
        fnt = big if len(lines) > 1 else C.font(700, 66)
        x = (W - fnt.getlength(txt)) / 2
        y = y0 + j * 120 if len(lines) > 1 else H / 2 - 50
        C.kinetic(f, txt, x, y, fnt, age, fill=(255, 255, 255) if j == len(lines) - 1 or len(lines) == 1 else (170, 190, 230))


def logo_scene(f, b, t):
    a = b['acts'][0]
    age = (t - a['T']) * FPS
    s = C.ease(age / 16)
    fl = C.font(700, 132)
    tw = fl.getlength('ZYNETIX')
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text(((W - tw) / 2, 380), 'ZYNETIX', font=fl, fill=C.BLUE + (int(200 * s),))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    f.paste(glow, (0, 0), glow)
    ImageDraw.Draw(f, 'RGBA').text(((W - tw) / 2, 380), 'ZYNETIX', font=fl, fill=(255, 255, 255, int(255 * s)))
    sub = 'Board  ·  the AI smartboard'
    fs = C.font(500, 40)
    C.kinetic(f, sub, (W - fs.getlength(sub)) / 2, 550, fs, age - 10, fill=C.CYAN)


# ------------------------------------------------------------------ main render

def main(n0=0, n1=None, out=None):
    n1 = NOUT if n1 is None else n1
    out = out or os.path.join(HERE, 'renders', 'video.mp4')
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                           out], stdin=subprocess.PIPE)
    dec = Decoder()
    audit = {}  # act key -> list of (t, diff)
    prev_small = {}
    last_win = Image.new('RGB', (WW, WH), (250, 250, 248))
    prev_xy, vx = None, 0.0
    bi = 0
    cut_from = None  # (window image, frame) to crossfade at a beat boundary
    for n in range(n0, n1):
        t = n / FPS
        while bi + 1 < len(beats) and t >= beats[bi + 1]['S']:
            bi += 1
            cut_from = (last_win, n) if n > n0 else None
            for k in [k for k in kept if beats[bi - 1]['id'] == k[0][0]]:
                del kept[k]  # a finished grid's tiles are never shown again
        b = beats[bi]
        card = next((c for c in cards if c['at'] <= t < c['at'] + c['dur']), None)
        f = C.STAGE.copy()
        chap = b['chapter'] if not card else card['num']
        # header: brand, chapter dots, progress line, chapter crumb
        C.header(f, chap, [], n)
        d = ImageDraw.Draw(f, 'RGBA')
        if chap:
            d.rounded_rectangle([WX, 112, WX + WW, 115], radius=2, fill=(255, 255, 255, 30))
            d.rounded_rectangle([WX, 112, WX + int(WW * t / TOTAL), 115], radius=2, fill=C.BLUE + (220,))
            ch = CHAPS[chap - 1]
            d.text((WX + 2, 30), f'{chap:02d}  ·  {ch["title"].upper()}', font=C.F_CRUMB, fill=C.CYAN)
        if card:
            age = (t - card['at']) * FPS
            k = C.ease(age / 12)
            if k < 1:
                C.place_window(f, last_win, scale=1 - 0.12 * k, tilt=-10 * k, alpha=1 - k, dy=20 * k)
            num = f'CHAPTER {card["num"]:02d}'
            fn = C.font(400, 30)
            C.kinetic(f, num, (W - fn.getlength(num)) / 2, 448, fn, age - 4, fill=C.CYAN)
            ft = C.font(700, 64)
            C.kinetic(f, card['title'], (W - ft.getlength(card['title'])) / 2, 495, ft, age - 7)
            lw = ft.getlength(card['title']) * C.ease((age - 12) / 14)
            d.rounded_rectangle([W / 2 - lw / 2, 590, W / 2 + lw / 2, 594], radius=2, fill=C.BLUE + (230,))
            write(ff, f, n)
            continue
        win = None
        if b['kind'] in ('text', 'logo'):
            (text_scene if b['kind'] == 'text' else logo_scene)(f, b, t)
        elif b['kind'] == 'endcard':
            logo_scene(f, {'acts': [{'T': b['vo_start']}]}, t)
            tag = 'Every lesson, connected.'
            fs = C.font(400, 34)
            C.kinetic(f, tag, (W - fs.getlength(tag)) / 2, 640, fs, (t - b['vo_start'] - 1.2) * FPS, fill=(220, 230, 255))
        elif b['kind'] in ('grid', 'recap'):
            tl = [a for a in b['acts'] if a['kind'] == 'tile']
            rects = tile_layout(len(tl))
            imgs, labels, appear = [], [], []
            active = max([j for j, a in enumerate(tl) if a['T'] - 0.02 <= t] or [-1])
            for j, a in enumerate(tl):
                x, y, w, h = rects[j]
                if b['kind'] == 'recap':
                    src = snap_img.get(a['snap'])
                    imgs.append(crop_tile(src, None, w, h) if src else None)
                    appear.append(1.0 if t >= a['T'] else 0.0)
                    if abs(t - a['T']) < 0.02:
                        audit.setdefault((b['id'], 'recap', j), []).append((t, 1.0))
                else:
                    nxt = tl[j + 1] if j + 1 < len(tl) else None
                    if 'cap' in a:
                        dec.get(grid_last.get(b['id'], 0))
                        fi = tile_index(a, t, nxt)
                        img = None
                        for dfi in range(0, 40):
                            img = kept.get(((b['id'], j), fi - dfi)) or kept.get(((b['id'], j), fi + dfi))
                            if img is not None:
                                break
                        src = img
                        imgs.append(img)
                        if False:
                            pass
                            if key in prev_small:
                                diff = float(np.sum(np.abs(small - prev_small[key]) > 10))
                                audit.setdefault(key, []).append((t, diff))
                            prev_small[key] = small
                    else:
                        imgs.append(None)
                    appear.append(1.0)
                labels.append(a['label'] or '')
            win = tile_frame(imgs, rects, labels, active, appear)
            if b['kind'] == 'grid':
                for j, a in enumerate(tl):
                    if abs(t - a['T']) <= 1.2:
                        x, y, w, h = rects[j]
                        small = np.asarray(win.crop((x, y, x + w, y + h)).convert('L').resize((w // 4, h // 4)), np.int16)
                        key = (b['id'], j)
                        if key in prev_small:
                            audit.setdefault(key, []).append((t, float(np.sum(np.abs(small - prev_small[key]) > 10))))
                        prev_small[key] = small
        else:
            idx = cap_index(b, t) if b['cb'] else 0
            board = dec.get(idx)
            hd = cap[int(idx)] if b['cb'] else {'x': 0, 'y': 0, 'h': 1, 'v': 0}
            view = camera(b, t)
            sx = WW / view[2]
            win = board.resize((WW, WH), Image.BILINEAR, box=(view[0], view[1], view[0] + view[2], view[1] + view[3]))
            # audit: board change inside each act rect around its anchor
            for j, a in enumerate(b['acts']):
                if a['kind'] == 'act' and 'cap' in a and abs(t - a['T']) <= 1.2:
                    r = a['cap'].get('rect') or [0, 0, W, H]
                    reg = board.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])).convert('L').resize((max(8, r[2] // 4), max(8, r[3] // 4)))
                    small = np.asarray(reg, np.int16)
                    key = (b['id'], j)
                    if key in prev_small and prev_small[key].shape == small.shape:
                        diff = float(np.sum(np.abs(small - prev_small[key]) > 10)) / max(3, min(0.002 * small.size, 12)) * 3
                        audit.setdefault(key, []).append((t, diff))
                    prev_small[key] = small
            # spotlight + callouts on the word
            acts = [a for a in b['acts'] if a['kind'] in ('act', 'hl') and 'cap' in a and a['cap'].get('rect')]
            show = None
            for j, a in enumerate(acts):
                if a['T'] <= t and (a['kind'] == 'hl' or a['label']):
                    nxt_T = acts[j + 1]['T'] if j + 1 < len(acts) else b['E']
                    if t < min(nxt_T, a['T'] + 2.6, b['E'] - 0.2):
                        show = (a, nxt_T)
            if show:
                a, nxt_T = show
                al = min(C.ease((t - a['T']) / 0.2), C.ease((min(nxt_T, a['T'] + 2.6, b['E'] - 0.2) - t) / 0.2))
                if a['kind'] == 'hl':
                    audit.setdefault((b['id'], 'hl', a['w']), []).append((t, al))
                spot(win, view, a['cap']['rect'], a['label'], al, sx)
            # ripples and the stylus (held frames drift a little, like a resting hand)
            dd = ImageDraw.Draw(win, 'RGBA')
            for (tf_, p) in taps:
                k = (idx - tf_) / 12
                if 0 <= k < 1 and b['cb'] and b['cb']['in'] <= tf_ <= b['cb']['end']:
                    x = (p[0] - view[0]) * sx; y = (p[1] - view[1]) * sx
                    rr = (12 + 40 * C.ease(k)) * sx
                    dd.ellipse([x - rr, y - rr, x + rr, y + rr], outline=C.BLUE + (int(210 * (1 - k)),), width=3)
            if hd.get('v', 1) and b['cb']:
                px = (hd['x'] - view[0]) * sx + 3 * math.sin(t * 1.3)
                py = (hd['y'] - view[1]) * sx + 2 * math.sin(t * 0.9)
                if prev_xy:
                    vx = vx * 0.8 + (px - prev_xy[0]) * 0.2
                prev_xy = (px, py)
                C.draw_stylus(win, px, py, hd['h'], max(-10, min(10, -vx * 0.35)), sx)
        if win is not None:
            if cut_from and n - cut_from[1] < 5 and b['kind'] not in ('text', 'logo'):
                win = Image.blend(cut_from[0], win, (n - cut_from[1] + 1) / 5)
            if b['id'] == 'h4' and t - b['S'] < 0.7:
                k = C.ease((t - b['S']) / 0.7)
                C.place_window(f, win, scale=0.88 + 0.12 * k, tilt=16 * (1 - k), alpha=k, dy=30 * (1 - k))
            elif bi > 0 and cards and any(abs(b['S'] - (c['at'] + c['dur'])) < 0.01 for c in cards) and t - b['S'] < 0.6:
                k = C.ease((t - b['S']) / 0.6)
                C.place_window(f, win, scale=0.9 + 0.1 * k, tilt=12 * (1 - k), alpha=k, dy=24 * (1 - k))
            else:
                C.place_window(f, win)
            last_win = win
        # overlays on the stage: phones and chips
        for a in b['acts']:
            if a['kind'] == 'phone' and a['T'] <= t < b['E']:
                im = C.phone_img(a['img'])
                j = [x for x in b['acts'] if x['kind'] == 'phone'].index(a)
                s = C.ease((t - a['T']) / 0.35) * C.ease((b['E'] - t) / 0.3)
                x = WX + WW - (j + 1) * (im.width + 6) + 10
                pim = C.with_alpha(im, s)
                f.paste(pim, (int(x + (1 - s) * 220), WY + 150), pim)
                if abs(t - a['T']) < 0.05:
                    audit.setdefault((b['id'], 'phone', a['w']), []).append((t, s))
        chips = [a for a in b['acts'] if a['kind'] == 'chip' and a['T'] <= t]
        x = WX + WW
        for a in reversed(chips):
            p = C.pill(a['text'], C.F_CHIP, bg=(18, 40, 90, 240))
            s = C.ease((t - a['T']) / 0.25)
            x -= p.width + 6
            pp = C.with_alpha(p, s)
            f.paste(pp, (int(x), int(150 - p.height // 2 + (1 - s) * 12)), pp)
        # kinetic beat title (top band) and captions (under the window)
        if b.get('title') and b['kind'] not in ('text', 'logo', 'endcard'):
            C.kinetic(f, b['title'], WX, 62, C.F_TITLE, (t - b['S']) * FPS - 2)
        words = WORDS.get(b['id']) or []
        tv = t - b['vo_start']
        if 0 <= tv <= VO[b['id']] + 0.2 and b['kind'] not in ('endcard',):
            for chunk in C.caption_chunks_from(words):
                if chunk[0][1] - 0.05 <= tv and (tv < chunk[-1][2] + 0.25):
                    C.draw_caption(f, chunk, tv)
                    break
        write(ff, f, n)
    ff.stdin.close()
    ff.wait()
    return audit


def finish(audit):
    # timeline for the audio mix
    json.dump({'frames': NOUT, 'beats': [{'id': b['id'], 'vo': b['vo_start']} for b in beats], 'cards': [{'at': c['at']} for c in cards]},
              open(os.path.join(HERE, 'renders', 'timeline.json'), 'w'), indent=1)
    write_audit(audit)
    print('frames', NOUT, 'seconds', round(TOTAL, 1))


def chunks(n):
    """Frame ranges that start where a window lands after a chapter card (no state crosses them)."""
    cuts = sorted({int(math.ceil(b['S'] * FPS)) for b in beats if any(abs(b['S'] - (c['at'] + c['dur'])) < 0.01 for c in cards)})
    edges = [0] + [c for c in cuts if 0 < c < NOUT] + [NOUT]
    return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]


def parallel(workers):
    import pickle, time
    from concurrent.futures import ThreadPoolExecutor
    segdir = os.path.join(HERE, 'renders', 'seg')
    os.makedirs(segdir, exist_ok=True)
    rng = chunks(workers)
    t0 = time.time()

    def run(r):
        seg = os.path.join(segdir, f'{r[0]:06d}.mp4')
        subprocess.run([sys.executable, os.path.abspath(__file__), '--seg', seg, '--n0', str(r[0]), '--n1', str(r[1])] + (['--stills', STILLS] if STILLS else []),
                       check=True, stdout=subprocess.DEVNULL)
        print('seg', r, round(time.time() - t0), 's', flush=True)
        return seg
    # longest first so the pool drains evenly
    with ThreadPoolExecutor(workers) as ex:
        segs = list(ex.map(run, sorted(rng, key=lambda r: r[0] - r[1])))
    segs.sort()
    audit = {}
    for sg in segs:
        for k, v in pickle.load(open(sg + '.audit', 'rb')).items():
            audit.setdefault(k, []).extend(v)
    for v in audit.values():
        v.sort()
    lst = os.path.join(segdir, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{sg}'\n" for sg in segs))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart',
                    os.path.join(HERE, 'renders', 'video.mp4')], check=True)
    for sg in segs:
        os.remove(sg); os.remove(sg + '.audit')
    finish(audit)


def write(ff, f, n):
    ff.stdin.write(f.tobytes())
    if STILLS and n % 60 == 0:
        f.resize((640, 360)).save(os.path.join(STILLS, f'{n:05d}.jpg'), quality=80)


def write_audit(audit):
    json.dump({f'{k}': v for k, v in audit.items()}, open(os.path.join(HERE, 'renders', 'audit_raw.json'), 'w'))
    rows, ok = [], 0
    for i, b in enumerate(beats):
        onscreen = b.get('E', b['vo_end']) - b['S']
        for j, a in enumerate(b['acts']):
            if a['kind'] in ('text', 'chip'):
                continue
            anchor = b['vo_start'] + a['wt']
            if a['kind'] in ('act', 'tile'):
                key = (b['id'], [x for x in b['acts'] if x['kind'] == 'tile'].index(a)) if a['kind'] == 'tile' else (b['id'], j)
                series = audit.get(key) or []
                onset = None
                quiet = 0
                onsets = []
                for (tt, df) in series:
                    if tt < anchor - 1.0 or tt > anchor + 0.8:
                        continue
                    if df >= 3 and quiet >= 2:
                        onsets.append(tt)
                    quiet = quiet + 1 if df < 3 else 0
                if onsets:
                    onset = min(onsets, key=lambda x: abs(x - anchor))
                method = 'frame diff (board, act area)' if a['kind'] == 'act' else 'frame diff (tile on screen)'
                if b['kind'] == 'recap':
                    onset = next((tt for tt, _ in audit.get((b['id'], 'recap', [x for x in b['acts'] if x['kind'] == 'tile'].index(a)), [])), None)
                    method = 'tile appears'
            elif a['kind'] == 'hl':
                series = audit.get((b['id'], 'hl', a['w']), [])
                onset = next((tt for tt, al in series if al >= 0.5), None)
                method = 'spotlight alpha ≥ 0.5'
            elif a['kind'] == 'phone':
                onset = a['T']
                method = 'overlay start'
            else:
                continue
            if onset is None:
                rows.append((b['id'], a['w'], anchor, None, None, onscreen, 'FAIL (no change found)', method))
                continue
            dt = (onset - anchor) * 1000
            hold = onscreen if a['kind'] != 'tile' else (min([x['T'] for x in b['acts'] if x['T'] > a['T']] or [b['E']]) - a['T'])
            minimum = 1.5 if a['kind'] == 'tile' else 2.0
            good = -250 <= dt <= 250 and hold >= minimum
            ok += good
            rows.append((b['id'], a['w'], anchor, onset, dt, hold, 'pass' if good else 'FAIL', method))
    lines = ['# Sync audit (v3)', '', f'{ok} of {len(rows)} beats pass (onset within ±250 ms of the anchor word; on screen ≥2 s, montage tiles ≥1.5 s).', '',
             'Onset is measured, not assumed: for board actions it is the first frame where the pixels inside the action area change (after two still frames) in the edited picture; for spotlights, the frame the overlay passes half opacity.', '',
             '| Beat | Anchor word | Anchor (s) | Visual onset (s) | Offset (ms) | On screen (s) | Result | Measured by |', '|---|---|---|---|---|---|---|---|']
    for r in rows:
        lines.append(f'| {r[0]} | {r[1]} | {r[2]:.2f} | {"-" if r[3] is None else f"{r[3]:.2f}"} | {"-" if r[4] is None else f"{r[4]:+.0f}"} | {r[5]:.1f} | {r[6]} | {r[7]} |')
    open(os.path.join(HERE, 'SYNC_AUDIT.md'), 'w').write('\n'.join(lines) + '\n')
    print(f'audit: {ok}/{len(rows)} pass')


if __name__ == '__main__':
    if '--seg' in args:
        import pickle
        seg = args[args.index('--seg') + 1]
        a = main(int(args[args.index('--n0') + 1]), int(args[args.index('--n1') + 1]), seg)
        pickle.dump(a, open(seg + '.audit', 'wb'))
    elif '--parallel' in args:
        parallel(int(args[args.index('--parallel') + 1]))
    else:
        finish(main())

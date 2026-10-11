"""Compositor (v2, SaaS-demo style). Reads the capture stream from a FIFO (512-byte JSON header +
1920x1080 RGBA per frame) and renders the board inside a floating rounded window on the KINETIX
navy/blue-glow stage: an eased camera that zooms and pans to the control in use (following the
stylus), spotlight dimming with callout pills on the spoken word, kinetic feature titles, word-
synced captions under the window, 3D-tilt chapter transitions, the stylus, tap ripples, app insets
and a quick-list chip row. Pipes RGB frames to ffmpeg -> renders/video.mp4; writes renders/timeline.json.

    python3 compose.py <fifo> [--stills dir]
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
W, H, FPS = 1920, 1080, 30
BW, BH = 1920, 1080  # board frame
WX, WY, WW, WH = 176, 128, 1568, 882  # the floating window
FONTS = os.path.join(ROOT, 'packages', 'kinetix_ui', 'fonts')
SHOTS = os.path.join(ROOT, 'marketing', 'promo', 'shots')
NAVY = (7, 12, 28)
BLUE = (47, 128, 255)
CYAN = (120, 196, 255)
WHITE = (255, 255, 255)


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f'Inter-{weight}.ttf'), size)


F_CRUMB = font(700, 20)
F_TITLE = font(700, 40)
F_CAP = font(500, 27)
F_PILL = font(700, 21)
F_CHIP = font(700, 22)
F_BRAND = font(700, 22)

SCRIPT = json.load(open(os.path.join(HERE, 'data', 'script.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo.json')))
WORDS = json.load(open(os.path.join(HERE, 'data', 'words.json')))
VO_TEXT = {s['id']: s['vo'] for c in SCRIPT['chapters'] for s in c['segs']}
CHAPTERS = [c for c in SCRIPT['chapters'] if c['title']]


def ease(s):
    s = max(0.0, min(1.0, s))
    return s * s * (3 - 2 * s)


def rounded(size, radius, fill):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=fill)
    return im


def with_alpha(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.split()[3].point(lambda v: int(v * a)))
    return im


# ------------------------------------------------------------------ stage (background, window chrome)


def make_stage():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g1 = np.exp(-(((xx - W * 0.30) / (W * 0.45)) ** 2 + ((yy - H * 0.95) / (H * 0.55)) ** 2))
    g2 = np.exp(-(((xx - W * 0.82) / (W * 0.35)) ** 2 + ((yy - H * 0.05) / (H * 0.45)) ** 2))
    base = np.zeros((H, W, 3), np.float32) + np.array(NAVY, np.float32)
    base += g1[..., None] * np.array([14, 48, 125], np.float32) + g2[..., None] * np.array([10, 30, 80], np.float32)
    # faint dot grid
    dots = ((xx % 32 < 1.5) & (yy % 32 < 1.5)).astype(np.float32) * 10
    base += dots[..., None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


STAGE = make_stage()
WIN_MASK = rounded((WW, WH), 18, (255, 255, 255, 255)).split()[3]


def make_shadow():
    pad = 90
    sh = Image.new('RGBA', (WW + 2 * pad, WH + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([pad, pad + 26, pad + WW, pad + WH + 26], radius=26, fill=(0, 0, 0, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    glow = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([pad - 6, pad - 6, pad + WW + 6, pad + WH + 6], radius=24, outline=BLUE + (90,), width=8)
    glow = glow.filter(ImageFilter.GaussianBlur(16))
    sh.alpha_composite(glow)
    return sh, pad


SHADOW, SPAD = make_shadow()
BORDER = Image.new('RGBA', (WW, WH), (0, 0, 0, 0))
ImageDraw.Draw(BORDER).rounded_rectangle([0, 0, WW - 1, WH - 1], radius=18, outline=(255, 255, 255, 40), width=2)


def persp_coeffs(src, dst):
    """Coefficients for Image.transform(PERSPECTIVE): maps output points (dst) to input (src)."""
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def place_window(frame, win_rgb, scale=1.0, tilt=0.0, alpha=1.0, dy=0.0):
    """Pastes the window (with shadow) onto the stage; optional 3D tilt about the vertical axis."""
    win = win_rgb.convert('RGBA')
    win.putalpha(WIN_MASK)
    win.alpha_composite(BORDER)
    cx, cy = WX + WW / 2, WY + WH / 2 + dy
    if abs(tilt) < 0.05 and abs(scale - 1) < 0.002:
        if alpha < 0.999:
            win = with_alpha(win, alpha)
        frame.paste(with_alpha(SHADOW, alpha) if alpha < 0.999 else SHADOW, (WX - SPAD, int(WY - SPAD + dy)), with_alpha(SHADOW, alpha) if alpha < 0.999 else SHADOW)
        frame.paste(win, (WX, int(WY + dy)), win)
        return
    a = math.radians(tilt)
    D = 2600.0
    corners = []
    for (x, y) in [(-WW / 2, -WH / 2), (WW / 2, -WH / 2), (WW / 2, WH / 2), (-WW / 2, WH / 2)]:
        x, y = x * scale, y * scale
        z = x * math.sin(a)
        xr = x * math.cos(a)
        f = D / (D + z)
        corners.append((cx + xr * f, cy + y * f))
    src = [(0, 0), (WW, 0), (WW, WH), (0, WH)]
    coeffs = persp_coeffs(src, corners)
    out = win.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR)
    sh = SHADOW.resize((int(SHADOW.width * scale), int(SHADOW.height * scale)))
    sh = with_alpha(sh, alpha * 0.9)
    frame.paste(sh, (int(cx - sh.width / 2), int(cy - sh.height / 2)), sh)
    if alpha < 0.999:
        out = with_alpha(out, alpha)
    frame.paste(out, (0, 0), out)


# ------------------------------------------------------------------ stylus


def make_stylus(scale=4):
    L, Wd = 330 * scale, 24 * scale
    im = Image.new('RGBA', (Wd + 8 * scale, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = im.width // 2
    tip_len, cone_len = 7 * scale, 46 * scale
    for x in range(-Wd // 2, Wd // 2):
        u = (x + Wd / 2) / Wd
        shade = 0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.15)) - 0.25 * u
        d.line([(cx + x, 0), (cx + x, L - cone_len - tip_len)], fill=tuple(int(v * shade) for v in (58, 64, 78)) + (255,))
    d.rounded_rectangle([cx - Wd // 2, 0, cx + Wd // 2, 18 * scale], radius=10 * scale, fill=(40, 44, 54, 255))
    d.rounded_rectangle([cx + Wd // 2 - 5 * scale, 150 * scale, cx + Wd // 2 + 1 * scale, 182 * scale], radius=2 * scale, fill=(30, 33, 40, 255))
    g0 = L - cone_len - tip_len - 70 * scale
    for x in range(-Wd // 2, Wd // 2):
        u = (x + Wd / 2) / Wd
        shade = 0.5 + 0.5 * math.sin(math.pi * min(1, u * 1.15)) - 0.25 * u
        d.line([(cx + x, g0), (cx + x, L - cone_len - tip_len)], fill=tuple(int(v * shade) for v in (34, 37, 46)) + (255,))
    d.rectangle([cx - Wd // 2, g0 - 7 * scale, cx + Wd // 2, g0 - 2 * scale], fill=BLUE + (255,))
    top = L - cone_len - tip_len
    for i in range(cone_len):
        w = (Wd / 2) * (1 - i / cone_len * 0.82)
        for x in range(int(-w), int(w)):
            u = (x + w) / (2 * w + 1e-6)
            shade = 0.6 + 0.4 * math.sin(math.pi * u) - 0.2 * u
            im.putpixel((cx + x, top + i), tuple(int(v * shade) for v in (205, 210, 220)) + (255,))
    d.polygon([(cx - 2.6 * scale, L - tip_len), (cx + 2.6 * scale, L - tip_len), (cx, L - 1)], fill=(25, 25, 30, 255))
    d.line([(cx - Wd // 4, 22 * scale), (cx - Wd // 4, top - 4 * scale)], fill=(255, 255, 255, 60), width=2 * scale)
    return im.resize((im.width // scale, im.height // scale), Image.LANCZOS)


def tilted(base, angle):
    pad = Image.new('RGBA', (base.height * 2, base.height * 2), (0, 0, 0, 0))
    tipx, tipy = pad.width // 2, pad.height // 2
    pad.paste(base, (tipx - base.width // 2, tipy - base.height), base)
    r = pad.rotate(angle, resample=Image.BICUBIC, center=(tipx, tipy))
    bb = r.getbbox()
    return r.crop(bb), (tipx - bb[0], tipy - bb[1])


BASE = make_stylus()
SPRITES, SHADOWS = {}, {}
for sc in (0.8, 1.0, 1.25):
    b = BASE.resize((max(1, int(BASE.width * sc)), int(BASE.height * sc)), Image.LANCZOS)
    for a in range(-10, 11, 2):
        img, tip = tilted(b, -150 + a)
        SPRITES[(sc, a)] = (img, tip)
        P = 30
        sil = Image.new('RGBA', (img.width + 2 * P, img.height + 2 * P), (0, 0, 0, 0))
        al = Image.new('L', sil.size, 0)
        al.paste(img.split()[3].point(lambda v: int(v * 0.42)), (P, P))
        sil.putalpha(al)
        SHADOWS[(sc, a)] = [(sil.filter(ImageFilter.GaussianBlur(bl)), (tip[0] + P, tip[1] + P)) for bl in (2, 5, 9)]


def draw_stylus(frame, x, y, h, angle, zoom):
    sc = min((0.8, 1.0, 1.25), key=lambda v: abs(v - 0.82 * zoom ** 0.6))
    a = max(-10, min(10, int(round(angle / 2)) * 2))
    blur = 0 if h < 0.08 else (1 if h < 0.3 else 2)
    sh, tip = SHADOWS[(sc, a)][blur]
    ox, oy = (6 + h * 42) * sc, (8 + h * 34) * sc
    frame.paste(sh, (int(x + ox - tip[0]), int(y + oy - tip[1])), sh)
    img, tip = SPRITES[(sc, a)]
    frame.paste(img, (int(x - tip[0]), int(y - tip[1])), img)


# ------------------------------------------------------------------ text pieces

_cache = {}


def pill(text, fnt=F_PILL, bg=BLUE + (245,), fg=WHITE, pad=(16, 8)):
    key = ('pill', text, fnt.size, bg)
    if key not in _cache:
        tw = fnt.getlength(text)
        asc, desc = fnt.getmetrics()
        hgt = asc + desc + 2 * pad[1]
        im = Image.new('RGBA', (int(tw + 2 * pad[0]) + 8, hgt + 8), (0, 0, 0, 0))
        sh = rounded((im.width - 8, hgt), hgt // 2, (0, 0, 0, 90)).filter(ImageFilter.GaussianBlur(3))
        im.paste(sh, (4, 6), sh)
        body = rounded((im.width - 8, hgt), hgt // 2, bg)
        ImageDraw.Draw(body).text((pad[0], pad[1]), text, font=fnt, fill=fg)
        im.paste(body, (0, 0), body)
        _cache[key] = im
    return _cache[key]


def text_img(text, fnt, fill=WHITE):
    key = ('t', text, fnt.size, fill)
    if key not in _cache:
        asc, desc = fnt.getmetrics()
        im = Image.new('RGBA', (int(fnt.getlength(text)) + 4, asc + desc + 4), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((2, 2), text, font=fnt, fill=fill)
        _cache[key] = im
    return _cache[key]


def kinetic(frame, text, x, y, fnt, age, out_age=None, fill=WHITE):
    """Word-by-word rise-and-fade; [out_age] counts frames since it started leaving."""
    words = text.split(' ')
    cx = x
    for i, w in enumerate(words):
        im = text_img(w, fnt, fill)
        s = ease((age - i * 2) / 8)
        a = s
        dyy = (1 - s) * 16
        if out_age is not None:
            o = ease(out_age / 6)
            a *= 1 - o
            dyy -= o * 14
        if a > 0.01:
            frame.paste(with_alpha(im, a), (int(cx), int(y + dyy)), with_alpha(im, a))
        cx += im.width + fnt.getlength(' ') - 4


# ------------------------------------------------------------------ captions (word-synced)


def caption_chunks(seg):
    ws = WORDS.get(seg) or []
    chunks, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) >= 8 or (len(cur) >= 4 and w[0][-1:] in ',.:;?!'):
            chunks.append(cur)
            cur = []
    if cur:
        if chunks and len(cur) <= 2:
            chunks[-1] += cur
        else:
            chunks.append(cur)
    return chunks


def draw_caption(frame, chunk, t):
    words = [w[0] for w in chunk]
    full = ' '.join(words)
    tw = F_CAP.getlength(full)
    x = (W - tw) / 2
    y = WY + WH + 22
    d = ImageDraw.Draw(frame)
    for (w, st, en) in chunk:
        col = (255, 255, 255) if t < st else (CYAN if t < en + 0.05 else (232, 238, 255))
        if t < st:
            col = (150, 165, 200)
        d.text((x + 1, y + 2), w, font=F_CAP, fill=(0, 0, 0))
        d.text((x, y), w, font=F_CAP, fill=col)
        x += F_CAP.getlength(w + ' ')


# ------------------------------------------------------------------ cards and phones


def phone(path, label, h=560):
    shot = Image.open(path).convert('RGB')
    w = int(h * shot.width / shot.height)
    shot = shot.resize((w, h), Image.LANCZOS)
    frame = rounded((w + 20, h + 20), 40, (16, 18, 24, 255))
    mask = rounded((w, h), 32, (0, 0, 0, 255)).split()[3]
    frame.paste(shot, (10, 10), mask)
    lab = pill(label, F_PILL, bg=(10, 18, 40, 235))
    out = Image.new('RGBA', (max(frame.width, lab.width) + 40, frame.height + 70), (0, 0, 0, 0))
    sh = rounded((frame.width, frame.height), 40, (0, 0, 0, 130)).filter(ImageFilter.GaussianBlur(14))
    fx = (out.width - frame.width) // 2
    out.paste(sh, (fx + 4, 22), sh)
    out.paste(frame, (fx, 6), frame)
    out.paste(lab, ((out.width - lab.width) // 2, frame.height + 18), lab)
    return out


PHONE_LABEL = {'teacher': 'KINETIX Teacher', 'student': 'KINETIX Student', 'parent': 'KINETIX Parent'}
_phones = {}


def phone_img(name):
    if name not in _phones:
        _phones[name] = phone(os.path.join(SHOTS, name), PHONE_LABEL[name.split('-')[0]])
    return _phones[name]


def header(frame, crumb, chips_now, out_n):
    """Brand + chapter dots (top right)."""
    d = ImageDraw.Draw(frame, 'RGBA')
    b = 'KINETIX Board'
    bx = WX + WW - F_BRAND.getlength(b)
    d.text((bx, 40), b, font=F_BRAND, fill=(255, 255, 255, 170))
    n = len(CHAPTERS)
    for k in range(n):
        x = WX + WW - (n - k) * 18 + 6
        on = k < crumb
        d.ellipse([x - 4, 80 - 4, x + 4, 80 + 4], fill=(BLUE + (235,)) if on else (255, 255, 255, 46))


# ------------------------------------------------------------------ main


class Spring:
    """Second-order smoothing (ease-in-out feel) for the camera."""

    def __init__(self, v, k=0.16):
        self.a = self.b = v
        self.k = k

    def step(self, target):
        self.a += (target - self.a) * self.k
        self.b += (self.a - self.b) * self.k
        return self.b


def main():
    fifo = sys.argv[1]
    stills = sys.argv[sys.argv.index('--stills') + 1] if '--stills' in sys.argv else None
    out_path = os.path.join(HERE, 'renders', 'video.mp4')
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path], stdin=subprocess.PIPE)
    src = open(fifo, 'rb')
    out_n = 0
    timeline = {'segs': [], 'cards': [], 'end': None}
    last_win = Image.new('RGB', (WW, WH), (250, 250, 248))
    focuses, hls, ripples, insets, titles, chips = [], [], [], [], [], []
    captions = []  # (start_frame, chunk)
    seg_vo = None  # (vo frame0, seg id)
    prev_xy, vx = None, 0.0
    vo_end, drop_k = 0, 0
    cam_x, cam_y, cam_z = Spring(BW / 2), Spring(BH / 2), Spring(0.0)
    enter_at = 0  # window entrance (tilt) start frame
    crumb_num, crumb_title = 0, ''
    prev_view = None
    last_raw = last_win

    def write(im):
        nonlocal out_n
        ff.stdin.write(im.tobytes())
        if stills and out_n % 90 == 0:
            im.resize((640, 360)).save(os.path.join(stills, f'{out_n:05d}.jpg'), quality=80)
        out_n += 1

    def stage_frame():
        f = STAGE.copy()
        header(f, crumb_num, chips, out_n)
        return f

    while True:
        head = src.read(512)
        if len(head) < 512:
            break
        hd = json.loads(head.decode('utf-8').strip())
        nb = hd.get('nb', 0)
        if hd.get('end'):
            break
        if 'card' in hd or 'endcard' in hd:
            end = 'endcard' in hd
            n = hd['frames']
            if end:
                timeline['end'] = {'at': out_n, 'n': n}
                timeline['segs'].append({'id': hd.get('seg', 's112'), 'at': out_n, 'voOff': 18, 'end': True})
            else:
                timeline['cards'].append({'at': out_n, 'n': n, 'title': hd['card'], 'num': hd['num']})
                crumb_num, crumb_title = hd['num'], hd['card']
            title = 'KINETIX' if end else hd['card']
            for i in range(n):
                f = stage_frame()
                # previous window recedes
                k = ease(i / 12)
                if k < 1:
                    place_window(f, last_win, scale=1 - 0.12 * k, tilt=-10 * k, alpha=1 - k, dy=20 * k)
                d = ImageDraw.Draw(f, 'RGBA')
                if end:
                    s = ease((i - 6) / 16)
                    fl = font(700, 132)
                    tw = fl.getlength('KINETIX')
                    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                    ImageDraw.Draw(glow).text(((W - tw) / 2, 380), 'KINETIX', font=fl, fill=BLUE + (int(200 * s),))
                    glow = glow.filter(ImageFilter.GaussianBlur(18))
                    f.paste(glow, (0, 0), glow)
                    d.text(((W - tw) / 2, 380), 'KINETIX', font=fl, fill=(255, 255, 255, int(255 * s)))
                    kinetic(f, 'Board', (W - font(500, 44).getlength('Board')) / 2, 545, font(500, 44), i - 14, fill=CYAN)
                    tag = 'Every lesson, connected.'
                    kinetic(f, tag, (W - font(400, 34).getlength(tag)) / 2, 640, font(400, 34), i - 26, fill=(220, 230, 255))
                else:
                    num = f'{hd["num"]:02d}'
                    fn = font(400, 30)
                    kinetic(f, f'CHAPTER {num}', (W - fn.getlength(f'CHAPTER {num}')) / 2, 448, fn, i - 4, fill=CYAN)
                    ft = font(700, 64)
                    kinetic(f, title, (W - ft.getlength(title)) / 2, 495, ft, i - 7)
                    lw = ft.getlength(title) * ease((i - 12) / 14)
                    d.rounded_rectangle([W / 2 - lw / 2, 590, W / 2 + lw / 2, 594], radius=2, fill=BLUE + (230,))
                write(f)
            focuses.clear(); hls.clear(); insets.clear(); titles.clear(); chips.clear(); captions.clear()
            enter_at = out_n
            cam_x.a = cam_x.b = BW / 2; cam_y.a = cam_y.b = BH / 2; cam_z.a = cam_z.b = 0.0
            continue
        raw = src.read(nb)
        if len(raw) < nb:
            break
        board = Image.frombuffer('RGBA', (BW, BH), raw, 'raw', 'RGBA', 0, 1)
        for e in hd.get('ev', []):
            if 'seg' in e:
                sid = e['seg']
                off = e.get('voOff', 0)
                timeline['segs'].append({'id': sid, 'at': out_n, 'voOff': off})
                v0 = out_n + off
                captions[:] = [(v0 + int(ch[0][1] * FPS), v0 + int((nxt[0][1] if nxt else ch[-1][2] + 0.3) * FPS), ch, v0)
                               for ch, nxt in zip(caption_chunks(sid), caption_chunks(sid)[1:] + [None])]
                vo_end = v0 + int(VO.get(sid, 0) * FPS)
                drop_k = 0
            if 'focus' in e or 'zoom' in e:
                r = e.get('focus') or e.get('zoom')
                focuses.append((out_n, out_n + e['dur'], r))
            if 'hl' in e:
                hls.append((out_n, out_n + e['dur'], e['hl'], e.get('label'), e.get('zoom', True)))
            if 'callout' in e:
                hls.append((out_n, out_n + e['dur'], e['rect'], e['callout'], False))
            if 'tap' in e:
                ripples.append((out_n, e['tap']))
            if 'inset' in e:
                insets.append((out_n + e.get('delay', 0), out_n + e.get('delay', 0) + e['dur'], e['inset'], e.get('slot', 0)))
            if 'title' in e:
                titles.append((out_n + e.get('in', 0), e['title']))
            if 'chip' in e:
                chips.append((out_n, e['chip']))

        # speed-ramp stretches with no voice
        idle = out_n - vo_end
        if idle > 6 and out_n - enter_at > 20:
            drop_k += 1
            if drop_k % (2 if idle < 30 else 3):
                continue

        # ---- camera target
        tgt = None
        for (a, b, r) in focuses:
            if a <= out_n < b:
                tgt = r
        for (a, b, r, lab, z) in hls:
            if z and a <= out_n < b:
                tgt = [r[0] - r[2] * 0.6, r[1] - r[3] * 0.9, r[2] * 2.2, r[3] * 2.8]
        if tgt:
            zt = min(BW / max(tgt[2], 1), BH / max(tgt[3], 1))
            zt = max(1.0, min(1.7, zt * 0.92))
            tx, ty = tgt[0] + tgt[2] / 2, tgt[1] + tgt[3] / 2
            # stylus-follow: lean towards the pen when it is near the edge of the framing
            px, py = hd['x'], hd['y']
            vw, vh = BW / zt, BH / zt
            if abs(px - tx) > vw * 0.38:
                tx += (px - tx) - math.copysign(vw * 0.38, px - tx)
            if abs(py - ty) > vh * 0.38:
                ty += (py - ty) - math.copysign(vh * 0.38, py - ty)
        else:
            zt, tx, ty = 1.0, BW / 2, BH / 2
        z = math.exp(cam_z.step(math.log(zt)))
        vw, vh = BW / z, BH / z
        cx = cam_x.step(tx)
        cy = cam_y.step(ty)
        cx = min(max(cx, vw / 2), BW - vw / 2)
        cy = min(max(cy, vh / 2), BH - vh / 2)
        vx0, vy0 = cx - vw / 2, cy - vh / 2
        view = (vx0, vy0, vw, vh)
        sx = WW / vw

        def tf(bx, by):
            return (bx - vx0) * sx, (by - vy0) * sx

        win = board.crop((int(vx0), int(vy0), int(vx0 + vw), int(vy0 + vh))).resize((WW, WH), Image.BICUBIC).convert('RGB')
        prev_view = view
        d = ImageDraw.Draw(win, 'RGBA')

        # ---- spotlight (dim the rest) + callout pills
        active = [(a, b, r, lab) for (a, b, r, lab, zz) in hls if a <= out_n < b]
        if active:
            a, b, r, lab = active[-1]
            al = min(ease((out_n - a) / 7), ease((b - out_n) / 7))
            x0, y0 = tf(r[0], r[1]); x1, y1 = tf(r[0] + r[2], r[1] + r[3])
            dim = Image.new('L', (WW // 4, WH // 4), int(120 * al))
            ImageDraw.Draw(dim).rounded_rectangle([x0 / 4 - 2, y0 / 4 - 2, x1 / 4 + 2, y1 / 4 + 2], radius=4, fill=0)
            dim = dim.filter(ImageFilter.GaussianBlur(2)).resize((WW, WH), Image.BILINEAR)
            win.paste(Image.new('RGB', (WW, WH), NAVY), (0, 0), dim)
            d = ImageDraw.Draw(win, 'RGBA')
        for idx, (a, b, r, lab) in enumerate(active):
            al = min(ease((out_n - a) / 7), ease((b - out_n) / 7))
            if idx < len(active) - 1:
                al *= 0.35
                lab = None
            x0, y0 = tf(r[0], r[1]); x1, y1 = tf(r[0] + r[2], r[1] + r[3])
            d.rounded_rectangle([x0, y0, x1, y1], radius=12, outline=CYAN + (int(235 * al),), width=3)
            if lab:
                p = pill(lab)
                above = y0 - p.height - 26 > 8
                py_ = y0 - p.height - 22 if above else y1 + 22
                px_ = min(max((x0 + x1) / 2 - p.width / 2, 10), WW - p.width - 10)
                lift = (1 - ease((out_n - a) / 8)) * (10 if above else -10)
                ly0 = py_ + (p.height - 8 if above else 0) + lift
                ly1 = y0 if above else y1
                lxx = min(max((x0 + x1) / 2, px_ + 20), px_ + p.width - 28)
                d.line([(lxx, ly0), (lxx, ly1)], fill=CYAN + (int(220 * al),), width=2)
                d.ellipse([lxx - 4, ly1 - 4, lxx + 4, ly1 + 4], fill=CYAN + (int(255 * al),))
                pp = with_alpha(p, al)
                win.paste(pp, (int(px_), int(py_ + lift)), pp)
        hls[:] = [h for h in hls if h[1] > out_n]

        # ---- ripples
        for (a, p) in ripples:
            k = (out_n - a) / 14
            if 0 <= k < 1:
                x, y = tf(*p)
                rr = (12 + 40 * ease(k)) * sx
                d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=BLUE + (int(210 * (1 - k)),), width=3)
                if k < 0.4:
                    q = 11 * sx
                    d.ellipse([x - q, y - q, x + q, y + q], fill=CYAN + (int(110 * (1 - k / 0.4)),))
        ripples[:] = [r for r in ripples if out_n - r[0] < 15]

        # ---- stylus
        if hd.get('v', 1):
            px, py = tf(hd['x'], hd['y'])
            if prev_xy:
                vx = vx * 0.8 + (px - prev_xy[0]) * 0.2
            prev_xy = (px, py)
            draw_stylus(win, px, py, hd['h'], max(-10, min(10, -vx * 0.35)), z)

        # ---- compose the stage
        f = stage_frame()
        age = out_n - enter_at
        if age < 18:
            k = ease(age / 18)
            place_window(f, win, scale=0.9 + 0.1 * k, tilt=14 * (1 - k), alpha=k, dy=30 * (1 - k))
        else:
            place_window(f, win)
        last_win = win

        # app phones over the window
        for (a, b, names, slot) in insets:
            if a <= out_n < b:
                for j, nm in enumerate(names):
                    im = phone_img(nm)
                    s = ease((out_n - a) / 12) * ease((b - out_n) / 10)
                    x = WX + WW - (slot + j + 1) * (im.width + 6) + 10
                    pim = with_alpha(im, s)
                    f.paste(pim, (int(x + (1 - s) * 260), WY + 150), pim)
        insets[:] = [i for i in insets if i[1] > out_n]

        # kinetic titles (top band): latest started title, previous one leaving
        started = [t for t in titles if t[0] <= out_n]
        if crumb_title:
            ImageDraw.Draw(f).text((WX + 2, 30), f'{crumb_num:02d}  ·  {crumb_title.upper()}', font=F_CRUMB, fill=CYAN)
        if started:
            cur = started[-1]
            if len(started) > 1 and out_n - cur[0] < 6:
                kinetic(f, started[-2][1], WX, 62, F_TITLE, 99, out_age=out_n - cur[0])
            kinetic(f, cur[1], WX, 62, F_TITLE, out_n - cur[0] - (6 if len(started) > 1 else 0))
        # quick-list chips row (top right, under the brand)
        if chips:
            x = WX + WW
            for (a, text) in reversed(chips):
                p = pill(text, F_CHIP, bg=(18, 40, 90, 240))
                s = ease((out_n - a) / 8)
                x -= p.width + 6
                pp = with_alpha(p, s)
                f.paste(pp, (int(x), int(96 - p.height // 2 + (1 - s) * 12)), pp)
        # captions
        for (a, b, chunk, v0) in captions:
            if a <= out_n < b:
                draw_caption(f, chunk, (out_n - v0) / FPS)
        write(f)

    ff.stdin.close()
    ff.wait()
    timeline['frames'] = out_n
    json.dump(timeline, open(os.path.join(HERE, 'renders', 'timeline.json'), 'w'), indent=1)
    print('frames', out_n, 'seconds', round(out_n / FPS, 1))


if __name__ == '__main__':
    main()

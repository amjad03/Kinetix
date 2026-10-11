"""Compositor: reads the capture stream (512-byte JSON header + 1920x1080 RGBA per frame) from a
FIFO, adds the stylus, tap ripples, zooms, callouts, captions, chapter cards, app insets and the
progress line, and pipes RGB frames to ffmpeg. Writes renders/video.mp4 and renders/timeline.json.

    python3 compose.py <fifo> [--stills dir]   (--stills: also save every 90th frame as JPEG)
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
W, H, FPS = 1920, 1080, 30
FONTS = os.path.join(ROOT, 'packages', 'kinetix_ui', 'fonts')
SHOTS = os.path.join(ROOT, 'marketing', 'promo', 'shots')
NAVY = (8, 14, 32)
BLUE = (47, 128, 255)
CYAN = (110, 190, 255)


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f'Inter-{weight}.ttf'), size)


SCRIPT = json.load(open(os.path.join(HERE, 'data', 'script.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo.json')))
VO_TEXT = {s['id']: s['vo'] for c in SCRIPT['chapters'] for s in c['segs']}
CHAPTERS = [c for c in SCRIPT['chapters'] if c['title']]

# ------------------------------------------------------------------ stylus sprite


def make_stylus(scale=4):
    """A slim active stylus: graphite barrel, KINETIX-blue ring, grey cone and a dark nib.
    Drawn pointing straight down (tip at the bottom centre), then tilted."""
    L, Wd = 330 * scale, 24 * scale
    im = Image.new('RGBA', (Wd + 8 * scale, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = im.width // 2
    tip_len, cone_len = 7 * scale, 46 * scale
    # barrel with a soft cylindrical shade
    for x in range(-Wd // 2, Wd // 2):
        u = (x + Wd / 2) / Wd
        shade = 0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.15)) - 0.25 * u
        c = tuple(int(v * shade) for v in (58, 64, 78))
        d.line([(cx + x, 0), (cx + x, L - cone_len - tip_len)], fill=c + (255,))
    # cap end
    d.rounded_rectangle([cx - Wd // 2, 0, cx + Wd // 2, 18 * scale], radius=10 * scale, fill=(40, 44, 54, 255))
    # side button and grip
    d.rounded_rectangle([cx + Wd // 2 - 5 * scale, 150 * scale, cx + Wd // 2 + 1 * scale, 182 * scale], radius=2 * scale, fill=(30, 33, 40, 255))
    g0 = L - cone_len - tip_len - 70 * scale
    for x in range(-Wd // 2, Wd // 2):
        u = (x + Wd / 2) / Wd
        shade = 0.5 + 0.5 * math.sin(math.pi * min(1, u * 1.15)) - 0.25 * u
        c = tuple(int(v * shade) for v in (34, 37, 46))
        d.line([(cx + x, g0), (cx + x, L - cone_len - tip_len)], fill=c + (255,))
    # blue ring
    d.rectangle([cx - Wd // 2, g0 - 7 * scale, cx + Wd // 2, g0 - 2 * scale], fill=BLUE + (255,))
    # cone
    top = L - cone_len - tip_len
    for i in range(cone_len):
        w = (Wd / 2) * (1 - i / cone_len * 0.82)
        for x in range(int(-w), int(w)):
            u = (x + w) / (2 * w + 1e-6)
            shade = 0.6 + 0.4 * math.sin(math.pi * u) - 0.2 * u
            c = tuple(int(v * shade) for v in (205, 210, 220))
            im.putpixel((cx + x, top + i), c + (255,))
    # nib
    d.polygon([(cx - 2.6 * scale, L - tip_len), (cx + 2.6 * scale, L - tip_len), (cx, L - 1)], fill=(25, 25, 30, 255))
    # highlight streak
    d.line([(cx - Wd // 4, 22 * scale), (cx - Wd // 4, top - 4 * scale)], fill=(255, 255, 255, 60), width=2 * scale)
    im = im.resize((im.width // scale, im.height // scale), Image.LANCZOS)
    return im


def tilted(base, angle):
    """Rotates the pen (pointing down) by [angle] degrees about its tip; returns (img, tip offset)."""
    pad = Image.new('RGBA', (base.height * 2, base.height * 2), (0, 0, 0, 0))
    tipx, tipy = pad.width // 2, pad.height // 2
    pad.paste(base, (tipx - base.width // 2, tipy - base.height), base)
    r = pad.rotate(angle, resample=Image.BICUBIC, center=(tipx, tipy))
    bb = r.getbbox()
    r = r.crop(bb)
    return r, (tipx - bb[0], tipy - bb[1])


BASE = make_stylus()
SPRITES = {}
for a in range(-10, 11, 2):
    SPRITES[a] = tilted(BASE, -150 + a)  # barrel up and to the right, like a right hand
SHADOWS = {}
for a in range(-10, 11, 2):
    img, tip = SPRITES[a]
    P = 30
    sil = Image.new('RGBA', (img.width + 2 * P, img.height + 2 * P), (0, 0, 0, 0))
    alpha = Image.new('L', sil.size, 0)
    alpha.paste(img.split()[3].point(lambda v: int(v * 0.42)), (P, P))
    sil.putalpha(alpha)
    SHADOWS[a] = [(sil.filter(ImageFilter.GaussianBlur(b)), (tip[0] + P, tip[1] + P)) for b in (2, 5, 9)]


def draw_stylus(frame, x, y, h, angle):
    a = max(-10, min(10, int(round(angle / 2)) * 2))
    blur = 0 if h < 0.08 else (1 if h < 0.3 else 2)
    sh, tip = SHADOWS[a][blur]
    ox, oy = 6 + h * 42, 8 + h * 34
    frame.paste(sh, (int(x + ox - tip[0]), int(y + oy - tip[1])), sh)
    img, tip = SPRITES[a]
    frame.paste(img, (int(x - tip[0]), int(y - tip[1])), img)
    if h < 0.04:  # contact glint
        d = ImageDraw.Draw(frame, 'RGBA')
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=CYAN + (90,))


# ------------------------------------------------------------------ overlays


def rounded(size, radius, fill):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=fill)
    return im


_text_cache = {}


def pill_text(text, fnt, pad=(26, 14), bg=(10, 18, 40, 215), fg=(255, 255, 255), border=None):
    key = (text, fnt.size, bg, border)
    if key in _text_cache:
        return _text_cache[key]
    tw = fnt.getlength(text)
    asc, desc = fnt.getmetrics()
    im = rounded((int(tw + 2 * pad[0]), asc + desc + 2 * pad[1]), (asc + desc) // 2 + pad[1], bg)
    d = ImageDraw.Draw(im)
    if border:
        d.rounded_rectangle([1, 1, im.width - 2, im.height - 2], radius=im.height // 2, outline=border, width=2)
    d.text((pad[0], pad[1]), text, font=fnt, fill=fg)
    _text_cache[key] = im
    return im


def with_alpha(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.split()[3].point(lambda v: int(v * a)))
    return im


def ease(s):
    s = max(0.0, min(1.0, s))
    return s * s * (3 - 2 * s)


def caption_chunks(text, n_words=9):
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= n_words or (len(cur) >= 5 and w[-1] in ',.:;?!'):
            chunks.append(' '.join(cur))
            cur = []
    if cur:
        if chunks and len(cur) <= 2:
            chunks[-1] += ' ' + ' '.join(cur)
        else:
            chunks.append(' '.join(cur))
    return chunks


CAP_FONT = font(500, 30)
CALL_FONT = font(700, 28)


def glow_bg(seed_frame=None):
    """Navy with a soft KINETIX-blue glow; optionally over a blurred, darkened board frame."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g = np.exp(-(((xx - W * 0.5) / (W * 0.42)) ** 2 + ((yy - H * 0.55) / (H * 0.5)) ** 2))
    base = np.zeros((H, W, 3), np.float32) + np.array(NAVY, np.float32)
    base += g[..., None] * np.array([12, 38, 100], np.float32)
    if seed_frame is not None:
        bl = np.asarray(seed_frame.resize((W // 8, H // 8)).filter(ImageFilter.GaussianBlur(6)).resize((W, H), Image.BILINEAR), np.float32)
        base = base * 0.9 + bl * 0.1
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def render_card(num, title, seed, n):
    bg = glow_bg(seed)
    out = []
    f_num = font(700, 34)
    f_t = font(700, 76)
    for i in range(n):
        im = bg.copy()
        d = ImageDraw.Draw(im, 'RGBA')
        s = ease(i / 9)
        tw = f_t.getlength(title)
        x0 = (W - tw) / 2
        y = 470 + (1 - s) * 30
        a = int(255 * s)
        label = f'{num:02d} / {len(CHAPTERS):02d}'
        d.text(((W - f_num.getlength(label)) / 2, y - 70), label, font=f_num, fill=CYAN + (a,))
        d.text((x0, y), title, font=f_t, fill=(255, 255, 255, a))
        lw = tw * ease((i - 4) / 14)
        d.rounded_rectangle([W / 2 - lw / 2, y + 112, W / 2 + lw / 2, y + 117], radius=3, fill=BLUE + (int(220 * s),))
        # progress dots
        for k in range(len(CHAPTERS)):
            cx = W / 2 + (k - (len(CHAPTERS) - 1) / 2) * 28
            on = k < num
            d.ellipse([cx - 5, 900 - 5, cx + 5, 900 + 5], fill=(BLUE + (230,)) if on else (255, 255, 255, 50))
        out.append(im)
    return out


def render_end(seed, n):
    bg = glow_bg(seed)
    f_logo = font(700, 132)
    f_sub = font(500, 44)
    f_tag = font(400, 34)
    out = []
    for i in range(n):
        im = bg.copy()
        d = ImageDraw.Draw(im, 'RGBA')
        s = ease(i / 18)
        a = int(255 * s)
        t = 'KINETIX'
        tw = f_logo.getlength(t)
        glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).text(((W - tw) / 2, 380), t, font=f_logo, fill=BLUE + (int(200 * s),))
        im.paste(glow.filter(ImageFilter.GaussianBlur(18)), (0, 0), glow.filter(ImageFilter.GaussianBlur(18)))
        d.text(((W - tw) / 2, 380), t, font=f_logo, fill=(255, 255, 255, a))
        sub = 'Board'
        d.text(((W - f_sub.getlength(sub)) / 2, 545), sub, font=f_sub, fill=CYAN + (a,))
        s2 = ease((i - 20) / 18)
        tag = 'Every lesson, connected.'
        d.text(((W - f_tag.getlength(tag)) / 2, 640), tag, font=f_tag, fill=(220, 230, 255, int(255 * s2)))
        out.append(im)
    return out


def phone(path, label, h=640):
    shot = Image.open(path).convert('RGB')
    w = int(h * shot.width / shot.height)
    shot = shot.resize((w, h), Image.LANCZOS)
    frame = rounded((w + 24, h + 24), 46, (16, 18, 24, 255))
    mask = rounded((w, h), 36, (0, 0, 0, 255)).split()[3]
    frame.paste(shot, (12, 12), mask)
    lab = pill_text(label, font(700, 24), pad=(18, 8), bg=(10, 18, 40, 230))
    out = Image.new('RGBA', (frame.width + 40, frame.height + 80), (0, 0, 0, 0))
    sh = rounded((frame.width, frame.height), 46, (0, 0, 0, 120)).filter(ImageFilter.GaussianBlur(14))
    out.paste(sh, (24, 30), sh)
    out.paste(frame, (20, 10), frame)
    out.paste(lab, ((out.width - lab.width) // 2, frame.height + 30), lab)
    return out


PHONE_LABEL = {'teacher': 'KINETIX Teacher', 'student': 'KINETIX Student', 'parent': 'KINETIX Parent'}
_phones = {}


def phone_img(name):
    if name not in _phones:
        _phones[name] = phone(os.path.join(SHOTS, name), PHONE_LABEL[name.split('-')[0]])
    return _phones[name]


# ------------------------------------------------------------------ main loop


def main():
    fifo = sys.argv[1]
    stills = sys.argv[sys.argv.index('--stills') + 1] if '--stills' in sys.argv else None
    out_path = os.path.join(HERE, 'renders', 'video.mp4')
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path], stdin=subprocess.PIPE)
    src = open(fifo, 'rb')
    out_n = 0
    timeline = {'segs': [], 'cards': [], 'end': None}
    last = Image.new('RGB', (W, H), NAVY)
    zooms, callouts, ripples, insets, captions = [], [], [], [], []
    prev_xy = None
    vx = 0.0
    vo_end = 0  # output frame where the current voice-over line ends
    drop_k = 0

    def write(im):
        nonlocal out_n
        ff.stdin.write(im.tobytes())
        if stills and out_n % 90 == 0:
            im.resize((640, 360)).save(os.path.join(stills, f'{out_n:05d}.jpg'), quality=80)
        out_n += 1

    while True:
        head = src.read(512)
        if len(head) < 512:
            break
        hd = json.loads(head.decode('utf-8').strip())
        nb = hd.get('nb', 0)
        if hd.get('end'):
            break
        if 'card' in hd:
            timeline['cards'].append({'at': out_n, 'n': hd['frames'], 'title': hd['card'], 'num': hd['num']})
            for im in render_card(hd['num'], hd['card'], last, hd['frames']):
                write(im)
            zooms.clear(); callouts.clear(); insets.clear()
            continue
        if 'endcard' in hd:
            timeline['end'] = {'at': out_n, 'n': hd['frames']}
            timeline['segs'].append({'id': hd.get('seg', 's112'), 'at': out_n, 'afterCard': False, 'end': True})
            for im in render_end(last, hd['frames']):
                write(im)
            continue
        raw = src.read(nb)
        if len(raw) < nb:
            break
        f = Image.frombuffer('RGBA', (W, H), raw, 'raw', 'RGBA', 0, 1).convert('RGB')
        last = f
        for e in hd.get('ev', []):
            if 'seg' in e:
                sid = e['seg']
                timeline['segs'].append({'id': sid, 'at': out_n, 'afterCard': e.get('afterCard', False)})
                vo_at = out_n + (-int(0.8 * FPS) if e.get('afterCard') else -int(0.2 * FPS))
                dur = VO.get(sid, 0) * FPS
                chunks = caption_chunks(VO_TEXT.get(sid, ''))
                tot = sum(len(c) for c in chunks) or 1
                t0 = vo_at
                for c in chunks:
                    n = dur * len(c) / tot
                    captions.append((max(t0, out_n), t0 + n, c))
                    t0 += n
                vo_end = vo_at + dur
                drop_k = 0
            if 'zoom' in e:
                zooms.append((out_n, out_n + e['dur'], e['zoom']))
            if 'callout' in e:
                callouts.append((out_n, out_n + e['dur'], e['callout'], e['rect']))
            if 'tap' in e:
                ripples.append((out_n, e['tap']))
            if 'inset' in e:
                insets.append((out_n + e.get('delay', 0), out_n + e.get('delay', 0) + e['dur'], e['inset']))

        # speed-ramp the stretches with no voice: 2x after a short breath, 3x if it drags on
        idle = out_n - vo_end
        if idle > 10:
            drop_k += 1
            step = 2 if idle < 30 else 3
            if drop_k % step:
                continue

        # zoom (one at a time; eased in and out)
        z = None
        for (a, b, r) in zooms:
            if a <= out_n < b:
                k = min(ease((out_n - a) / 14), ease((b - out_n) / 14))
                x, y, w, h = r
                w = max(w, 760); h = w * 9 / 16 if w * 9 / 16 >= h else h
                w = h * 16 / 9
                w, h = min(w, W), min(h, H)
                cx, cy = x + r[2] / 2, y + r[3] / 2
                x0 = min(max(cx - w / 2, 0), W - w); y0 = min(max(cy - h / 2, 0), H - h)
                z = (x0 * k, y0 * k, W + (w - W) * k, H + (h - H) * k)
        def tf(px, py):
            if not z:
                return px, py
            return (px - z[0]) * W / z[2], (py - z[1]) * H / z[3]
        if z and z[2] < W - 1:
            f = f.crop((int(z[0]), int(z[1]), int(z[0] + z[2]), int(z[1] + z[3]))).resize((W, H), Image.BICUBIC)
        d = ImageDraw.Draw(f, 'RGBA')
        sc = W / z[2] if z else 1.0

        # callouts: outline + label
        for (a, b, text, r) in callouts:
            if a <= out_n < b:
                al = min(ease((out_n - a) / 8), ease((b - out_n) / 8))
                x0, y0 = tf(r[0], r[1]); x1, y1 = tf(r[0] + r[2], r[1] + r[3])
                d.rounded_rectangle([x0 - 6, y0 - 6, x1 + 6, y1 + 6], radius=14, outline=BLUE + (int(230 * al),), width=4)
                lab = with_alpha(pill_text(text, CALL_FONT, bg=(47, 128, 255, 240)), al)
                lx = int(min(max((x0 + x1) / 2 - lab.width / 2, 20), W - lab.width - 20))
                ly = int(y0 - lab.height - 18) if y0 - lab.height - 18 > 60 else int(y1 + 18)
                f.paste(lab, (lx, ly), lab)

        # tap ripples
        for (a, p) in ripples:
            k = (out_n - a) / 14
            if 0 <= k < 1:
                x, y = tf(*p)
                rr = (14 + 46 * ease(k)) * sc
                d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=BLUE + (int(200 * (1 - k)),), width=4)
                if k < 0.4:
                    d.ellipse([x - 12 * sc, y - 12 * sc, x + 12 * sc, y + 12 * sc], fill=CYAN + (int(110 * (1 - k / 0.4)),))

        # app insets (phones sliding in from the right)
        for (a, b, names) in insets:
            if a <= out_n < b:
                imgs = [phone_img(n) for n in names]
                total_w = sum(i.width for i in imgs) + 10 * (len(imgs) - 1)
                x = W - total_w - 40
                for j, im in enumerate(imgs):
                    s = ease((out_n - a - j * 6) / 12) * ease((b - out_n) / 10)
                    if s <= 0:
                        x += im.width + 10
                        continue
                    px = int(x + (1 - s) * 500)
                    f.paste(with_alpha(im, s), (px, 150), with_alpha(im, s))
                    x += im.width + 10

        # stylus
        if hd.get('v', 1):
            px, py = tf(hd['x'], hd['y'])
            if prev_xy:
                vx = vx * 0.8 + (px - prev_xy[0]) * 0.2
            prev_xy = (px, py)
            draw_stylus(f, px, py, hd['h'], max(-10, min(10, -vx * 0.35)))

        # captions
        for (a, b, text) in captions:
            if a <= out_n < b:
                al = min(ease((out_n - a) / 4), ease((b - out_n) / 4))
                cap = with_alpha(pill_text(text, CAP_FONT, pad=(24, 10), bg=(8, 14, 32, 190)), al)
                f.paste(cap, ((W - cap.width) // 2, 880), cap)
        captions[:] = [c for c in captions if c[1] > out_n]

        # opening lower-third
        if out_n < 150:
            al = min(ease((out_n - 10) / 12), ease((150 - out_n) / 12))
            if al > 0:
                t = with_alpha(pill_text('KINETIX Board  ·  product tour', font(700, 30), bg=(8, 14, 32, 210), border=BLUE + (255,)), al)
                f.paste(t, ((W - t.width) // 2, 70), t)

        # progress line
        if timeline['cards']:
            done = timeline['cards'][-1]['num']
            frac = done / len(CHAPTERS)
            d.rectangle([0, H - 5, int(W * frac), H], fill=BLUE + (200,))
        write(f)

    ff.stdin.close()
    ff.wait()
    timeline['frames'] = out_n
    json.dump(timeline, open(os.path.join(HERE, 'renders', 'timeline.json'), 'w'), indent=1)
    print('frames', out_n, 'seconds', round(out_n / FPS, 1))


if __name__ == '__main__':
    main()

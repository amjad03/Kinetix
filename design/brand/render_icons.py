#!/usr/bin/env python3
"""Renders the Zynetix app icons from the mark in zynetix-mark.svg (same shapes, drawn with Pillow,
so no SVG renderer is needed). Run from the repository root:  python3 design/brand/render_icons.py

Each app keeps the white Z stroke and amber spark; the tile colour tells the apps apart:
board teal (the brand colour), teacher blue, student violet, parent rose.
Writes Android (legacy + adaptive + monochrome), iOS, macOS AppIcon, Windows .ico and MSIX logo,
and the Linux window icon. In the apps the mark is painted in code (kinetix_ui ZynetixMark).
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
APPS = {
    'board': ('#14B8A6', '#0B5F73'),
    'teacher': ('#3B82F6', '#1E3A8A'),
    'student': ('#8B5CF6', '#4C1D95'),
    'parent': ('#F43F5E', '#9F1239'),
}
WHITE = (255, 255, 255, 255)
SPARK = (255, 181, 71, 255)
SS = 4  # supersampling


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size, c0, c1):
    """Diagonal (top-left to bottom-right) gradient, size x size."""
    a, b = rgb(c0), rgb(c1)
    small = Image.new('RGBA', (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return small.resize((size, size), Image.BICUBIC)


def glyph(draw, s, scale, ox=0.0, oy=0.0, colour=WHITE, spark=SPARK):
    """The Z stroke and spark in 512-unit artwork space, scaled by s/512*scale around the centre."""
    k = s / 512 * scale
    off = s * (1 - scale) / 2

    def p(x, y):
        return (off + ox * s + x * k, off + oy * s + y * k)

    pts = [p(150, 156), p(340, 156), p(160, 356), p(362, 356)]
    w = 58 * k
    draw.line(pts, fill=colour, width=round(w), joint='curve')
    for q in (pts[0], pts[-1]):  # round caps
        draw.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=colour)
    c, r = p(390, 128), 30 * k
    draw.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=spark if spark else colour)


def tile(size, colours, radius=120 / 512, inset=0.0, rounded=True):
    """The full icon: gradient tile (rounded unless [rounded] is false) with the glyph."""
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    body = round(s * (1 - 2 * inset))
    g = gradient(body, *colours)
    mask = Image.new('L', (body, body), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, body - 1, body - 1], radius=round(body * radius), fill=255)
    else:
        md.rectangle([0, 0, body, body], fill=255)
    o = round(s * inset)
    img.paste(g, (o, o), mask)
    d = ImageDraw.Draw(img)
    glyph(d, s, 1 - 2 * inset)
    return img.resize((size, size), Image.LANCZOS)


def fg(size, scale, colour=WHITE, spark=SPARK):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    glyph(ImageDraw.Draw(img), s, scale, colour=colour, spark=spark)
    return img.resize((size, size), Image.LANCZOS)


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


ANDROID = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
ADAPTIVE_XML = '''<?xml version="1.0" encoding="utf-8"?>
<!-- Zynetix adaptive icon (rendered by design/brand/render_icons.py). -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
'''


def android(app, colours):
    res = ('apps', app, 'android', 'app', 'src', 'main', 'res')
    for name, f in ANDROID.items():
        d = f'mipmap-{name}'
        save(tile(round(48 * f), colours, inset=2 / 48), *res, d, 'ic_launcher.png')
        n = round(108 * f)
        # The visible area of an adaptive icon is the middle 72dp (safe zone 66dp): glyph at 60%.
        save(fg(n, 0.6), *res, d, 'ic_launcher_foreground.png')
        save(fg(n, 0.6, spark=None), *res, d, 'ic_launcher_monochrome.png')
        save(gradient(n * SS, *colours).resize((n, n), Image.LANCZOS), *res, d, 'ic_launcher_background.png')
    path = os.path.join(ROOT, *res, 'mipmap-anydpi-v26', 'ic_launcher.xml')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fh:
        fh.write(ADAPTIVE_XML)


def appiconset(app, colours, platform):
    base = os.path.join(ROOT, 'apps', app, platform, 'Runner', 'Assets.xcassets', 'AppIcon.appiconset')
    if not os.path.isdir(base):
        return
    with open(os.path.join(base, 'Contents.json')) as fh:
        meta = json.load(fh)
    for im in meta['images']:
        if 'filename' not in im:
            continue
        pt = float(im['size'].split('x')[0])
        px = round(pt * int(im['scale'].rstrip('x')))
        if platform == 'ios':  # iOS masks the corners itself and rejects transparency
            img = tile(px, colours, rounded=False).convert('RGB')
        else:  # macOS: the rounded tile on a transparent margin, as Apple's grid
            img = tile(px, colours, radius=0.225, inset=100 / 1024)
        img.save(os.path.join(base, im['filename']))


def main():
    for app, colours in APPS.items():
        android(app, colours)
        appiconset(app, colours, 'ios')
        appiconset(app, colours, 'macos')
        if os.path.isdir(os.path.join(ROOT, 'apps', app, 'windows')):
            big = tile(256, colours)
            big.save(os.path.join(ROOT, 'apps', app, 'windows', 'runner', 'resources', 'app_icon.ico'),
                     sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
            save(tile(256, colours), 'apps', app, 'windows', 'runner', 'resources', 'msix_logo.png')
        if os.path.isdir(os.path.join(ROOT, 'apps', app, 'linux')):
            save(tile(256, colours), 'apps', app, 'linux', 'runner', 'resources', 'app_icon.png')
    save(tile(1024, APPS['board']), 'design', 'brand', 'zynetix-mark-1024.png')


if __name__ == '__main__':
    main()

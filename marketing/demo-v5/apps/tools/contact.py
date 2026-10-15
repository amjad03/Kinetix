"""contact.jpg: the middle frame of every clip in clips/, small, labelled with id and duration.
   python3 tools/contact.py                    -> contact.jpg
   python3 tools/contact.py peek <id> out.png [t1 t2 ...]  -> a strip of frames (default: at every mark)
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.path.join(HERE, 'clips')


def frame(mp4, t, width):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'f.png')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.3f}', '-i', mp4, '-frames:v', '1', '-vf', f'scale={width}:-2', p], check=True)
        return Image.open(p).convert('RGB')


def font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', os.path.join(HERE, '../../../packages/zynetix_ui/fonts/Inter-500.ttf')]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def strip(images, labels, gap=10):
    f = font(14)
    w = sum(i.width for i in images) + gap * (len(images) - 1)
    h = max(i.height for i in images) + 24
    out = Image.new('RGB', (w, h), 'white')
    x = 0
    d = ImageDraw.Draw(out)
    for im, lab in zip(images, labels):
        out.paste(im, (x, 24))
        d.text((x + 2, 4), lab, fill='black', font=f)
        x += im.width + gap
    return out


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'peek':
        cid, out = sys.argv[2], sys.argv[3]
        meta = json.load(open(os.path.join(CLIPS, cid + '.json')))
        ts = [float(t) for t in sys.argv[4:]] or [min(m['t'] + 0.6, meta['duration'] - 0.1) for m in meta['marks']]
        ims = [frame(os.path.join(CLIPS, cid + '.mp4'), t, 300) for t in ts]
        strip(ims, [f'{t:.1f}s' for t in ts]).save(out)
        return
    ids = sorted(f[:-5] for f in os.listdir(CLIPS) if f.endswith('.json'))
    order = {'teacher': 0, 'student': 1, 'parent': 2}
    ids.sort(key=lambda i: (order.get(i.split('_')[0], 9), i))
    tw, cols = 180, 6
    th = int(tw * 844 / 390)
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + 12) + 12, rows * (th + 46) + 12), (240, 240, 244))
    d = ImageDraw.Draw(sheet)
    f = font(13)
    for n, cid in enumerate(ids):
        meta = json.load(open(os.path.join(CLIPS, cid + '.json')))
        im = frame(os.path.join(CLIPS, cid + '.mp4'), meta['duration'] / 2, tw)
        x, y = 12 + (n % cols) * (tw + 12), 12 + (n // cols) * (th + 46)
        sheet.paste(im, (x, y))
        d.text((x, y + im.height + 4), cid, fill='black', font=f)
        d.text((x, y + im.height + 22), f"{meta['duration']:.1f} s", fill=(90, 90, 90), font=f)
    sheet.save(os.path.join(HERE, 'contact.jpg'), quality=85)
    print('contact.jpg', len(ids), 'clips')


main()

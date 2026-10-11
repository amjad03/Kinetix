"""Contact sheet of preview stills (/tmp/kxd/pv) with the stylus tip marked. usage: pvsheet.py <seg-prefix-filter> [cols]"""
import glob, os, sys
from PIL import Image, ImageDraw
flt = sys.argv[1] if len(sys.argv) > 1 else ''
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 4
fs = sorted(f for f in glob.glob('/tmp/kxd/pv/*.png') if any(('_' + x + '_') in f for x in flt.split(',')) or not flt)
W, H = 576, 324
rows = (len(fs) + cols - 1) // cols
c = Image.new('RGB', (cols * W, rows * (H + 14)), 'white'); d = ImageDraw.Draw(c)
for i, f in enumerate(fs):
    n = os.path.basename(f)[:-4].split('_')
    im = Image.open(f).convert('RGB'); x, y = (i % cols) * W, (i // cols) * (H + 14)
    c.paste(im, (x, y + 14)); d.text((x + 3, y), ' '.join(n), fill='red')
    px, py = int(n[2]) * 0.3, int(n[3]) * 0.3
    d.ellipse((x + px - 5, y + 14 + py - 5, x + px + 5, y + 14 + py + 5), outline='magenta', width=2)
c.save('/tmp/kxd/sheet.jpg', quality=70); print(len(fs), c.size)

"""capture/assets/notes_page.jpg: a photographed notebook page (Kalam handwriting on ruled paper),
shown as the student's attached photo in the homework clips (the demo backend only has a 1-pixel image)."""
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(HERE, '../../../packages/zynetix_ui/fonts/Kalam-400.ttf')
W, H = 900, 1200
im = Image.new('RGB', (W, H), (250, 248, 240))
d = ImageDraw.Draw(im)
for y in range(150, H, 46):
    d.line([(0, y), (W, y)], fill=(170, 200, 230), width=2)
d.line([(110, 0), (110, H)], fill=(230, 140, 140), width=3)
f = ImageFont.truetype(F, 34); fb = ImageFont.truetype(F, 42)
ink = (25, 45, 120)
d.text((130, 70), 'Forfeiture of shares - notes', font=fb, fill=ink)
lines = ['1. Forfeiture = cancellation of shares when a', '   shareholder fails to pay allotment / calls.',
         '2. Entry (shares issued at par):', '   Share Capital A/c  Dr  (called-up amt)', '      To Calls in Arrears A/c', '      To Share Forfeiture A/c (amt received)',
         '3. Issued at premium: if premium not yet', '   received, debit Securities Premium A/c.', '4. Forfeited shares can be re-issued;',
         '   max discount = amount forfeited.', '5. Balance in Share Forfeiture A/c after', '   re-issue goes to Capital Reserve.', '', '   - Ananya G., BCom Sem 3 A']
y = 158
for l in lines:
    d.text((130 + random.randint(-3, 3), y - 40), l, font=f, fill=ink)
    y += 46
im = im.rotate(-1.5, resample=Image.BICUBIC, expand=False, fillcolor=(120, 110, 95)).filter(ImageFilter.GaussianBlur(0.6))
im.save(os.path.join(HERE, 'capture/assets/notes_page.jpg'), quality=88)

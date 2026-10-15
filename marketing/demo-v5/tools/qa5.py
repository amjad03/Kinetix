"""QA sheets: the frame at every anchor word (what the viewer sees as the word is said), labelled with the beat,
the anchor's words and the feature label. -> renders/qa/anchors_NN.jpg"""
import json, os, subprocess
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(HERE, 'data', 'timeline5.json')))
VO = json.load(open(os.path.join(HERE, 'data', 'vo5.json')))
B = {b['id']: b for c in json.load(open(os.path.join(HERE, 'data', 'beats5.json')))['chapters'] for b in c['beats']}
vid = os.path.join(HERE, 'renders', 'video5.mp4')
items = []
for u in TL['units']:
    ps = [p for p in VO.get(u['id'], []) if p['anchor']]
    for A, p in zip(u['A'], ps):
        items.append((A + 0.1, f"{u['id']} {B[u['id']].get('label') or ''}: {p['text'][:48]}"))
fnt = ImageFont.truetype(os.path.join(HERE, '..', '..', 'packages', 'zynetix_ui', 'fonts', 'Inter-500.ttf'), 18)
os.makedirs(os.path.join(HERE, 'renders', 'qa'), exist_ok=True)
for s0 in range(0, len(items), 20):
    sheet = Image.new('RGB', (4 * 480, 5 * 300), (0, 0, 0)); d = ImageDraw.Draw(sheet)
    for q, (t, lab) in enumerate(items[s0:s0 + 20]):
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', vid, '-frames:v', '1', '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        x, y = (q % 4) * 480, (q // 4) * 300
        if len(raw) == 480 * 270 * 3:
            sheet.paste(Image.frombuffer('RGB', (480, 270), raw, 'raw', 'RGB', 0, 1), (x, y + 30))
        d.text((x + 4, y + 6), lab, font=fnt, fill=(255, 230, 120))
    sheet.save(os.path.join(HERE, 'renders', 'qa', f'anchors_{s0 // 20 + 1:02d}.jpg'), quality=80)
print(len(items), 'anchors')

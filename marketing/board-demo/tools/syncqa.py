"""Spot-check VO/visual sync: frames of the final video at the moment given words are spoken."""
import json, os, subprocess, re
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(HERE, 'renders', 'timeline.json')))
WORDS = json.load(open(os.path.join(HERE, 'data', 'words.json')))
V = os.path.abspath(os.path.join(HERE, '..', '..', 'dist', 'kinetix-board-demo.mp4'))
CHECK = [('s10', 'QR'), ('s12', 'shuffled'), ('s20', 'thickness'), ('s33', 'circuits'), ('s53', 'tables'),
         ('s62', 'Homework.'), ('s74', 'Badges'), ('s92', 'Screen'), ('s102', 'spotlight'), ('s111', 'Parent')]
segs = {s['id']: s for s in TL['segs']}
sheet = Image.new('RGB', (2 * 800, 5 * 470), (8, 14, 32))
d = ImageDraw.Draw(sheet)
for i, (sid, w) in enumerate(CHECK):
    s = segs[sid]
    t0 = (s['at'] + s.get('voOff', 0)) / 30
    wt = next(x[1] for x in WORDS[sid] if re.sub(r'\W', '', x[0]).lower().startswith(re.sub(r'\W', '', w).lower()))
    t = t0 + wt + 0.25
    tmp = os.path.join(HERE, 'renders', 'q.jpg')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', V, '-frames:v', '1', '-vf', 'scale=800:450', tmp], check=True)
    x, y = (i % 2) * 800, (i // 2) * 470
    sheet.paste(Image.open(tmp), (x, y + 20))
    d.text((x + 6, y + 3), f'{int(t // 60)}:{t % 60:05.2f}  "{w}" ({sid})', fill=(180, 210, 255))
    print(f'{int(t // 60)}:{t % 60:05.2f} {sid} "{w}"')
sheet.save('/tmp/kxd/sync.jpg', quality=80)

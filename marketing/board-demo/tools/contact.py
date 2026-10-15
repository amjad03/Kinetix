"""20-frame contact sheet of the final video -> dist/zynetix-board-demo-contact.jpg"""
import os, subprocess, json
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.abspath(os.path.join(HERE, '..', '..', 'dist'))
V = os.path.join(DIST, 'zynetix-board-demo.mp4')
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', V]))
cols, rows, w, h = 4, 5, 640, 360
sheet = Image.new('RGB', (cols * w, rows * (h + 22)), (8, 14, 32))
d = ImageDraw.Draw(sheet)
tmp = os.path.join(HERE, 'renders', 'cs.jpg')
for i in range(cols * rows):
    t = dur * (i + 0.5) / (cols * rows)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', V, '-frames:v', '1', '-vf', f'scale={w}:{h}', tmp], check=True)
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(Image.open(tmp), (x, y + 22))
    d.text((x + 6, y + 4), f'{int(t // 60)}:{t % 60:04.1f}', fill=(180, 200, 255))
os.remove(tmp)
sheet.save(os.path.join(DIST, 'zynetix-board-demo-contact.jpg'), quality=82)
print('duration', round(dur, 1))

"""Capture recorder: FIFO (512-byte JSON header + 1920x1080 RGBA per frame) -> renders/capture.mp4
(near-lossless) and renders/capture.jsonl (one header per captured frame, in order)."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1920, 1080
src = open(sys.argv[1], 'rb')
ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', os.path.join(HERE, 'renders', 'capture.mp4')], stdin=subprocess.PIPE)
log = open(os.path.join(HERE, 'renders', 'capture.jsonl'), 'w')
n = 0
while True:
    head = src.read(512)
    if len(head) < 512:
        break
    hd = json.loads(head.decode('utf-8').strip())
    if hd.get('end'):
        break
    nb = hd.get('nb', 0)
    if nb == 0:
        continue  # chapter cards are the editor's business
    raw = src.read(nb)
    if len(raw) < nb:
        break
    ff.stdin.write(raw)
    hd['i'] = n
    log.write(json.dumps(hd, separators=(',', ':')) + '\n')
    n += 1
ff.stdin.close()
ff.wait()
log.close()
print('captured', n, 'frames', round(n / 30, 1), 's')

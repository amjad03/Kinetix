"""Perceptual sync audit: what a viewer sees when each anchor word is heard.

Transcribes the FINAL video's soundtrack (faster-whisper, word timestamps), aligns it to the script in
data/beats.json, and for every anchor word grabs the rendered frame at the word's start and at +0.5 s.
Writes renders/perceive/sheet_NN.jpg (12 anchors per sheet: [at word | +0.5 s], with beat, word and the
spoken sentence) and renders/perceive/anchors.json. A human (or model) then judges each pair.

    venv/bin/python tools/perceive.py dist/video.mp4 [--beats data/beats.json]
"""
import difflib, json, os, re, subprocess, sys
os.environ.setdefault('HF_HOME', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', 'hf'))
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = os.path.abspath(sys.argv[1])
BJ = sys.argv[sys.argv.index('--beats') + 1] if '--beats' in sys.argv else os.path.join(HERE, 'data', 'beats.json')
OUT = os.path.join(HERE, 'renders', 'perceive')
os.makedirs(OUT, exist_ok=True)
B = json.load(open(BJ))


def norm(t):
    return re.sub(r'[^a-z0-9]', '', t.lower())


# script tokens with (beat, anchor) marks
toks, marks = [], []
for c in B['chapters']:
    for b in c['beats']:
        words = b['vo'].replace('^', '').split()
        base = len(toks)
        toks += words
        if '^' in b['vo']:  # v4 scripts: carets mark the anchors, in act order
            raw = b['vo'].split()
            for a, i in zip(b['acts'], [i for i, w in enumerate(raw) if w.startswith('^')]):
                marks.append((b['id'], raw[i][1:], a.get('kind', b.get('kind', 'act')), base + i, b['vo'].replace('^', '')))
            continue
        for a in b.get('acts', []):
            key, n = norm(a['w']), a.get('n', 0)
            for i, w in enumerate(words):
                nw = norm(w)
                if nw.startswith(key) or (len(key) >= 5 and nw.startswith(key[:5])):
                    if n == 0:
                        marks.append((b['id'], a['w'], a.get('kind', b.get('kind', 'act')), base + i, b['vo']))
                        break
                    n -= 1

wav = os.path.join(OUT, 'a.wav')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', V, '-ac', '1', '-ar', '16000', wav], check=True)
from faster_whisper import WhisperModel
m = WhisperModel('base.en', device='cpu', compute_type='int8')
segs, _ = m.transcribe(wav, word_timestamps=True, language='en', beam_size=1, vad_filter=False)
ws = [[norm(w.word), w.start, w.end] for s in segs for w in s.words if norm(w.word)]
os.remove(wav)
a = [norm(t) for t in toks]
b = [w[0] for w in ws]
tm = [None] * len(toks)
for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
    for k in range(blk.size):
        tm[blk.a + k] = ws[blk.b + k][1]
res = []
for bid, w, kind, i, vo in marks:
    t = tm[i]
    if t is None:  # interpolate from neighbours
        lo = max([j for j in range(i) if tm[j] is not None] or [None], key=lambda j: j or -1)
        hi = min([j for j in range(i + 1, len(toks)) if tm[j] is not None] or [None], key=lambda j: j if j is not None else 1e9)
        if lo is not None and hi is not None:
            t = tm[lo] + (tm[hi] - tm[lo]) * (i - lo) / (hi - lo)
    res.append({'beat': bid, 'w': w, 'kind': kind, 't': None if t is None else round(t, 2), 'exact': tm[i] is not None, 'vo': vo})
if '--exact' in sys.argv:  # v4: exact anchor onsets from the edit (voice pieces start on the anchor word)
    tl = json.load(open(os.path.join(HERE, 'renders', 'timeline4.json')))['anchors']
    for r, a in zip(res, tl):
        r['whisper'], r['t'] = r['t'], a['A']
json.dump(res, open(os.path.join(OUT, 'anchors.json'), 'w'), indent=0)

FW, FH = 640, 360
try:
    fnt = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 17)
except OSError:
    fnt = ImageFont.load_default()
tmp = os.path.join(OUT, 'f.jpg')
for s in range(0, len(res), 12):
    grp = res[s:s + 12]
    sheet = Image.new('RGB', (2 * (2 * FW + 10), 6 * (FH + 44)), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for j, r in enumerate(grp):
        x, y = (j % 2) * (2 * FW + 10), (j // 2) * (FH + 44)
        d.text((x + 4, y + 2), f'#{s + j + 1} {r["beat"]} "{r["w"]}" @{r["t"]}  [{r["kind"]}]', font=fnt, fill=(255, 230, 120))
        d.text((x + 4, y + 22), r['vo'][:150], font=fnt, fill=(190, 200, 230))
        if r['t'] is None:
            continue
        for k, dt in enumerate((0.0, 0.5)):
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{r["t"] + dt:.3f}', '-i', V, '-frames:v', '1', '-vf', f'scale={FW}:{FH}', tmp], check=True)
            sheet.paste(Image.open(tmp), (x + k * FW, y + 44))
    sheet.save(os.path.join(OUT, f'sheet_{s // 12 + 1:02d}.jpg'), quality=78)
os.remove(tmp)
print(len(res), 'anchors;', sum(not r['exact'] for r in res), 'interpolated;', (len(res) + 11) // 12, 'sheets')

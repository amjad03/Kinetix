"""v4 voice: Kokoro af_heart, synthesised in pieces split at every anchor (^) so each anchor word's onset
is known exactly (the start of its piece, leading silence trimmed). Word timings inside each piece come
from faster-whisper (base.en) on the clean piece, snapped to the energy onset.
-> audio/<beat>_<k>.wav, data/vo4.json {beat: [{text, dur, anchor, end_punct, words:[[w,s,e]]}]}"""
import json, os, re, sys
import numpy as np, soundfile as sf
os.environ.setdefault('HF_HOME', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', 'hf'))
from kokoro_onnx import Kokoro
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(HERE, 'data', 'beats4.json')))
only = set(sys.argv[1:])
k = Kokoro(os.path.join(HERE, 'models', 'kokoro.onnx'), os.path.join(HERE, 'models', 'voices.bin'))
wm = WhisperModel('base.en', device='cpu', compute_type='int8')
os.makedirs(os.path.join(HERE, 'audio'), exist_ok=True)
vp = os.path.join(HERE, 'data', 'vo4.json')
vo = json.load(open(vp)) if os.path.exists(vp) else {}


def say(t):
    for a, b in [('ZYNETIX', 'Zynetix'), ('PhET', 'Fet'), ('PIN', 'pin'), ('Ms Kavya', 'Miss Kavya'), ('3D', 'three D'), ('10 B', 'ten B'), ('Wi-Fi', 'wifi'), ('six-digit', 'six digit')]:
        t = t.replace(a, b)
    return t


def trim(a, sr):
    env = np.convolve(np.abs(a), np.ones(int(sr * 0.005)) / (sr * 0.005), 'same')
    thr = max(env.max() * 0.02, 1e-4)
    idx = np.where(env > thr)[0]
    if not len(idx):
        return a
    s = max(0, idx[0] - int(sr * 0.012))
    e = min(len(a), idx[-1] + int(sr * 0.03))
    return a[s:e]


def norm(t):
    return re.sub(r'[^a-z0-9]', '', t.lower())


for c in S['chapters']:
    for b in c['beats']:
        if only and b['id'] not in only:
            continue
        parts = [p.strip() for p in b['vo'].split('^')]
        lead_anchor = b['vo'].lstrip().startswith('^')
        pieces = []
        for i, p in enumerate(parts):
            if not p:
                continue
            audio, sr = k.create(say(p), voice='af_heart', speed=1.05, lang='en-us')
            audio = trim(audio, sr)
            fn = f"{b['id']}_{len(pieces)}.wav"
            sf.write(os.path.join(HERE, 'audio', fn), audio, sr)
            segs, _ = wm.transcribe(os.path.join(HERE, 'audio', fn), word_timestamps=True, language='en', beam_size=1)
            ws = [[w.word.strip(), w.start, w.end] for sg in segs for w in sg.words]
            toks = p.split()
            # align script tokens to recognised words by order (proportional fallback)
            dur = len(audio) / sr
            times = []
            rec = [norm(w[0]) for w in ws]
            j = 0
            for ti, tk in enumerate(toks):
                hit = None
                for jj in range(j, min(len(ws), j + 3)):
                    if rec[jj] and (rec[jj].startswith(norm(tk)[:3]) or norm(tk).startswith(rec[jj][:3])):
                        hit = jj
                        break
                if hit is not None:
                    times.append([tk, ws[hit][1], ws[hit][2]]); j = hit + 1
                else:
                    times.append([tk, None, None])
            n = len(toks)
            for ti in range(n):
                if times[ti][1] is None:
                    times[ti][1] = dur * ti / n; times[ti][2] = dur * (ti + 1) / n
            times[0][1] = 0.0
            for ti in range(1, n):  # monotonic, inside the clip
                times[ti][1] = min(max(times[ti][1], times[ti - 1][1] + 0.05), dur - 0.05)
            for ti in range(n):
                times[ti][2] = times[ti + 1][1] if ti + 1 < n else dur
            pieces.append({'file': fn, 'text': p, 'dur': round(dur, 3), 'anchor': i > 0 or lead_anchor,
                           'end': p[-1] if p[-1] in '.,:?!;' else '', 'words': [[w, round(s, 3), round(e, 3)] for w, s, e in times]})
        vo[b['id']] = pieces
        print(b['id'], len(pieces), round(sum(p['dur'] for p in pieces), 2), flush=True)
json.dump(vo, open(vp, 'w'), ensure_ascii=False)
print('total', round(sum(p['dur'] for v in vo.values() for p in v), 1))

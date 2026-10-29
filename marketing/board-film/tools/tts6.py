"""v5 voice: Kokoro af_heart (the voice of the earlier videos), made in pieces split at every anchor (^), so each
anchor word's onset is exact. "Zynetix" is said ZY-net-iks (phonemes patched). Word times inside a piece are
estimated from letter counts (pieces are short), for the captions.
-> audio/vo/<beat>_<k>.wav, data/vo5.json {beat: [{file,text,dur,anchor,end,words:[[w,s,e]]}]}
   python3 tools/tts5.py [beat ids]   (only those beats; others are kept)"""
import json, os, re, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = os.path.join(HERE, '..', 'promo', 'models')
S = json.load(open(os.path.join(HERE, 'data', 'beats6.json')))
only = set(sys.argv[1:])
k = Kokoro(os.path.join(M, 'kokoro-v1.0.int8.onnx'), os.path.join(M, 'voices-v1.0.bin'))
os.makedirs(os.path.join(HERE, 'audio', 'vo'), exist_ok=True)
vp = os.path.join(HERE, 'data', 'vo6.json')
vo = json.load(open(vp)) if os.path.exists(vp) else {}

def say(t):
    for a, b in [('PhET', 'Fet'), ('PIN', 'pin'), ('3D', 'three D'), ('Wi-Fi', 'wifi'), ('six-digit', 'six digit'), ('ERP', 'E R P'),
                 ('NAAC', 'nack'), ('OBE', 'O B E'), ('SGPA', 'S G P A'), ('CO-PO', 'C O, P O'), ('ID card', 'I D card'), ('QR', 'Q R'), ('UPI', 'U P I'), ('IQAC', 'I Q A C'), ('AQAR', 'A Q A R')]:
        t = re.sub(r'\b' + re.escape(a) + r'\b', b, t)
    return t

def trim(a, sr):
    env = np.convolve(np.abs(a), np.ones(int(sr * 0.005)) / (sr * 0.005), 'same')
    idx = np.where(env > max(env.max() * 0.02, 1e-4))[0]
    if not len(idx): return a
    return a[max(0, idx[0] - int(sr * 0.012)):min(len(a), idx[-1] + int(sr * 0.03))]

for c in S['chapters']:
    for b in c['beats']:
        if not b.get('vo') or (only and b['id'] not in only):
            continue
        parts = [p.strip() for p in b['vo'].split('^')]
        lead = b['vo'].lstrip().startswith('^')
        pieces = []
        for i, p in enumerate(parts):
            if not p: continue
            ph = k.tokenizer.phonemize(say(p), 'en-us').replace('zˈaɪnɪtˌɪks', 'zˈaɪnˌɛtɪks')
            a, sr = k.create(ph, voice='af_heart', speed=1.03, lang='en-us', is_phonemes=True)
            a = trim(a, sr)
            fn = f"{b['id']}_{len(pieces)}.wav"
            sf.write(os.path.join(HERE, 'audio', 'vo', fn), a, sr)
            dur = len(a) / sr
            toks = p.split()
            wts = [len(re.sub(r'\W', '', w)) + 2 + (3 if re.search(r'[,.…?!:;]$', w) else 0) for w in toks]
            tot, cum, words = sum(wts), 0, []
            for w, x in zip(toks, wts):
                words.append([w, round(dur * cum / tot, 3), round(dur * (cum + x) / tot, 3)]); cum += x
            pieces.append({'file': fn, 'text': p, 'dur': round(dur, 3), 'anchor': i > 0 or lead, 'end': p[-1] if p[-1] in '.,:?!;' else '', 'words': words})
        vo[b['id']] = pieces
        print(b['id'], len(pieces), round(sum(q['dur'] for q in pieces), 2), flush=True)
json.dump(vo, open(vp, 'w'), ensure_ascii=False)
print('total speech', round(sum(q['dur'] for v in vo.values() for q in v), 1), 's')

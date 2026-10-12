"""Word-level timestamps of every VO clip (faster-whisper, tiny.en) -> data/words.json
{seg: [[word, start_s, end_s], ...]}. The capture uses them to put each feature on screen
as it is spoken; the compositor uses them for captions and kinetic titles."""
import json, os, re, sys
os.environ.setdefault('HF_HOME', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', 'hf'))
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(HERE, 'data', 'beats.json')))
import difflib


def norm(t):
    return re.sub(r"[^a-z0-9]", '', t.lower())


def align(text, ws):
    """Script words (as written) timed from the recognised words: matched runs take their times,
    the rest are interpolated between neighbours."""
    toks = text.split()
    a = [norm(t) for t in toks]
    b = [norm(w[0]) for w in ws]
    times = [None] * len(toks)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = (ws[blk.b + k][1], ws[blk.b + k][2])
    total = ws[-1][2] if ws else 1.0
    for i in range(len(toks)):
        if times[i] is None:
            j0 = max([j for j in range(i) if times[j]] or [-1])
            j1 = min([j for j in range(i + 1, len(toks)) if times[j]] or [len(toks)])
            t0 = times[j0][1] if j0 >= 0 else 0.0
            t1 = times[j1][0] if j1 < len(toks) else total
            n = j1 - j0
            st = t0 + (t1 - t0) * (i - j0 - 0.5) / n if n > 0 else t0
            times[i] = (round(max(t0, st), 2), round(min(t1, st + (t1 - t0) / max(n, 1)), 2))
    return [[t, times[i][0], times[i][1]] for i, t in enumerate(toks)]


m = WhisperModel('tiny.en', device='cpu', compute_type='int8')
out = {}
for c in S['chapters']:
    for s in c['beats']:
        segs, _ = m.transcribe(os.path.join(HERE, 'audio', s['id'] + '.wav'), word_timestamps=True, language='en', beam_size=1)
        ws = []
        for sg in segs:
            for w in sg.words:
                t = re.sub(r"[^\w'-]", '', w.word.lower())
                if t:
                    ws.append([t, round(w.start, 2), round(w.end, 2)])
        out[s['id']] = align(s['vo'], ws)
        print(s['id'], len(ws), flush=True)
json.dump(out, open(os.path.join(HERE, 'data', 'words.json'), 'w'), separators=(',', ':'))

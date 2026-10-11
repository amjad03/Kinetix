"""Human-looking handwriting paths from Hershey single-line fonts.

Writes data/hand.json: {phrase_id: {"w": width_em, "strokes": [[[x, y, t_ms], ...], ...]}}
in em units (cap height ~1, y down, origin at the baseline start). Timing follows a
speed profile: slower in tight curves, eased at stroke ends, short pen lifts between strokes.
The capture driver scales, places and replays these points as stylus input.
"""
import json, math, os, sys
import numpy as np
from HersheyFonts import HersheyFonts

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHRASES = json.load(open(os.path.join(HERE, 'data', 'phrases.json')))
rng = np.random.default_rng(11)


def smooth_noise(n, scale):
    k = max(2, n // 6)
    ctrl = rng.normal(0, scale, k + 2)
    xs = np.linspace(0, k + 1, n)
    return np.interp(xs, np.arange(k + 2), ctrl)


def build(text, font_name, speed):
    f = HersheyFonts()
    f.load_default_font(font_name)
    f.normalize_rendering(1.0)
    strokes = [np.array(s, float) for s in f.strokes_for_text(text) if len(s) > 1]
    if not strokes:
        return None
    allp = np.concatenate(strokes)
    x0 = allp[:, 0].min()
    out, t, width = [], 0.0, allp[:, 0].max() - x0
    slant = rng.uniform(0.05, 0.12)
    for si, s in enumerate(strokes):
        p = s.copy()
        p[:, 0] -= x0
        p[:, 1] = -p[:, 1]  # y down
        # slant, baseline wobble and size wobble that drift slowly along the line
        rel = p[:, 0] / max(width, 1e-6)
        p[:, 0] += -p[:, 1] * slant
        p[:, 1] += np.interp(rel, np.linspace(0, 1, 9), rng.normal(0, 0.025, 9))
        # densify, then per-point jitter (tremor)
        seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
        L = seg.sum()
        n = max(4, int(L / 0.018))
        cum = np.concatenate([[0], np.cumsum(seg)])
        u = np.linspace(0, L, n)
        q = np.stack([np.interp(u, cum, p[:, 0]), np.interp(u, cum, p[:, 1])], 1)
        q[:, 0] += smooth_noise(n, 0.006)
        q[:, 1] += smooth_noise(n, 0.006)
        # curvature-dependent speed with eased ends
        d = np.diff(q, axis=0)
        ang = np.arctan2(d[:, 1], d[:, 0])
        turn = np.abs(np.angle(np.exp(1j * np.diff(ang))))
        turn = np.concatenate([[0], turn, [0]])
        turn = np.convolve(turn, np.ones(5) / 5, 'same')
        v = speed * (1.0 / (1.0 + 9.0 * turn)) * rng.uniform(0.85, 1.15)
        ramp = np.minimum(1, np.minimum(np.arange(n) + 1, n - np.arange(n)) / 5.0) * 0.6 + 0.4
        v = v * ramp
        step = np.concatenate([[0], np.linalg.norm(d, axis=1)])
        dt = step / np.maximum(v, 1e-3) * 1000
        tt = t + np.cumsum(dt)
        out.append([[round(float(a), 4), round(float(b), 4), round(float(c), 1)] for (a, b), c in zip(q, tt)])
        # pen lift: longer when the next stroke starts far away
        if si + 1 < len(strokes):
            nxt = strokes[si + 1][0] - [x0, 0]
            gap = abs(nxt[0] - (q[-1, 0])) + abs(-nxt[1] - q[-1, 1])
            t = tt[-1] + 60 + 110 * min(gap, 2.0) + rng.uniform(0, 40)
        else:
            t = tt[-1]
    return {'w': round(float(width), 3), 'strokes': out, 'ms': round(t)}


res = {}
for pid, spec in PHRASES.items():
    res[pid] = build(spec['text'], spec.get('font', 'cursive'), spec.get('speed', 14.0))
json.dump(res, open(os.path.join(HERE, 'data', 'hand.json'), 'w'), separators=(',', ':'))
print({k: v['ms'] for k, v in res.items()})

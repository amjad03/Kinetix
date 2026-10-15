"""v4 mix: voice pieces (exact anchor timing), generated music bed ducked under the voice, synced sound
effects (stylus clicks, pen scratch, pop-out pops, shot swishes, chapter whooshes); -14 LUFS; muxed.

Reads renders/timeline4.json (tools/edit4.py) and audio/<beat>_<k>.wav.
Writes renders/mix.wav and ../../dist/zynetix-board-demo.mp4.
"""
import json, os, subprocess
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR, FPS = 48000, 30
TL = json.load(open(os.path.join(HERE, 'renders', 'timeline4.json')))
CARDS = [{'at': c} for c in TL['cards']] + [{'at': next(a['A'] for a in TL['anchors'] if a['beat'] == 'h3') - 0.1}]
N = int(TL['frames'] / FPS * SR) + SR
rng = np.random.default_rng(3)


def load(path):
    a, sr = sf.read(path, dtype='float32')
    if a.ndim > 1:
        a = a.mean(1)
    if sr != SR:
        x = np.arange(int(len(a) * SR / sr)) * sr / SR
        a = np.interp(x, np.arange(len(a)), a).astype(np.float32)
    return a


# ---- voice
vo = np.zeros(N, np.float32)
spans = []
for p in TL['pieces']:
    a = load(os.path.join(HERE, 'audio', p['file']))
    i = int(max(0, p['at']) * SR)
    a = a[: N - i]
    vo[i:i + len(a)] += a
    spans.append((i / SR, (i + len(a)) / SR))
gaps = [(round(spans[k][1], 2), round(spans[k + 1][0] - spans[k][1], 2)) for k in range(len(spans) - 1) if spans[k + 1][0] - spans[k][1] > 1.0]
print('VO gaps > 1 s:', gaps)

# ---- music: slow pad chords + soft plucked pulse + air
t = np.arange(N) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]  # Am F C G
bar = 4.0
pad = np.zeros(N, np.float32)
for k in range(int(N / SR / bar) + 1):
    ch = chords[k % 4]
    i0, i1 = int(k * bar * SR), min(N, int((k + 1) * bar * SR + 1.5 * SR))
    if i0 >= N:
        break
    tt = np.arange(i1 - i0) / SR
    env = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (bar + 1.5 - tt) / 1.5))
    sig = np.zeros(i1 - i0)
    for m in ch:
        for det in (-0.12, 0.0, 0.1):
            f = midi(m) * (1 + det / 100)
            sig += np.sin(2 * np.pi * f * tt + rng.uniform(0, 6)) * 0.6 + 0.18 * np.sin(4 * np.pi * f * tt)
    pad[i0:i1] += (sig * env / 14).astype(np.float32)
# pulse: eighth notes of the chord's root an octave up, soft decay
pulse = np.zeros(N, np.float32)
step = 0.5
for k in range(int(N / SR / step)):
    i0 = int(k * step * SR)
    ch = chords[int(k * step / bar) % 4]
    m = ch[(k % 3) + 1] + 12
    L = int(0.45 * SR)
    tt = np.arange(min(L, N - i0)) / SR
    pulse[i0:i0 + len(tt)] += (np.sin(2 * np.pi * midi(m) * tt) * np.exp(-tt * 9) * 0.10).astype(np.float32)
noise = rng.normal(0, 1, N).astype(np.float32)
air = np.convolve(noise, np.ones(400) / 400, 'same') * 0.4
music = pad + pulse + air
# swell into each chapter card
for c in CARDS:
    i = int(c['at'] * SR)
    L = int(1.4 * SR)
    seg = np.sin(np.linspace(0, np.pi, L)) * 0.6
    music[max(0, i - L // 2): max(0, i - L // 2) + L] *= (1 + seg[: len(music[max(0, i - L // 2): max(0, i - L // 2) + L])])
# a soft hit on each chapter card and the logo: low thump + bell (added after the bed is levelled)
hits = np.zeros(N, np.float32)
for c in CARDS:
    i = int(c['at'] * SR)
    L = min(int(1.6 * SR), N - i)
    tt = np.arange(L) / SR
    hit = np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 6) * 0.9 + sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) * g
                                                                 for f, d, g in ((880, 3.5, 0.22), (1320, 4.5, 0.12), (1760, 6, 0.06)))
    hits[i:i + L] += (hit * np.minimum(1, tt / 0.004)).astype(np.float32)
# fade in/out
fade = int(1.5 * SR)
music[:fade] *= np.linspace(0, 1, fade)
end = int(TL['frames'] / FPS * SR)
music[end - 3 * SR:end] *= np.linspace(1, 0, 3 * SR)
music[end:] = 0

# ---- ducking: follow the voice envelope (fast attack, slow release)
env = np.abs(vo)
win = int(0.05 * SR)
env = np.convolve(env, np.ones(win) / win, 'same')
gate = (env > 0.01).astype(np.float32)
smooth = np.zeros_like(gate)
a_att, a_rel = 1 - np.exp(-1 / (0.08 * SR)), 1 - np.exp(-1 / (0.6 * SR))
g = 0.0
for i in range(0, N, 64):
    target = gate[i]
    g += (target - g) * (1 - (1 - (a_att if target > g else a_rel)) ** 64)
    smooth[i:i + 64] = g
duck = 10 ** ((-15 * smooth) / 20)
music *= duck * (10 ** (-17 / 20)) / (np.abs(music).max() + 1e-6)
music += hits * (10 ** (-16 / 20))

# ---- sound effects, synced to what the picture does
fx = np.zeros(N, np.float32)
def put(i, x):
    i = int(i)
    if 0 <= i < N:
        x = x[: N - i]; fx[i:i + len(x)] += x.astype(np.float32)
def bp_noise(L, lo, hi):
    n = rng.normal(0, 1, L)
    sp = np.fft.rfft(n); fr = np.fft.rfftfreq(L, 1 / SR)
    sp[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(sp, L)
click = None
last_scr = -1
for (tt, kind, g) in TL['sfx']:
    i = tt * SR
    if kind == 'click':
        L = int(0.04 * SR); x = np.arange(L) / SR
        put(i, (np.sin(2 * np.pi * 2300 * x) * np.exp(-x * 160) * 0.5 + bp_noise(L, 1500, 6000) * np.exp(-x * 220) * 0.25) * g)
    elif kind == 'scratch':
        if i < last_scr:
            continue
        L = int(1 / FPS * SR * 1.3); x = np.arange(L) / SR
        put(i, bp_noise(L, 2500, 9000) * np.hanning(L) * 0.07 * g)
        last_scr = i + int(SR / FPS) - 1
    elif kind == 'pop':
        L = int(0.12 * SR); x = np.arange(L) / SR
        f = 500 + 900 * x / x[-1]
        put(i - 0.1 * SR, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 30) * 0.35 * g)
    elif kind in ('swish', 'whoosh'):
        L = int((0.28 if kind == 'swish' else 0.55) * SR); x = np.linspace(0, 1, L)
        n = bp_noise(L, 300, 5000) * np.sin(np.pi * x) ** 2
        put(i - L * 0.55, n * (0.18 if kind == 'swish' else 0.28) * g)
fx /= max(1e-6, np.abs(fx).max()) / 0.35

mix = vo / (np.abs(vo).max() + 1e-6) * 0.8 + music + fx * 0.55
stereo = np.stack([mix, mix * 0.98 + np.roll(music, 240) * 0.02], 1)[:end + SR // 2]
wav = os.path.join(HERE, 'renders', 'mix.wav')
sf.write(wav, stereo, SR)

out = os.path.abspath(os.path.join(HERE, '..', '..', 'dist', 'zynetix-board-demo.mp4'))
video = os.path.join(HERE, 'renders', 'video.mp4')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], check=True)
print('wrote', out)

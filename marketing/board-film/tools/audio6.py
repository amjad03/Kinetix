"""Board film sound: the voice at its solved times (data/timeline6.json) over a modern, warm score at 96 BPM:
piano and pads under the hook, a soft beat that comes in with the logo and grows chapter by chapter, a gentle
impact on every chapter change, a riser into the logo, and a resolved chord on the end card. -> audio/mix6.wav"""
import json, os, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(os.path.join(HERE, 'data', 'timeline6.json')))
DUR = TL['total']; N = int(DUR * SR) + SR
rng = np.random.default_rng(9)
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)
BEAT = 60 / 96


def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if 0 <= i < len(buf):
        n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n] * g


def env(n, a, r):
    e = np.ones(n); na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e


def lp(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 4), len(x))


def piano(f, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(a * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (1.4 + h * .8)) for h, a in ((1, 1), (2, .5), (3, .2), (4, .08)))
    return x * np.minimum(1, t / .003)


def pad(f, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(np.sin(2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6)) for det in (-.003, 0, .003)) / 3 + .2 * np.sin(4 * np.pi * f * t)
    return x * env(len(t), 1.0, 1.4)


def kick():
    t = np.arange(int(.32 * SR)) / SR; f = 46 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)


def shaker():
    x = rng.standard_normal(int(.06 * SR)); x = x - lp(x, 5000); return x * env(len(x), .002, .05) * .4


def noise(d): return rng.standard_normal(int(d * SR))


units = TL['units']
ch_starts = [u['S'] for u in units if u['first'] and u['S'] > 1]
t_logo = next(u['S'] for u in units if u['kind'] == 'brand')
t_end = next(u['S'] for u in units if u['kind'] == 'end')

vo = np.zeros(N)
for u in units:
    for p in u['pieces']:
        y, sr = sf.read(os.path.join(HERE, 'audio', 'vo', p['file']))
        if sr != SR:
            y = np.interp(np.arange(0, len(y), sr / SR), np.arange(len(y)), y)
        add(vo, y, p['at'])

prog = [[45, 52, 60, 64], [41, 48, 57, 60], [48, 55, 64, 67], [43, 50, 59, 62]]   # Am F C G
mus = np.zeros(N)
bar = 4 * BEAT
t, i = 0.05, 0
while t < DUR:
    ch = prog[i % 4]
    level = 0 if t < t_logo else min(1.0, .45 + .11 * sum(1 for c in ch_starts if c <= t))
    for m in ch[:3]:
        add(mus, pad(midi(m), bar + 1.4), t, .045)
    add(mus, lp(piano(midi(ch[0] - 12), 3.0), 1800), t, .17)
    for k, m in enumerate([ch[1], ch[2], ch[3], ch[2] + 12, ch[1] + 12, ch[3], ch[2], ch[3] + 12]):
        add(mus, piano(midi(m + 12), 1.4), t + k * BEAT / 2, .05 + .02 * (k % 2 == 0))
    if level and t < t_end:
        for b in range(4):
            add(mus, kick(), t + b * BEAT, .32 * level * (1 if b in (0, 2) else .55))
            for h in (0.5, 0.75):
                add(mus, shaker(), t + (b + h) * BEAT, .18 * level)
        # bass on the root, eighths
        for e in range(8):
            f = midi(ch[0] - 12 + (12 if e % 4 == 3 else 0))
            tt = np.arange(int(BEAT / 2 * SR)) / SR
            add(mus, lp(np.sin(2 * np.pi * f * tt) + .3 * np.sin(4 * np.pi * f * tt), 400) * env(len(tt), .005, .12), t + e * BEAT / 2, .22 * level)
    t += bar; i += 1

# riser into the logo, and a soft impact on it and on every chapter change
d = 1.4; tt = np.arange(int(d * SR)) / SR
rise = (noise(d) - lp(noise(d), 900)) * (tt / d) ** 2 * .35
add(mus, rise, t_logo - d, .7)
for c in [t_logo] + ch_starts:
    b = kick()[:]; b = np.concatenate([b, np.zeros(int(.8 * SR))]); b += lp(noise(len(b) / SR), 300) * env(len(b), .002, 1.0) * .5
    add(mus, b, c - .02, .5)
    sw = noise(.5); sw = (sw - lp(sw, 1500)) * np.sin(np.linspace(0, np.pi, len(sw))) ** 2
    add(mus, sw, c - .35, .08)
# end chord
for m in (45, 52, 57, 60, 64, 69):
    dd = DUR - t_end
    add(mus, lp(pad(midi(m), dd), 2500), t_end, .06)

fade = np.ones(N); fade[:int(1.5 * SR)] = np.linspace(0, 1, int(1.5 * SR))
fo = int((DUR - 2.5) * SR); fade[fo:] = np.linspace(1, 0, N - fo) ** 1.5
mus *= fade
a = np.abs(vo); w = int(.12 * SR)
sm = np.convolve(np.convolve(a, np.ones(w) / w, 'same'), np.ones(int(.35 * SR)) / int(.35 * SR), 'same')
mus *= 1 - .45 * np.clip(sm / .04, 0, 1)
mix = (vo + mus * .8)[:int(DUR * SR)]
mix = mix / np.abs(mix).max() * .9
st = np.stack([mix, np.roll(mix, 18) * .985], 1)
raw = os.path.join(HERE, 'audio', 'mix6_raw.wav'); out = os.path.join(HERE, 'audio', 'mix6.wav')
sf.write(raw, st, SR)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=8', '-ar', str(SR), out], check=True)
print('mix', round(DUR, 1), 's')

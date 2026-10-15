"""v5 sound: the voice pieces at their solved times (data/timeline5.json) over a quiet, warm music bed
(soft piano-like chords, no drums), ducked under the voice. -> audio/mix5.wav (48 kHz stereo, -16 LUFS)."""
import json, os, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(os.path.join(HERE, 'data', 'timeline5.json')))
DUR = TL['total']; N = int(DUR * SR) + SR
rng = np.random.default_rng(5)
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if 0 <= i < len(buf):
        n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n] * g


def env(n, a, r):
    e = np.ones(n); na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e


def piano(f, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(a * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (1.6 + h * .9)) for h, a in ((1, 1), (2, .45), (3, .18), (4, .08)))
    x *= np.minimum(1, t / .004)
    return x


def pad(f, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(np.sin(2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6)) for det in (-.0025, 0, .0025)) / 3
    x += .25 * np.sin(2 * np.pi * 2 * f * t)
    return x * env(len(t), 1.2, 1.6)


# voice
vo = np.zeros(N)
for u in TL['units']:
    for p in u['pieces']:
        y, sr = sf.read(os.path.join(HERE, 'audio', 'vo', p['file']))
        if sr != SR:
            y = np.interp(np.arange(0, len(y), sr / SR), np.arange(len(y)), y)
        add(vo, y, p['at'])

# music: Cmaj7 - Am7 - Fmaj7 - G(sus) at 76 BPM, one chord per bar, gentle arpeggio
bpm = 76; beat = 60 / bpm; bar = 4 * beat
prog = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]]
mus = np.zeros(N)
t, i = 0.0, 0
while t < DUR:
    ch = prog[i % 4]
    for m in ch[:3]:
        add(mus, pad(midi(m), bar + 1.5), t, .05)
    add(mus, piano(midi(ch[0] - 12), 3.0), t, .16)
    for k, m in enumerate([ch[1], ch[2], ch[3], ch[2], ch[1] + 12, ch[3], ch[2] + 12, ch[3]]):
        add(mus, piano(midi(m + 12), 1.6), t + k * beat / 2, .055 if k % 2 else .075)
    t += bar; i += 1
fade = np.ones(N); fi = int(2 * SR); fade[:fi] = np.linspace(0, 1, fi)
fo = int((DUR - 3) * SR); fade[fo:] = np.linspace(1, 0, N - fo) ** 1.5
mus *= fade
a = np.abs(vo); w = int(.15 * SR)
sm = np.convolve(a, np.ones(w) / w, 'same'); sm = np.convolve(sm, np.ones(int(.4 * SR)) / int(.4 * SR), 'same')
mus *= 1 - .55 * np.clip(sm / .04, 0, 1)

mix = vo + mus * .7
mix = mix[:int(DUR * SR)]
mix = mix / np.abs(mix).max() * .9
st = np.stack([mix, np.roll(mix, 20) * .985], 1)
raw = os.path.join(HERE, 'audio', 'mix5_raw.wav'); out = os.path.join(HERE, 'audio', 'mix5.wav')
sf.write(raw, st, SR)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', str(SR), out], check=True)
print('mix', round(DUR, 1), 's ->', out)

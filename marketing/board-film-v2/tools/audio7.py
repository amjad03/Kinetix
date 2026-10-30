"""Sound for the Before/After film: the voice at its solved times (data/timeline7.json), a score that is sparse and
cold under the old day (a few minor piano notes over room tone: a ceiling fan, chalk on a board, a clock, the bell),
swells at the turn, and opens into a warm, steady piano-and-strings theme for the new day, resolving on the end card.
-> audio/mix7.wav"""
import json, os, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(os.path.join(HERE, 'data', 'timeline7.json')))
U = {u['id']: u for u in TL['units']}
DUR = TL['total']; N = int(DUR * SR) + SR
rng = np.random.default_rng(4)
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if 0 <= i < len(buf):
        n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n] * g


def env(n, a, r):
    e = np.ones(n); na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e


def lp(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 4), len(x))


def bp(x, lo, hi): return lp(x, hi) - lp(x, lo)


def noise(d): return rng.standard_normal(int(d * SR))


def piano(f, d, bright=1.0):
    t = np.arange(int(d * SR)) / SR
    x = sum(a * np.sin(2 * np.pi * f * h * t + h) * np.exp(-t * (1.1 + h * .7)) for h, a in ((1, 1), (2, .45 * bright), (3, .18 * bright), (4, .07)))
    return x * np.minimum(1, t / .004)


def strings(f, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(np.sin(2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6)) * (1 + .003 * np.sin(2 * np.pi * 5 * t)) for det in (-.004, -.0015, .0015, .004)) / 4
    x += .3 * np.sin(4 * np.pi * f * t)
    return lp(x, 2400) * env(len(t), 1.6, 1.8)


t_turn = U['p1']['S']
t_A = U['p1']['pieces'][0]['at'] if U['p1']['pieces'] else t_turn + 1
t_close = U['s7']['S']
t_end = U['e1']['S']

vo = np.zeros(N)
for u in TL['units']:
    for p in u['pieces']:
        y, sr = sf.read(os.path.join(HERE, 'audio', 'vo', p['file']))
        if sr != SR:
            y = np.interp(np.arange(0, len(y), sr / SR), np.arange(len(y)), y)
        add(vo, y, p['at'])

mus = np.zeros(N); sfx = np.zeros(N)
# ---- the old day: room tone, chalk, clock, bell, sparse minor piano
fan = bp(noise(t_turn + 1), 60, 400) * .05
fan *= 1 + .35 * np.sin(2 * np.pi * 1.7 * np.arange(len(fan)) / SR)
fan *= env(len(fan), 1.2, 1.5)
# fan room tone removed: it read as background hiss


def chalk(d):
    x = bp(noise(d), 1800, 6000)
    e = np.zeros(len(x)); tt = 0.0
    while tt < d:
        L = rng.uniform(.12, .35); s = int(tt * SR); n = int(L * SR)
        e[s:s + n] = np.sin(np.linspace(0, np.pi, len(e[s:s + n]))) ** .6 * rng.uniform(.5, 1)
        tt += L + rng.uniform(.04, .18)
    return x * e * .35


for uid in ():                                                     # chalk scratch removed (sounded harsh)
    add(sfx, chalk(min(5.5, U[uid]['E'] - U[uid]['S'])), U[uid]['S'] + .2, .8 if uid == 'k1' else .45)
for k in range(int(U['s3']['E'] - U['s3']['S'])):                  # the clock while names are called
    tk = np.exp(-np.arange(int(.03 * SR)) / SR * 220) * np.sin(2 * np.pi * 3000 * np.arange(int(.03 * SR)) / SR)
    add(sfx, tk, U['s3']['S'] + k + .3, .12)
bell_t = U['k2']['S'] + .2
tb = np.arange(int(3.5 * SR)) / SR
bell = sum(a * np.sin(2 * np.pi * f * tb) * np.exp(-tb * dcy) for f, a, dcy in ((880, 1, 1.2), (1394, .5, 1.6), (2210, .3, 2.2), (2640, .2, 3.0)))
add(sfx, bell, bell_t, .12)
notes = [(57, 0), (60, 1.6), (64, 3.2), (62, 6.4), (57, 8.0), (53, 9.6), (57, 12.8), (60, 14.4), (55, 16.0), (52, 19.2)]
t = 1.0
while t < t_turn - 2:
    for m, dt in notes:
        if t + dt < t_turn - 1.5:
            add(mus, lp(piano(midi(m), 4.5, .6), 2200), t + dt, .16)
    add(mus, strings(midi(45), 12), t, .05)
    t += 22
# ---- the turn: a swell into the first warm chord
d = 2.6; tt = np.arange(int(d * SR)) / SR
swell = sum(strings(midi(m), d) for m in (52, 57, 60, 64)) * (tt / d) ** 2
add(mus, swell, t_A - d + .1, .35)
# ---- the new day: C - G - Am - F at 84 BPM, piano eighths over strings, gentle pulse
beat = 60 / 84; bar = 4 * beat
prog = [[48, 55, 64, 67], [43, 50, 59, 62], [45, 52, 60, 64], [41, 48, 57, 60]]
t, i = t_A, 0
while t < DUR - 1:
    ch = prog[i % 4]
    warmth = min(1.0, .55 + .08 * i)
    for m in ch[1:]:
        add(mus, strings(midi(m), bar + 1.6), t, .05 * warmth)
    add(mus, lp(piano(midi(ch[0] - 12), 3.2), 1400), t, .22)
    if t < t_end:
        for k, m in enumerate([ch[1], ch[2], ch[3], ch[2], ch[1] + 12, ch[2], ch[3], ch[2] + 12]):
            add(mus, piano(midi(m + 12), 1.5), t + k * beat / 2, .065 if k % 2 else .085)
        for b in range(4):                                   # a soft heartbeat-like pulse
            tk = np.arange(int(.25 * SR)) / SR; fk = 50 + 40 * np.exp(-tk * 25)
            add(mus, np.sin(2 * np.pi * np.cumsum(fk) / SR) * np.exp(-tk * 12), t + b * beat, .10 * warmth * (b % 2 == 0))
    t += bar; i += 1
# final chord on the end card
for m in (36, 48, 55, 60, 64, 67, 72):
    add(mus, strings(midi(m), DUR - t_end + .5), t_end, .06)
    add(mus, lp(piano(midi(m), 5), 2000), t_end, .018)

fade = np.ones(N); fo = int((DUR - 2.5) * SR); fade[fo:] = np.linspace(1, 0, N - fo) ** 1.5
mus *= fade; sfx *= fade
a = np.abs(vo); w = int(.12 * SR)
sm = np.convolve(np.convolve(a, np.ones(w) / w, 'same'), np.ones(int(.4 * SR)) / int(.4 * SR), 'same')
mus *= 1 - .5 * np.clip(sm / .04, 0, 1)
mix = (vo + mus * .85 + sfx)[:int(DUR * SR)]
mix = mix / np.abs(mix).max() * .9
st = np.stack([mix, np.roll(mix, 22) * .985], 1)
raw = os.path.join(HERE, 'audio', 'mix7_raw.wav'); out = os.path.join(HERE, 'audio', 'mix7.wav')
sf.write(raw, st, SR)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=9', '-ar', str(SR), out], check=True)
print('mix', round(DUR, 1), 's')

"""Zynetix promo sound: VO clips placed at the measured phrase starts + a synthesized score and sound effects.
The music is built around the video: a heartbeat under the 3D hook (in time with the pulsing heart), a riser into the
logo hit, a beat that comes in on the logo, and a resolved chord on the last line. Writes audio/mix.wav (48 kHz stereo)."""
import json, os
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
TL = json.load(open(os.path.join(HERE, "timeline.json")))
DUR = TL["duration"]; N = int(DUR * SR)
rng = np.random.default_rng(3)
midi = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def add(buf, x, t, g=1.0):
    i = int(t * SR); 
    if i >= len(buf) or i < 0: return
    n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n] * g
def env(n, a=.005, r=.2):
    e = np.ones(n); na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR))); e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e
def lp(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 4), len(x))
def hp(x, fc): return x - lp(x, fc)
def tone(f, d, harm=((1, 1), (2, .3), (3, .12)), det=0):
    t = np.arange(int(d * SR)) / SR; return sum(a * np.sin(2 * np.pi * f * (1 + det) * h * t) for h, a in harm)
def kick(d=.35):
    t = np.arange(int(d * SR)) / SR; f = 45 + 110 * np.exp(-t * 28); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def noise(d): return rng.standard_normal(int(d * SR))
def clap(): x = hp(noise(.22), 1200) * env(int(.22 * SR), .001, .2); return x * 0.8
def hat(): return hp(noise(.07), 6000) * env(int(.07 * SR), .001, .06) * .5

# ---- voice ----
vo = np.zeros(N)
for ph in TL["phrases"]:
    y, sr = sf.read(os.path.join(HERE, f"audio/p_{ph['i']}.wav")); assert sr == 24000
    y = np.interp(np.arange(0, len(y), .5), np.arange(len(y)), y)   # 24k -> 48k
    add(vo, y, ph["t0"], 1.0)

# ---- music ----
mus = np.zeros(N)
sc = {s["id"]: s for s in TL["scenes"]}
T_LOGO = TL["phrases"][[p["s"] for p in TL["phrases"]].index("logo")]["t0"]
T_END = TL["phrases"][-1]["t0"]
# 1) heartbeat under the 3D hook, in time with the pulsing heart (period 2*pi/7.5 s)
k = 0
while True:
    tb = (np.pi / 2 + 2 * np.pi * k) / 7.5 - .05; k += 1
    if tb > T_LOGO - 1.3: break
    if tb > 0.2:
        add(mus, kick(.3) * .9, tb, .8); add(mus, kick(.25) * .6, tb + .17, .5)
# 2) drone through the hook
dr = (tone(55, DUR) + .6 * tone(82.4, DUR)) * .12; dr *= np.clip(np.linspace(0, 1, N) * 4, 0, 1) * (np.arange(N) / SR < T_LOGO)
mus += lp(dr, 300)
# 3) riser into the logo + impact
rt = T_LOGO - 1.3; rd = 1.3; n = int(rd * SR); tt = np.arange(n) / SR
riser = noise(rd) * (tt / rd) ** 2 * .5; riser = hp(riser, 800) + .35 * np.sin(2 * np.pi * np.cumsum(300 + 1700 * (tt / rd) ** 2) / SR) * (tt / rd)
add(mus, riser, rt, .6)
boom = kick(1.6); bn = .4 * lp(noise(1.2), 400) * env(int(1.2 * SR), .001, 1.1); boom[:len(bn)] += bn; add(mus, boom, T_LOGO - .02, 1.0)
add(mus, hp(noise(.8), 3000) * env(int(.8 * SR), .001, .7) * .3, T_LOGO, .6)
# 4) the beat: 112 BPM from the logo to the end card, building through sections
bpm = 112; beat = 60 / bpm; bar = 4 * beat
chords = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]   # Dm Bb F C (pads)
roots = [38, 34, 41, 36]
tb = T_LOGO; bi = 0
sections = [(s["start"], s["id"]) for s in TL["scenes"]]
def level(t):   # 0..1 energy by scene
    cur = [i for (st, i) in sections if t >= st][-1]
    return {'logo': .6, 'models': .75, 'labs': .85, 'sims': .95, 'ai': .9, 'board': 1, 'offline': .95, 'erp': 1, 'apps': 1, 'close': .8}.get(cur, .6)
while tb < DUR - 1:
    L_ = level(tb); ch = chords[(bi // 4) % 4]; rt_ = roots[(bi // 4) % 4]
    add(mus, kick() * 1.0, tb, .55 * L_)
    if bi % 2 == 1: add(mus, clap(), tb, .28 * L_)
    add(mus, hat(), tb + beat / 2, .22 * L_)
    if bi % 4 in (1, 3): add(mus, hat(), tb + beat * .75, .12 * L_)
    # bass 8ths
    for h in range(2):
        f = midi(rt_ + (0, 0, 7, 12)[(bi * 2 + h) % 4] - (12 if h == 0 and bi % 2 == 0 else 0)); x = lp(tone(f, beat / 2, ((1, 1), (2, .5), (3, .2))), 500) * env(int(beat / 2 * SR), .004, .1)
        add(mus, x, tb + h * beat / 2, .5 * L_)
    # arpeggio sparkles from the labs on
    if tb > sc["labs"]["start"] and tb < T_END:
        for h in range(4):
            note = ch[(bi * 4 + h) % 3] + 24 + (12 if (bi + h) % 5 == 0 else 0)
            x = tone(midi(note), beat / 2, ((1, 1), (2, .25), (4, .1))) * env(int(beat / 2 * SR), .002, .3); add(mus, x, tb + h * beat / 4, .11 * L_)
    # pad on the downbeat of each bar
    if bi % 4 == 0:
        for m in ch:
            x = lp(tone(midi(m + 12), bar, ((1, 1), (2, .3), (3, .1)), .002) + tone(midi(m + 12), bar, ((1, 1), (2, .3)), -.002), 1800) * env(int(bar * SR), .4, .8); add(mus, x, tb, .09 * L_)
    tb += beat; bi += 1
# 5) resolved chord on the last line
for m in (50, 57, 62, 66, 69):
    x = lp(tone(midi(m), DUR - T_END - .2, ((1, 1), (2, .35), (3, .15))), 2200) * env(int((DUR - T_END - .2) * SR), .3, 2.0); add(mus, x, T_END, .12)
# fade the beat out under the final line
fade = np.ones(N); i0 = int(T_END * SR); fade[i0:] = np.linspace(1, .55, N - i0); mus *= fade
# duck the score under the voice (side-chain)
a = np.abs(vo); w = int(.12 * SR); sm = np.convolve(a, np.ones(w) / w, 'same'); sm = np.convolve(sm, np.ones(int(.25 * SR)) / int(.25 * SR), 'same')
duck = 1 - .62 * np.clip(sm / .05, 0, 1); mus *= duck

# ---- sound effects ----
sfx = np.zeros(N)
for ph in TL["phrases"]:     # a soft glassy tick as each spoken phrase lands on screen
    f = (880, 1175, 1568)[ph["i"] % 3]; x = tone(f, .16, ((1, 1), (2, .3))) * env(int(.16 * SR), .002, .15); add(sfx, x, ph["t0"] - .03, .06)
for s in TL["scenes"][1:]:   # whoosh at every scene change
    d = .55; n = int(d * SR); x = noise(d); fc = np.linspace(300, 5000, n)
    y = lp(x, 2500) * np.sin(np.linspace(0, np.pi, n)) ** 1.5; y = hp(y, 200); add(sfx, y, s["start"] - .12, .2)
add(sfx, tone(1318, 1.2, ((1, 1), (2, .4), (3, .2))) * env(int(1.2 * SR), .002, 1.1), T_END + .3, .05)   # end sparkle
for q in (1568, 1976, 2349, 3136):
    add(sfx, tone(q, .9) * env(int(.9 * SR), .002, .85), T_END + .35 + (q % 7) * .02, .03)

# ---- mix ----
mix = vo * 1.0 + mus * .62 + sfx * 1.0
m = np.abs(mix).max(); mix = mix / m * .92
st = np.stack([mix, mix], 1); st[:, 1] = np.roll(mix, 24) * .98   # a hair of width
sf.write(os.path.join(HERE, "audio/mix_raw.wav"), st, SR)
os.system(f"ffmpeg -loglevel error -y -i {HERE}/audio/mix_raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=9 -ar 48000 {HERE}/audio/mix.wav")
print("mix", DUR, "s")

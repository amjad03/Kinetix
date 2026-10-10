"""Synthesize the ambient music bed and mix it under the VO clips.

Reads audio/vo_*.wav + audio/vo.json (from tts.py) and timeline.json; writes audio/mix.wav (48 kHz stereo).
Music: soft pads + subtle pulse, rises into scene 3 and scene 9, resolves on the end card.
Ducking: music sits ~18 dB under the voice while it speaks.
"""
import json, os, subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
TL = json.load(open(os.path.join(HERE, "timeline.json")))
DUR = TL["duration"]
N = int(DUR * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lowpass(x, fc):
    # one-pole low-pass, vectorised by chunks is overkill; use FFT brickwall-ish smooth rolloff
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / fc) ** 4)
    return np.fft.irfft(X, len(x))


def env_ar(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def pad_voice(freq, n):
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.07, 0.0, 0.06):  # cents-ish detune via Hz offsets
        f = freq * (1 + det / 100)
        ph = rng.uniform(0, 2 * np.pi)
        for h, amp in ((1, 1.0), (2, 0.35), (3, 0.15), (4, 0.06)):
            out += amp * np.sin(2 * np.pi * f * h * tt + ph * h)
    return out * (0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * tt + rng.uniform(0, 6)))


# Chord plan (MIDI notes); D major colour. Each chord ~8 s with long crossfades.
CHORDS = [
    [50, 57, 62, 64, 69],      # Dadd9
    [47, 54, 59, 62, 66],      # Bm7
    [43, 50, 55, 59, 62, 66],  # Gmaj7
    [45, 52, 57, 61, 64],      # A
]
pads = np.zeros(N)
step = 8.0
k = 0
start = 0.0
while start < DUR - 6:
    ch = CHORDS[k % 4]
    if start >= TL["scenes"][-1]["start"] - 0.5:  # end card: resolve on D
        ch = [38, 50, 57, 62, 66, 69]
        length = DUR - start
    else:
        length = step + 3
    n0, n = int(start * SR), min(int(length * SR), N - int(start * SR))
    seg = sum(pad_voice(midi(m), n) for m in ch) / len(ch)
    pads[n0:n0 + n] += seg * env_ar(n, 2.5, 3.0)
    k += 1
    if ch[0] == 38:
        break
    start += step
pads = lowpass(pads, 1400) * 0.5

# Pulse: soft plucks on 8ths at 96 BPM + gentle low thump, entering at scene 4.
bpm = 96
beat = 60 / bpm
pulse = np.zeros(N)
s3 = TL["scenes"][2]["start"]
s4 = TL["scenes"][3]["start"]
s9 = TL["scenes"][8]["start"]
s10 = TL["scenes"][9]["start"]
s11 = TL["scenes"][10]["start"]
pl = int(0.5 * SR)
tp = np.arange(pl) / SR
arp = [62, 69, 66, 69, 64, 69, 66, 71]
i = 0
x = s4
while x < s11:
    n0 = int(x * SR)
    m = arp[i % len(arp)] + (0 if (int(x // step) % 4) != 1 else -3)
    tone = np.sin(2 * np.pi * midi(m) * tp) * np.exp(-tp * 9) * 0.18
    seg = min(pl, N - n0)
    lvl = 1.4 if s9 <= x < s11 else 1.0
    pulse[n0:n0 + seg] += tone[:seg] * lvl
    if i % 2 == 0 and x >= s4 + 4:
        thump = np.sin(2 * np.pi * 52 * tp * (1 + 0.6 * np.exp(-tp * 30))) * np.exp(-tp * 12) * 0.32 * lvl
        pulse[n0:n0 + seg] += thump[:seg]
    x += beat / 2
    i += 1
pulse = lowpass(pulse, 3500)

# Rises (filtered noise + pitch sweep) landing on scene 3 and scene 9.
rises = np.zeros(N)
for land, ln in ((s3, 3.5), (s9, 4.0)):
    n0, n = int((land - ln) * SR), int(ln * SR)
    tt = np.arange(n) / SR
    noise = lowpass(rng.standard_normal(n), 2500) * 0.25
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / ln) ** 2) / SR) * 0.06
    rises[n0:n0 + n] += (noise + sweep) * (tt / ln) ** 3
    # soft impact bloom on the landing
    m0, m = int(land * SR), int(3.0 * SR)
    tm = np.arange(m) / SR
    rises[m0:m0 + m] += (np.sin(2 * np.pi * midi(38) * tm) * 0.35 + lowpass(rng.standard_normal(m), 900) * 0.15) * np.exp(-tm * 1.6)

music = pads + pulse + rises
# Global arc: fade in, swell after scene 3, lift at 9, resolve/fade out.
arc = np.interp(t, [0, 3, s3, s4, s9, s10, s11, DUR - 2.5, DUR], [0, 0.75, 0.9, 0.85, 1.0, 1.0, 0.9, 0.7, 0])
music *= arc

# Simple stereo reverb (FFT convolution with decaying noise IR).
def reverb(x, seed):
    r = np.random.default_rng(seed)
    L = int(2.4 * SR)
    ir = r.standard_normal(L) * np.exp(-np.arange(L) / SR * 2.6)
    ir = lowpass(ir, 4000)
    ir[0] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + L)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y / np.max(np.abs(y)) * np.max(np.abs(x))

mL = music * 0.7 + reverb(music, 1) * 0.45
mR = music * 0.7 + reverb(music, 2) * 0.45


def load(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


vo = np.zeros(N)
speaking = np.zeros(N)
for i, sc in enumerate(TL["scenes"]):
    clip = load(os.path.join(HERE, f"audio/vo_{i}.wav"))
    act = clip[np.abs(clip) > 0.01]
    clip *= 10 ** ((-18 - rms_db(act)) / 20)  # VO speech at ~-18 dBFS RMS
    n0 = int(sc["vo"] * SR)
    seg = min(len(clip), N - n0)
    vo[n0:n0 + seg] += clip[:seg]
    speaking[n0:n0 + seg] = 1

# Music level: ~-26 dBFS alone, ~-36 under voice (18 dB below VO), smooth 250 ms ramps.
mono = (mL + mR) / 2
act = mono[np.abs(mono) > 1e-4]
base = 10 ** ((-26 - rms_db(act)) / 20)
kern = np.hanning(int(0.5 * SR))
kern /= kern.sum()
duck = np.convolve(speaking, kern, mode="same")
gain = base * (1 - duck * (1 - 10 ** (-10 / 20)))
L = vo + mL * gain
R = vo + mR * gain
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
if peak > 0.97:
    L, R = L / peak * 0.97, R / peak * 0.97
out = np.stack([L, R], 1).astype(np.float32)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                "-c:a", "pcm_s16le", os.path.join(HERE, "audio/mix.wav")], input=out.tobytes(), check=True)
print("mix ok", DUR, "s; music under VO ~", round(-18 - (-36), 1), "dB")

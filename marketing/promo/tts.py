"""One Kokoro clip per phrase of script.json -> audio/p_N.wav, audio/vo.json (durations).
Brand is said ZY-net-iks (phonemes patched); 'E R P' is spelled out in the script."""
import json, os, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "script.json")))
k = Kokoro(os.path.join(HERE, "models/kokoro-v1.0.int8.onnx"), os.path.join(HERE, "models/voices-v1.0.bin"))
os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
fix = lambda ph: ph.replace("zˈaɪnɪtˌɪks", "zˈaɪnˌɛtɪks")
out = []
for i, p in enumerate(P):
    ph = fix(k.tokenizer.phonemize(p.get("say", p["t"]).replace("3D", "three D"), "en-us"))
    s, sr = k.create(ph, voice="af_heart", speed=1.02, lang="en-us", is_phonemes=True)
    sf.write(os.path.join(HERE, f"audio/p_{i}.wav"), s, sr)
    out.append(round(len(s) / sr, 3))
json.dump(out, open(os.path.join(HERE, "audio/vo.json"), "w"))
print(len(out), "clips", round(sum(out), 1), "s of speech")

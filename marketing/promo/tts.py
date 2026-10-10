"""Generate one Kokoro VO clip per scene; write audio/vo_N.wav and audio/vo.json (durations)."""
import json, os, soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = [
    "Every campus runs on a dozen disconnected tools.",
    "What if one intelligent system connected them all?",
    "Meet KINETIX. The AI operating system for education.",
    "It starts in the classroom. The KINETIX AI smartboard turns every lesson into an interactive experience — ink, 3D models, live polls, and AI that builds the lesson with you.",
    "Teachers sign in with a scan, even when the internet doesn't.",
    "Behind it, an AI-powered ERP runs the entire institution — admissions to alumni, exams and evaluation, fees, HR, and outcome-based accreditation.",
    "Built-in AI assistants draft, check, and flag — while people stay in control.",
    "And everyone stays connected. Teachers take attendance and mark scripts on the go. Students learn, submit, and track progress. Parents see attendance, fees, and report cards — the moment they happen.",
    "One platform. One source of truth. Every screen in sync.",
    "In English, Hindi, and Kannada. Privacy-first, DPDP-ready, and built for schools, colleges, and universities.",
    "KINETIX. The AI operating system for education. Book your demo today.",
]
# Pronunciation hint for the brand only (captions keep the real text).
SAY = lambda s: s.replace("KINETIX", "Kinetix").replace("DPDP", "D P D P").replace("3D", "three D")

k = Kokoro(os.path.join(HERE, "models/kokoro-v1.0.int8.onnx"), os.path.join(HERE, "models/voices-v1.0.bin"))
os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
out = []
for i, line in enumerate(LINES):
    samples, sr = k.create(SAY(line), voice="af_heart", speed=1.0, lang="en-us")
    p = os.path.join(HERE, f"audio/vo_{i}.wav")
    sf.write(p, samples, sr)
    out.append({"text": line, "dur": round(len(samples) / sr, 3)})
    print(i, out[-1]["dur"])
json.dump(out, open(os.path.join(HERE, "audio/vo.json"), "w"), indent=1)

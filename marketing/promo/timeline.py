"""Scene timings from SCRIPT.md, checked against measured VO durations; captions chunked by phrase."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
vo = json.load(open(os.path.join(HERE, "audio/vo.json")))
STARTS = [0, 7, 13, 17, 30, 36, 52, 60, 74, 82, 92]
DURATION = 100.0
LEAD = [0.8, 0.4, 0.1, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.6]

scenes, captions = [], []
for i, (s, v) in enumerate(zip(STARTS, vo)):
    end = STARTS[i + 1] if i + 1 < len(STARTS) else DURATION
    vs = s + LEAD[i]
    # never let a line run past its scene (keep >= 0.15 s of air)
    vs = min(vs, end - v["dur"] - 0.15)
    assert vs >= s - 0.05, f"scene {i+1} too short for its VO"
    scenes.append({"start": s, "end": end, "vo": round(vs, 3), "voEnd": round(vs + v["dur"], 3)})
    # caption chunks: split at sentence ends / em-dashes, then by length
    parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+|\s+—\s+", v["text"]) if p.strip()]
    chunks = []
    for p in parts:
        words, cur = p.split(), ""
        for w in words:
            if len(cur) + len(w) + 1 > 62 and cur:
                chunks.append(cur); cur = w
            else:
                cur = (cur + " " + w).strip()
        if chunks and len(cur) < 12 and cur != p:
            chunks[-1] += " " + cur
        else:
            chunks.append(cur)
    total = sum(len(c) + 6 for c in chunks)
    tcur = vs
    for c in chunks:
        d = v["dur"] * (len(c) + 6) / total
        captions.append({"t0": round(tcur, 3), "t1": round(tcur + d, 3), "text": c})
        tcur += d
json.dump({"duration": DURATION, "fps": 30, "scenes": scenes, "captions": captions}, open(os.path.join(HERE, "timeline.json"), "w"), indent=1)
print(len(captions), "captions")
open(os.path.join(HERE, "compose/timeline.js"), "w").write("window.TL = " + json.dumps({"duration": DURATION, "fps": 30, "scenes": scenes, "captions": captions}) + ";\n")

"""Phrase start times from MEASURED clip lengths -> compose/timeline.js, timeline.json.
Every visual cue in the scenes is keyed to these starts, so picture and voice cannot drift."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "script.json")))
D = json.load(open(os.path.join(HERE, "audio/vo.json")))
t, out, scenes = 0.7, [], []
for i, (p, d) in enumerate(zip(P, D)):
    if i and p["s"] != P[i - 1]["s"]:
        t += 0.22
    words, ws = p["t"].split(), []
    for w in words:
        ws.append(len(re.sub(r"\W", "", w)) + 2 + (3 if re.search(r"[,.…?!]$", w) else 0))
    tot, c, wt = sum(ws), 0.0, []
    for w, x in zip(words, ws):
        wt.append([w, round(t + d * c / tot, 3), round(t + d * (c + x) / tot, 3)]); c += x
    out.append({"i": i, "s": p["s"], "text": p["t"], "kw": p.get("kw", ""), "t0": round(t, 3), "t1": round(t + d, 3), "words": wt})
    if not scenes or scenes[-1]["id"] != p["s"]:
        scenes.append({"id": p["s"], "p0": i, "p1": i, "start": round(t, 3), "end": 0})
    scenes[-1]["p1"] = i
    scenes[-1]["end"] = round(t + d + p.get("pad", 0), 3)
    t += d + p.get("pad", 0) + 0.11
dur = round(t + 0.6, 2)
for k, s in enumerate(scenes):   # a scene starts just before its first word; the previous one fades out over it
    s["start"] = 0 if k == 0 else round(s["start"] - 0.3, 3)
    s["end"] = dur if k + 1 == len(scenes) else round(scenes[k + 1]["start"] - 0.3 + 0.2, 3)
for k in range(len(scenes) - 1): scenes[k]["end"] = round(scenes[k + 1]["start"] + 0.2, 3)
tl = {"duration": dur, "fps": 30, "phrases": out, "scenes": scenes}
json.dump(tl, open(os.path.join(HERE, "timeline.json"), "w"))
open(os.path.join(HERE, "compose/timeline.js"), "w").write("window.TL=" + json.dumps(tl) + ";\n")
print("duration", dur, "scenes", [(s["id"], round(s["start"], 1), round(s["end"], 1)) for s in scenes])

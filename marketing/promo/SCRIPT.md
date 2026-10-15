# ZYNETIX promo, v2 (about 2:30, voice af_heart, spoken "ZY-net-iks")

Built to hold attention: the hook is a real 3D heart you can spin, slice and pull apart (the real Zynetix viewer),
the unique features (3D models, virtual labs, simulations, AI) come first, and the school-management modules come after.
Plain words, short sentences, written to be understood by a 12 to 15 year old.

## Why picture and voice stay in sync

`script.json` is a flat list of short phrases (one voice clip each). `tts.py` makes one clip per phrase and
`timeline.py` places each phrase at its **measured** start. Every zoom, pop-in, 3D move, language switch and tick
in `compose/` is keyed to those starts (`f.t0(i)`), never to a hand-typed time, so nothing drifts when the wording changes.
Captions light up word by word. Each phrase also fires a ring pulse, a keyword slam, a camera punch and a soft tick in the score.

## Order

1. Hook (0 to 17 s): heart (spin, slice, pull apart), brain, planets, Taj Mahal, then the Zynetix logo hit.
2. 3D models: 46 models, tap a part, labels in English, Hindi, Kannada.
3. Virtual labs: pendulum (Moon, Jupiter), lens, Ohm's law, break-even.
4. Simulations: 120+ PhET sims, circuit simulator, Python in the browser, periodic table, map of India.
5. AI helper: lesson plans, answers, drafted marking, the teacher approves.
6. Smart board: ink, laser, live polls. Sign in by QR, works offline, phone as remote and camera, recording.
7. ERP: dashboard, admissions, exams, OBE and NAAC, fees and payroll, live bus, hostel, library, placements,
   certificates and ID cards, notices in three languages, workflows, analytics, and a cloud of everything else.
8. Apps: teacher, student, parent, all in sync.
9. Close: three languages, private and safe, "Learning, made magical.", book a demo.

## Build

```sh
cd marketing/promo
npm i                       # puppeteer-core
pip install kokoro-onnx soundfile numpy
# models/ needs kokoro-v1.0.int8.onnx and voices-v1.0.bin (kokoro-onnx release "model-files-v1.0")
./prep.sh                   # patched copy of the real 3D viewer + model lists  -> build/
python3 tts.py && python3 timeline.py && python3 audio.py
node render.mjs --stills 3,20,60     # QA stills -> renders/
node render.mjs                      # frames + ../../dist/zynetix-promo.mp4
```

`CHROME=/path/to/chrome` overrides the browser. Rendering is frame-exact (no real-time capture) and resumable:
existing `frames/NNNNN.jpg` are skipped.

Placeholders to swap: the website `zynetix.in` on the end card. PhET simulations are CC-BY (credit is on screen);
anatomy models are BodyParts3D (CC BY 4.0), see `packages/zynetix_3d/NOTICE`.

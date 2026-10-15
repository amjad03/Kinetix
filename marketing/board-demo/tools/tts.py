"""Kokoro af_heart VO: one clip per segment of data/script.json -> audio/<seg>.wav, data/vo.json (seconds)."""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(HERE, 'data', 'beats.json')))
only = set(sys.argv[1:])
k = Kokoro(os.path.join(HERE, 'models', 'kokoro.onnx'), os.path.join(HERE, 'models', 'voices.bin'))
vo_path = os.path.join(HERE, 'data', 'vo.json')
vo = json.load(open(vo_path)) if os.path.exists(vo_path) else {}
for c in S['chapters']:
    for s in c['beats']:
        if only and s['id'] not in only:
            continue
        audio, sr = k.create(s['vo'].replace('ZYNETIX', 'Zynetix').replace('OBE', 'O B E').replace('NCERT', 'N C E R T').replace('PhET', 'Fet').replace('ERP', 'E R P').replace('QR', 'Q R').replace('PIN', 'pin').replace('Ms Kavya', 'Miss Kavya'), voice='af_heart', speed=1.1, lang='en-us')
        sf.write(os.path.join(HERE, 'audio', s['id'] + '.wav'), audio, sr)
        vo[s['id']] = round(len(audio) / sr, 3)
        print(s['id'], vo[s['id']], flush=True)
json.dump(vo, open(vo_path, 'w'), indent=0)
print('total', round(sum(vo.values()), 1))

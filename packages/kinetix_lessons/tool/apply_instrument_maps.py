#!/usr/bin/env python3
"""Wires the instrument maps and the practical map into the bundled PUC lessons.

    python3 packages/kinetix_lessons/tool/apply_instrument_maps.py [apps/board/assets/lessons/puc]

Run it after bundle_puc.py (which rewrites the chapter files from the pack sources).

1. Every step named in tool/instrument_map/{physics,chemistry,biology,maths}.json becomes
   `{"type": "interactive", "kind": "instrument", "instrument": ..., "preset": ...}`. The block's
   other original fields are kept under `legacy` (type included), so a board without that
   instrument id falls back to the old renderer. Entries with `newStep` add a new instrument
   step to the chapter (in the lesson whose wording matches the title best).
2. Every chapter listed in tool/lab_map.json gets a "Do the practical" virtual_lab step per lab,
   (once: a rerun leaves it as it is).

catalogue.json's step counts are updated to match. Idempotent: steps already rewired, and steps it added before, are left as they are.
"""
import gzip, json, os, re, sys

TOOL = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(TOOL, '..', '..', '..'))
SUBJECTS = ['physics', 'chemistry', 'biology', 'maths']
KEEP = {'id', 'title', 'seconds', 'optional', 'narration', 'voice', 'boards', 'speaker'}


def words(s):
    return set(w for w in re.findall(r'[a-z]+', s.lower()) if len(w) > 3)


def text_of(o):
    if isinstance(o, dict):
        return ' '.join(text_of(v) for k, v in o.items() if k != 'kn')
    if isinstance(o, list):
        return ' '.join(text_of(v) for v in o)
    return o if isinstance(o, str) else ''


def rewire(b, e):
    if b.get('kind') == 'instrument':
        return False
    legacy = {k: v for k, v in b.items() if k != 'id'}
    out = {k: b[k] for k in b if k in KEEP}
    out.update({'type': 'interactive', 'kind': 'instrument', 'instrument': e['instrument'], 'preset': e.get('preset') or {}})
    if 'title' not in out and e.get('title'):
        out['title'] = {'en': e['title']}
    out['legacy'] = legacy
    b.clear()
    b.update(out)
    return True


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40]


def insert_before_recap(blocks, nb):
    i = len(blocks)
    while i > 0 and blocks[i - 1].get('type') in ('recap', 'pyq', 'class_quiz'):
        i -= 1
    blocks.insert(i, nb)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'apps', 'board', 'assets', 'lessons', 'puc')
    entries = {}
    for s in SUBJECTS:
        for e in json.load(open(os.path.join(TOOL, 'instrument_map', s + '.json'))):
            entries.setdefault(e['chapter'], []).append(e)
    labs = {}
    for p in json.load(open(os.path.join(TOOL, 'lab_map.json')))['practicals']:
        if not p.get('lab'):
            continue
        for ch in p.get('chapters') or []:
            labs.setdefault(ch, {}).setdefault(p['lab'], []).append(p)

    stats = {'rewired': 0, 'already': 0, 'added': 0, 'labs': 0, 'labsSkipped': 0, 'missing': []}
    for ch in sorted(set(entries) | set(labs)):
        path = os.path.join(out, ch + '.json.gz')
        if not os.path.exists(path):
            stats['missing'].append(ch)
            continue
        d = json.loads(gzip.decompress(open(path, 'rb').read()))
        lessons = {l['id']: l for l in d['lessons']}
        changed = False
        for e in entries.get(ch, []):
            if e.get('newStep'):
                bid = 'ins-' + slug(e['title'])
                if any(b.get('id') == bid for l in d['lessons'] for b in l['blocks']):
                    stats['already'] += 1
                    continue
                want = words(e['title'])
                best = max(d['lessons'], key=lambda l: (len(want & words(text_of(l.get('title')) + ' ' + text_of(l['blocks']))), 0))
                insert_before_recap(best['blocks'], {
                    'id': bid, 'type': 'interactive', 'kind': 'instrument', 'optional': True, 'seconds': 120,
                    'title': {'en': e['title']}, 'instrument': e['instrument'], 'preset': e.get('preset') or {},
                    'narration': {'en': e['title'] + '. Change one thing at a time and watch what happens.'},
                })
                stats['added'] += 1
                changed = True
                continue
            if 'lesson' in e:
                lid, bid = e['lesson'], e['block']
                if lid not in lessons:
                    lid += '.lesson'
            else:
                lid, bid = e['step'].split('#', 1)
            l = lessons.get(lid)
            b = next((b for b in (l or {}).get('blocks', []) if b.get('id') == bid), None)
            if b is None:
                stats['missing'].append(f'{lid}#{bid}')
                continue
            if rewire(b, e):
                stats['rewired'] += 1
                changed = True
            else:
                stats['already'] += 1
        for lab, ps in labs.get(ch, {}).items():
            have = [b for l in d['lessons'] for b in l['blocks'] if b.get('type') == 'virtual_lab' and b.get('labId') == lab]
            if any(b.get('practical') for b in have):
                stats['labsSkipped'] += 1
                continue
            titles = []
            for p in ps:
                if p['title'] not in titles:
                    titles.append(p['title'])
            nb = {
                'id': 'practical-' + lab, 'type': 'virtual_lab', 'labId': lab, 'practical': [p['id'] for p in ps], 'optional': True, 'seconds': 300,
                'title': {'en': 'Do the practical: ' + titles[0], 'kn': 'ಪ್ರಾಯೋಗಿಕ ಮಾಡಿ: ' + titles[0]},
                'aim': {'en': 'PUC practical' + ('s' if len(titles) > 1 else '') + ': ' + '; '.join(titles) + '.'},
                'narration': {'en': 'Now do the practical on the virtual bench: ' + titles[0] + '. Follow the steps and record each reading.'},
            }
            insert_before_recap(d['lessons'][-1]['blocks'], nb)
            stats['labs'] += 1
            changed = True
        if changed:
            with open(path, 'wb') as f:
                f.write(gzip.compress(json.dumps(d, ensure_ascii=False, separators=(',', ':')).encode(), 9, mtime=0))
    # The catalogue's step counts follow the lessons.
    cp = os.path.join(out, 'catalogue.json')
    cat = json.load(open(cp))
    for ch in cat['chapters']:
        path = os.path.join(out, ch['id'] + '.json.gz')
        if ch['id'] not in labs and ch['id'] not in entries or not os.path.exists(path):
            continue
        n = {l['topicId']: len(l['blocks']) for l in json.loads(gzip.decompress(open(path, 'rb').read()))['lessons']}
        for t in ch['topics']:
            if t['id'] in n and t['steps'] != n[t['id']]:
                t['steps'] = n[t['id']]
                stats['catalogueSteps'] = stats.get('catalogueSteps', 0) + 1
    with open(cp, 'w') as f:
        json.dump(cat, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(stats, indent=1))
    return 1 if stats['missing'] else 0


if __name__ == '__main__':
    sys.exit(main())

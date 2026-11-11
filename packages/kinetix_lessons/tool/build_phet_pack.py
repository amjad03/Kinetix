#!/usr/bin/env python3
"""Builds the PUC PhET content pack (zynetix-content-pack, see
apps/board/lib/classroom_edition/content_pack/README.md) from tool/phet_pack.json.

    python3 packages/kinetix_lessons/tool/build_phet_pack.py <out.zip> [--cache <dir>] [--revision 2026.11]

Each sim is the English HTML5 page from phet.colorado.edu (or the board's own copy in
apps/board/assets/simhub/phet, when it has one), mapped to the catalogue topics whose titles
match the entry's words best. The manifest credits PhET (CC BY 4.0) and the zip carries
PHET-LICENSE.txt. Sims the Classroom APK already ships are refused.
"""
import hashlib, json, os, re, sys, urllib.request, zipfile

TOOL = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(TOOL, '..', '..', '..'))
BOARD = os.path.join(ROOT, 'apps', 'board')
CREDIT = 'PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0 (https://phet.colorado.edu)'
LICENSE = (
    'The PhET simulations in this pack are by PhET Interactive Simulations, University of Colorado Boulder\n'
    '(https://phet.colorado.edu), licensed under the Creative Commons Attribution 4.0 International licence\n'
    '(CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). They are unchanged copies of the English\n'
    'HTML5 pages PhET publishes at https://phet.colorado.edu/sims/html/<id>/latest/<id>_en.html.\n'
)


def words(s):
    return [w for w in re.findall(r'[a-z]+', s.lower()) if len(w) > 2]


def bundled_in_apk():
    src = open(os.path.join(BOARD, 'lib', 'classroom_edition', 'classroom_assets.dart')).read()
    block = src.split('classroom-assets:phet:begin')[1].split('classroom-assets:phet:end')[0]
    return set(re.findall(r"'([a-z0-9-]+)'", block))


def main():
    argv = sys.argv[1:]
    opt = {}
    for k in ('--cache', '--revision'):
        if k in argv:
            i = argv.index(k)
            opt[k] = argv[i + 1]
            del argv[i:i + 2]
    out = argv[0]
    cache = opt.get('--cache', os.path.join(os.path.dirname(os.path.abspath(out)), 'phet-cache'))
    os.makedirs(cache, exist_ok=True)
    cat = json.load(open(os.path.join(BOARD, 'assets', 'lessons', 'puc', 'catalogue.json')))
    chapters = {c['id']: c for c in cat['chapters']}
    spec = json.load(open(os.path.join(TOOL, 'phet_pack.json')))
    apk = bundled_in_apk()
    items, files = [], []
    for sim, title, where in spec['sims']:
        if sim in apk:
            sys.exit(f'{sim} is in the APK already (classroomPhetSims)')
        topics = []
        for ch, hint in where:
            c = chapters.get(ch)
            if c is None:
                sys.exit(f'{sim}: no chapter {ch}')
            want = set(words(hint))
            best = max(c['topics'], key=lambda t: (len(want & set(words(t['title']['en']))), -c['topics'].index(t)))
            topics.append(best['id'])
        local = os.path.join(BOARD, 'assets', 'simhub', 'phet', sim + '.html')
        path = os.path.join(cache, sim + '.html')
        if not os.path.exists(path):
            if os.path.exists(local):
                path = local
            else:
                url = f'https://phet.colorado.edu/sims/html/{sim}/latest/{sim}_en.html'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (pack builder)'})
                with urllib.request.urlopen(req, timeout=120) as r, open(path + '.part', 'wb') as f:
                    f.write(r.read())
                os.rename(path + '.part', path)
        data = open(path, 'rb').read()
        if b'<html' not in data[:4000].lower():
            sys.exit(f'{sim}: not an HTML page')
        items.append({
            'id': 'phet-' + sim, 'kind': 'phet', 'title': title, 'file': f'phet/{sim}.html',
            'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'version': 1,
            'topic': {'chapter': where[0][0], 'topics': topics}, 'language': 'en', 'credit': CREDIT,
        })
        files.append((f'phet/{sim}.html', path))
        print(f'{sim:40} {len(data) / 1e6:5.1f} MB  {" ".join(topics)}')
    manifest = {
        'format': 'zynetix-content-pack', 'formatVersion': 1, 'id': 'puc-phet', 'title': 'PUC PhET simulations',
        'publisher': 'Zynetix', 'revision': opt.get('--revision', '2026.11'), 'credit': CREDIT, 'license': 'CC-BY-4.0', 'items': items,
    }
    with zipfile.ZipFile(out + '.part', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('manifest.json', json.dumps(manifest, indent=1, ensure_ascii=False))
        z.writestr('PHET-LICENSE.txt', LICENSE)
        for name, path in files:
            z.write(path, name)
    os.replace(out + '.part', out)
    print(f'{len(items)} sims, {os.path.getsize(out) / 1e6:.1f} MB: {out}')


if __name__ == '__main__':
    main()

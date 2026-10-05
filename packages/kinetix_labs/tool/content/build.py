#!/usr/bin/env python3
"""Writes lib/src/content/labs_data.g.dart: every virtual lab's text in
English, Hindi and Kannada. The experiments themselves (the benches) are Dart
code in lib/src/benches/; this holds what a teacher reads out: aim,
principle, apparatus, procedure, precautions, conclusion and viva questions.
All text is written for KINETIX, never copied from a lab manual.

Sources:
  prototype_labs.json   the 31 labs of the prototype (ids kept: lessons link them)
  labs_*.py             newer labs; each module defines add(lab, W, Q)

The text is compiled into the package (no asset loading), so the catalogue is
there synchronously and offline. Run from the package directory:

    python3 tool/content/build.py
"""
import glob, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'lib/src/content/labs_data.g.dart')

LEVELS = ['lkg', 'ukg'] + [str(i) for i in range(1, 13)] + ['ug', 'pg']
DOMAINS = ['physics', 'chemistry', 'biology', 'electronics', 'forensics', 'maths']
MODES = ['explore', 'guided', 'assessment']
SUBJECTS = {'Physics', 'Chemistry', 'Biology', 'Mathematics', 'Electronics', 'Forensics'}


def W(en, hi, kn):
    return {'en': en, 'hi': hi, 'kn': kn}


def Q(q, a):
    return {'q': q, 'a': a}


LABS = []


def lab(**k):
    k.setdefault('mode', 'guided')
    k.setdefault('curricula', [])
    k.setdefault('setup', {})
    k['reviewed'] = False  # a subject teacher checks every lab before it is marked reviewed
    k['levels'] = [str(l) for l in k['levels']]
    LABS.append(k)


# The prototype's labs: CBSE classes 6–10. Some also suit later classes.
EXTRA_LEVELS = {
    'pendulum': ['11'],
    'lens-mirror': ['12'],
    'glass-slab': ['12'],
    'prism': ['12'],
    'calorimetry': ['11'],
    'sonometer': ['11'],
    'resistors': ['12'],
    'transpiration': ['11'],
    'osmosis': ['11'],
    'microscope': ['11'],
    'probability': ['11'],
}
EXPLORE = {'conductors', 'magnets', 'shadows', 'probability', 'rusting', 'germination', 'separation', 'pinhole'}


def prototype():
    data = json.load(open(os.path.join(HERE, 'prototype_labs.json'), encoding='utf-8'))
    for l in data['labs']:
        classes = l.pop('classes')
        subject = l['subject']
        lab(
            levels=[str(c) for c in classes] + EXTRA_LEVELS.get(l['id'], []),
            domain='maths' if subject == 'Mathematics' else subject.lower(),
            mode='explore' if l['id'] in EXPLORE else 'guided',
            curricula=['cbse', 'ncert'],
            **l,
        )


def modules():
    for path in sorted(glob.glob(os.path.join(HERE, 'labs_*.py'))):
        spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3], path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.add(lab, W, Q)


def check(l):
    errors = []
    lid = l.get('id', '?')

    def words(w, what):
        if not isinstance(w, dict):
            errors.append('%s: %s is not text' % (lid, what))
            return
        for lang in ['en', 'hi', 'kn']:
            s = w.get(lang, '')
            if not isinstance(s, str) or not s.strip():
                errors.append('%s: %s (%s) is empty' % (lid, what, lang))
        en = w.get('en', '')
        if re.search('[A-Za-z]{3,}', en):
            if not re.search('[ऀ-ॿ]', w.get('hi', '')):
                errors.append('%s: %s (hi) is not in Devanagari' % (lid, what))
            if not re.search('[ಀ-೿]', w.get('kn', '')):
                errors.append('%s: %s (kn) is not in Kannada' % (lid, what))

    for k in ['title', 'summary', 'aim', 'principle', 'conclusion']:
        words(l.get(k), k)
    for k, least in [('apparatus', 3), ('steps', 4), ('precautions', 2)]:
        items = l.get(k, [])
        if len(items) < least:
            errors.append('%s: only %d %s' % (lid, len(items), k))
        for i, w in enumerate(items):
            words(w, '%s %d' % (k, i + 1))
    if len(l.get('viva', [])) < 3:
        errors.append('%s: fewer than 3 viva questions' % lid)
    for v in l.get('viva', []):
        words(v.get('q'), 'viva question')
        words(v.get('a'), 'viva answer')
    if not l.get('levels') or any(x not in LEVELS for x in l['levels']):
        errors.append('%s: bad levels %r' % (lid, l.get('levels')))
    if l.get('domain') not in DOMAINS:
        errors.append('%s: bad domain %r' % (lid, l.get('domain')))
    if l.get('mode') not in MODES:
        errors.append('%s: bad mode %r' % (lid, l.get('mode')))
    if l.get('subject') not in SUBJECTS:
        errors.append('%s: bad subject %r' % (lid, l.get('subject')))
    if not l.get('keywords'):
        errors.append('%s: no keywords' % lid)
    return errors


ORDER = ['id', 'bench', 'setup', 'subject', 'domain', 'levels', 'mode', 'curricula', 'reviewed', 'keywords', 'title', 'summary',
         'aim', 'principle', 'apparatus', 'steps', 'precautions', 'conclusion', 'viva']


def main():
    prototype()
    modules()
    errors = []
    ids = [l['id'] for l in LABS]
    for i in sorted({i for i in ids if ids.count(i) > 1}):
        errors.append('duplicate id %s' % i)
    for l in LABS:
        errors += check(l)
    for e in errors:
        print(e)
    if errors:
        print('%d problems; nothing written' % len(errors))
        return 1
    labs = [{k: l[k] for k in ORDER if k in l} for l in LABS]
    text = json.dumps({'labs': labs}, ensure_ascii=False, separators=(',', ':'))
    assert "'''" not in text
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// GENERATED by tool/content/build.py: do not edit. %d labs.\n' % len(labs))
        f.write('// ignore_for_file: lines_longer_than_80_chars\n\n')
        f.write("/// Every virtual lab's text (JSON), read once by [LabLibrary].\n")
        f.write("const labsJson = r'''%s''';\n" % text)
    by = {}
    for l in LABS:
        by[l['domain']] = by.get(l['domain'], 0) + 1
    print('%d labs: %s' % (len(LABS), ', '.join('%s %d' % kv for kv in sorted(by.items()))))
    return 0


if __name__ == '__main__':
    sys.exit(main())

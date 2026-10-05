#!/usr/bin/env python3
"""Lists every interface string the lab code passes to tr()/trn() and checks
that lib/src/core/strings_hi.dart and strings_kn.dart translate it.

    python3 tool/extract_strings.py          # report missing keys
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIT = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""
TR = re.compile(r"\btr\(\s*" + LIT)
TRN = re.compile(r"\btrn\(\s*[^,]+,\s*" + LIT + r"\s*,\s*" + LIT, re.S)


def unescape(s):
    return s.replace("\\'", "'").replace('\\"', '"').replace('\\$', '$').replace('\\\\', '\\')


def used_keys(dirs):
    keys = set()
    for d in dirs:
        for base, _, files in os.walk(d):
            for f in files:
                if not f.endswith('.dart') or f.startswith('strings_') or f.endswith('.g.dart'):
                    continue
                src = open(os.path.join(base, f), encoding='utf-8').read()
                for m in TR.finditer(src):
                    keys.add(unescape(m.group(1) if m.group(1) is not None else m.group(2)))
                for m in TRN.finditer(src):
                    g = m.groups()
                    keys.add(unescape(g[0] if g[0] is not None else g[1]))
                    keys.add(unescape(g[2] if g[2] is not None else g[3]))
    return keys


ENTRY = re.compile(r"^\s*" + LIT + r"\s*:\s*" + LIT + r"\s*,\s*$")


def table(path):
    out = {}
    if not os.path.exists(path):
        return out
    for line in open(path, encoding='utf-8'):
        m = ENTRY.match(line)
        if m:
            g = m.groups()
            out[unescape(g[0] if g[0] is not None else g[1])] = unescape(g[2] if g[2] is not None else g[3])
    return out


if __name__ == '__main__':
    keys = used_keys([os.path.join(ROOT, 'lib')])
    bad = 0
    for lang in ['hi', 'kn']:
        t = table(os.path.join(ROOT, 'lib/src/core/strings_%s.dart' % lang))
        missing = sorted(k for k in keys if k not in t)
        for k in missing:
            print('%s missing: %r' % (lang, k))
        bad += len(missing)
    print('%d keys, %d missing' % (len(keys), bad))
    sys.exit(1 if bad else 0)

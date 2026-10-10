import re, os, sys
base = os.path.dirname(os.path.abspath(__file__)) + '/wordnet/'
pos_map = {'n': 'noun', 'v': 'verb', 'a': 'adjective', 'r': 'adverb'}
files = {'n': 'noun', 'v': 'verb', 'a': 'adj', 'r': 'adv'}
LIMIT = int(sys.argv[1])
syn = {}
for p, f in files.items():
    for line in open(base + 'data.' + f, encoding='utf8'):
        if line.startswith('  '):
            continue
        head, _, gloss = line.partition('|')
        t = head.split()
        off = t[0]
        n = int(t[3], 16)
        words = [re.sub(r'\(.*\)$', '', t[4 + 2 * i]).replace('_', ' ') for i in range(n)]
        parts = [s.strip() for s in gloss.split(';')]
        defs = [s for s in parts if not s.startswith('"')]
        ex = [s.strip('"') for s in parts if s.startswith('"')]
        syn[(p, off)] = (words, '; '.join(defs[:2]), ex[0] if ex else '')
cands = []
for p, f in files.items():
    for line in open(base + 'index.' + f, encoding='utf8'):
        if line.startswith('  '):
            continue
        t = line.split()
        lemma = t[0]
        if not lemma.isalpha() or len(lemma) < 3:
            continue
        sc = int(t[2])
        ptr = int(t[3])
        tag = int(t[4 + ptr + 1])
        offs = t[6 + ptr:]
        cands.append((tag, lemma, p, offs))
# group by lemma, rank by total tag count
tot = {}
for tag, lemma, p, offs in cands:
    tot[lemma] = tot.get(lemma, 0) + tag
top = sorted(tot, key=lambda w: -tot[w])[:LIMIT]
topset = set(top)
rows = {}
for tag, lemma, p, offs in sorted(cands, key=lambda c: -c[0]):
    if lemma not in topset:
        continue
    for off in offs[:1]:
        words, gloss, ex = syn[(p, off)]
        others = [w for w in words if w.lower() != lemma][:4]
        rows.setdefault(lemma, []).append((pos_map[p], gloss, ex, others))
with open(sys.argv[2], 'w', encoding='utf8') as o:
    for w in sorted(rows):
        senses = rows[w][:3]
        o.write(w + '\t' + '\t'.join('|'.join([s[0], s[1].replace('|', '/'), s[2].replace('|', '/'), ','.join(s[3])]) for s in senses) + '\n')
print(len(rows))

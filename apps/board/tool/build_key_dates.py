import json, os, re, sys, glob
here = os.environ.get('OTD_DIR', os.path.dirname(os.path.abspath(__file__)))  # folder holding otd/<m>-<d>.json
board = sys.argv[1]
months = ['January','February','March','April','May','June','July','August','September','October','November','December']
rows = []
# curated
for line in open(board + '/tool/key_dates_extra.tsv', encoding='utf8'):
    line = line.rstrip('\n')
    if not line:
        continue
    y, region, topic, text = line.split('\t')
    m = re.search(r'\((?:c\. )?(\d{1,2}) (' + '|'.join(months) + r')', text)
    mo, d = (months.index(m.group(2)) + 1, int(m.group(1))) if m else (0, 0)
    rows.append((int(y), mo, d, region, topic, text))
curated_keys = {(r[0], r[5][:20]) for r in rows}
# on this day
sci = re.compile(r'discover|invent|telescope|satellite|spacecraft|launch|Nobel|scientist|vaccine|theory|atom|planet|Moon|Mars|space|computer|laser|DNA|nuclear|physic|chemi', re.I)
n = 0
for f in glob.glob(here + '/otd/*.json'):
    try:
        data = json.load(open(f, encoding='utf8'))
    except Exception:
        continue
    m, d = [int(x) for x in os.path.basename(f)[:-5].split('-')]
    ev = [e for e in data.get('events', []) if isinstance(e.get('year'), int) and 20 <= len(e['text']) <= 150]
    ev.sort(key=lambda e: -len(e.get('pages', [])))
    for e in ev[:int(sys.argv[2])]:
        t = e['text'].replace('\t', ' ').strip()
        region = 'india' if re.search(r'India|Indian|Delhi|Mumbai|Bombay|Calcutta|Madras|Karnataka|Bangalore|Mysore', t) else 'world'
        topic = 'science' if sci.search(t) else 'history'
        rows.append((e['year'], m, d, region, topic, t))
        n += 1
# drop duplicates by (year, month, day, first 30 chars)
seen = set(); out = []
for r in rows:
    k = (r[0], r[1], r[2], r[5][:30].lower())
    if k in seen:
        continue
    seen.add(k); out.append(r)
out.sort(key=lambda r: (r[0], r[1], r[2]))
with open(board + '/assets/history/key_dates.tsv', 'w', encoding='utf8') as o:
    for r in out:
        o.write('\t'.join(str(x) for x in r) + '\n')
print(len(out), 'rows;', n, 'from wikipedia')

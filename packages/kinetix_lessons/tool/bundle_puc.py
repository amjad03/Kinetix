#!/usr/bin/env python3
"""Bundles the Zynetix PUC chapter packs as the Classroom edition's offline lessons.

    python3 packages/kinetix_lessons/tool/bundle_puc.py <zynetix-smart-classroom>/content \
        apps/board/assets/lessons/puc [--include-school [--private apps/board/assets/private/lessons]]

Writes catalogue.json (levels, subjects, chapters, topics and their step counts) and one
<chapterId>.json.gz per chapter (its lessons and the questions they use): our own lesson blocks
only. These are committed.

The parts imported from the Zynetix School site (explainer and concept_video blocks, blocks or
questions with a `zs-` id or a `zynetix-school` source/tag, formula sheets, mock patterns) are
never written there. With --include-school they go to a separate, gitignored folder (default
apps/board/assets/private/lessons): one <chapterId>.json.gz overlay per chapter that the board
merges into the chapter when it is present (the build machine runs this before `flutter build`),
plus patterns.json. Pack media (PhET pages) is never copied: the board ships those sims in
assets/simhub/phet.
"""
import gzip, json, os, sys

SCHOOL_BLOCKS = {'explainer', 'concept_video'}
BOARD = 'kar_pu'
SUBJECT_ORDER = ['physics', 'chemistry', 'maths', 'biology', 'computer_science', 'electronics', 'statistics',
                 'accountancy', 'business_studies', 'economics', 'commerce', 'english']
DIAGRAMS = {'whiteboard', 'interactive', 'simulation', 'virtual_lab', '3d_model', 'challenge'}


def is_school_block(b):
    return b.get('type') in SCHOOL_BLOCKS or str(b.get('id', '')).startswith('zs-') or str(b.get('source', '')).startswith('zynetix-school')


def is_school_question(q):
    return str(q.get('id', '')).startswith('zs-') or 'zynetix-school' in (q.get('tags') or [])


def has_kn(o):
    if isinstance(o, dict):
        if isinstance(o.get('kn'), str) and o['kn'].strip():
            return True
        return any(has_kn(v) for v in o.values())
    if isinstance(o, list):
        return any(has_kn(v) for v in o)
    return False


def slim_voice(b):
    v = b.get('voice')
    if isinstance(v, list):
        b['voice'] = [{'say': l['say']} for l in v if isinstance(l, dict) and 'say' in l]


def main():
    argv = sys.argv[1:]
    private = None
    if '--private' in argv:
        i = argv.index('--private')
        private = argv[i + 1]
        del argv[i:i + 2]
    school = '--include-school' in argv
    content, out = [a for a in argv if not a.startswith('--')]
    if school:
        private = private or os.path.join(os.path.dirname(os.path.normpath(out)), '..', 'private', 'lessons')
        os.makedirs(private, exist_ok=True)
        for f in os.listdir(private):
            if f.endswith('.json.gz') or f == 'patterns.json':
                os.remove(os.path.join(private, f))
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.json.gz') or f == 'catalogue.json':
            os.remove(os.path.join(out, f))
    syl = {}
    for f in sorted(os.listdir(os.path.join(content, 'syllabus'))):
        if f.endswith(('-puc1.json', '-puc2.json')):
            for c in json.load(open(os.path.join(content, 'syllabus', f))):
                syl[c['id']] = c
    stats = {'chapters': 0, 'lessons': 0, 'blocks': 0, 'droppedBlocks': {}, 'droppedQuestions': 0, 'droppedQuizBlocks': 0,
             'droppedOtherBoards': 0, 'formulaSheetsSkipped': 0, 'bytes': 0}
    chapters = []
    packs = os.path.join(content, 'packs')
    for p in sorted(os.listdir(packs)):
        if not p.startswith(('puc1-', 'puc2-')):
            continue
        d = os.path.join(packs, p)
        man = json.load(open(os.path.join(d, 'pack.json')))
        ch = syl.get(man['chapterId'])
        if ch is None:
            print('no syllabus chapter for', p, file=sys.stderr)
            continue
        qs, school_qs = {}, {}
        if os.path.exists(os.path.join(d, 'questions.json')):
            for q in json.load(open(os.path.join(d, 'questions.json'))):
                if is_school_question(q):
                    stats['droppedQuestions'] += 1
                    school_qs[q['id']] = q
                    continue
                qs[q['id']] = q
        lessons, used = [], set()
        overlay = {'lessons': {}, 'questions': []}
        school_used = set()
        for lf in sorted(os.listdir(os.path.join(d, 'lessons'))):
            les = json.load(open(os.path.join(d, 'lessons', lf)))
            blocks = []
            ov = {'order': [], 'blocks': {}, 'questionIds': {}}
            for b in les['blocks']:
                if b.get('boards') and BOARD not in b['boards']:
                    stats['droppedOtherBoards'] += 1
                    continue
                if is_school_block(b):
                    stats['droppedBlocks'][b['type']] = stats['droppedBlocks'].get(b['type'], 0) + 1
                    slim_voice(b)
                    ov['order'].append(b['id'])
                    ov['blocks'][b['id']] = b
                    continue
                for k in ('questionIds', 'homeworkQuestionIds'):
                    if k in b:
                        full = [i for i in b[k] if i in qs or i in school_qs]
                        b[k] = [i for i in b[k] if i in qs]
                        if full != b[k]:
                            ov['questionIds'].setdefault(b['id'], {})[k] = full
                            school_used.update(i for i in full if i in school_qs)
                ov['order'].append(b['id'])
                if b['type'] in ('class_quiz', 'pyq') and not b.get('questionIds'):
                    stats['droppedQuizBlocks'] += 1
                    ov['blocks'][b['id']] = b  # comes back with the School questions
                    continue
                if b['type'] == 'activity' and b.get('questionId') and b['questionId'] not in qs:
                    b.pop('questionId')
                slim_voice(b)
                for k in ('questionIds', 'homeworkQuestionIds'):
                    used.update(b.get(k, []))
                if b.get('questionId'):
                    used.add(b['questionId'])
                blocks.append(b)
            if ov['blocks'] or ov['questionIds']:
                overlay['lessons'][les['topicId']] = ov
            if not blocks:
                continue
            les['blocks'] = blocks
            lessons.append(les)
        if not lessons:
            continue
        bundle = {'chapter': ch, 'lessons': lessons, 'questions': [qs[i] for i in sorted(used)]}
        fp = os.path.join(d, 'formulas.json')
        if os.path.exists(fp):
            stats['formulaSheetsSkipped'] += 1
            overlay['formulas'] = json.load(open(fp))
        for ov in overlay['lessons'].values():
            for b in ov['blocks'].values():
                for k in ('questionIds', 'homeworkQuestionIds'):
                    school_used.update(i for i in b.get(k, []) if i in school_qs)
        overlay['questions'] = [school_qs[i] for i in sorted(school_used)]
        if school and (overlay['lessons'] or overlay.get('formulas') or overlay['questions']):
            with open(os.path.join(private, ch['id'] + '.json.gz'), 'wb') as f:
                f.write(gzip.compress(json.dumps(overlay, ensure_ascii=False, separators=(',', ':')).encode(), 9, mtime=0))
            stats['privateBytes'] = stats.get('privateBytes', 0) + os.path.getsize(os.path.join(private, ch['id'] + '.json.gz'))
        raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode()
        gz = gzip.compress(raw, 9, mtime=0)
        with open(os.path.join(out, ch['id'] + '.json.gz'), 'wb') as f:
            f.write(gz)
        stats['bytes'] += len(gz)
        stats['chapters'] += 1
        stats['lessons'] += len(lessons)
        by_topic = {l['topicId']: l for l in lessons}
        topics = []
        for t in ch['topics']:
            if t.get('boards') and BOARD not in t['boards']:
                continue
            l = by_topic.get(t['id'])
            if l is None:
                continue
            stats['blocks'] += len(l['blocks'])
            topics.append({'id': t['id'], 'title': t['title'], 'steps': len(l['blocks']), 'minutes': l.get('minutes', 40), 'kn': has_kn(l['blocks'])})
        if not topics:
            continue
        chapters.append({
            'id': ch['id'], 'year': ch['year'], 'subject': ch['subject'], 'number': ch['number'], 'title': ch['title'],
            'topics': topics,
            'diagrams': sum(1 for l in lessons for b in l['blocks'] if b['type'] in DIAGRAMS),
        })
    subjects = sorted({c['subject'] for c in chapters}, key=lambda s: (SUBJECT_ORDER.index(s) if s in SUBJECT_ORDER else 99, s))
    chapters.sort(key=lambda c: (c['year'], subjects.index(c['subject']), c['number']))
    cat = {'version': 1, 'board': BOARD, 'subjects': subjects, 'chapters': chapters}
    with open(os.path.join(out, 'catalogue.json'), 'w') as f:
        json.dump(cat, f, ensure_ascii=False, separators=(',', ':'))
    stats['bytes'] += os.path.getsize(os.path.join(out, 'catalogue.json'))
    if school:
        pat = os.path.join(content, '..', 'apps', 'board', 'assets', 'classroom', 'patterns.json')
        if os.path.exists(pat):
            with open(pat) as src, open(os.path.join(private, 'patterns.json'), 'w') as dst:
                dst.write(src.read())
    print(json.dumps(stats, indent=1))


if __name__ == '__main__':
    main()

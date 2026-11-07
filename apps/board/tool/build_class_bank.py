#!/usr/bin/env python3
"""Builds the Class tools' question, formula and mock-pattern bank (Classroom edition).

The bank comes from the owner's private Zynetix School content and is NEVER committed: this
script reads the local packs and writes a compact bank into the gitignored folder
apps/board/assets/private/class_tools/, which pubspec.yaml bundles when it is there. The board
works without it (lib/classroom_edition/class_tools/bank.dart falls back to the lessons' quick
checks, else shows an empty state).

    python3 apps/board/tool/build_class_bank.py <zynetix-smart-classroom>/content/packs \
        [--syllabus <content>/syllabus] [--patterns <board>/assets/classroom/patterns.json] \
        [--out apps/board/assets/private/class_tools]

Only puc1-* and puc2-* packs are read. Written:
  index.json                 subjects, their chapters and question counts, entrance patterns
  puc<y>-<subject>.json.gz   per subject: chapters with topics, MCQs, short and long questions,
                             worked problems and formulas (English, TeX turned into plain text)
"""
import argparse
import gzip
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, '..', 'assets', 'private', 'class_tools'))

# --- TeX to plain text -----------------------------------------------------------------------

SUP = dict(zip('0123456789+-−=()niax', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱᵃˣ'))
SUB = dict(zip('0123456789+-−=()aeioxnmrt', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑᵢₒₓₙₘᵣₜ'))
SYMBOLS = {
    'times': '×', 'cdot': '·', 'div': '÷', 'pm': '±', 'mp': '∓', 'le': '≤', 'leq': '≤', 'ge': '≥', 'geq': '≥',
    'ne': '≠', 'neq': '≠', 'approx': '≈', 'sim': '∼', 'propto': '∝', 'infty': '∞', 'to': '→', 'rightarrow': '→',
    'leftarrow': '←', 'Rightarrow': '⇒', 'Leftrightarrow': '⇔', 'leftrightarrow': '↔', 'rightleftharpoons': '⇌',
    'longrightarrow': '⟶', 'uparrow': '↑', 'downarrow': '↓', 'circ': '°', 'degree': '°', 'angle': '∠',
    'triangle': '△', 'perp': '⊥', 'parallel': '∥', 'therefore': '∴', 'because': '∵', 'in': '∈', 'notin': '∉',
    'subset': '⊂', 'subseteq': '⊆', 'cup': '∪', 'cap': '∩', 'emptyset': '∅', 'forall': '∀', 'exists': '∃',
    'sum': 'Σ', 'prod': 'Π', 'int': '∫', 'oint': '∮', 'partial': '∂', 'nabla': '∇', 'ldots': '…', 'cdots': '⋯',
    'dots': '…', 'prime': '′', 'hbar': 'ħ', 'ell': 'ℓ', 'neg': '¬', 'land': '∧', 'lor': '∨', 'oplus': '⊕',
    'equiv': '≡', 'cong': '≅', 'mid': '|', 'vert': '|', 'lvert': '|', 'rvert': '|', 'langle': '⟨', 'rangle': '⟩',
    'quad': ' ', 'qquad': '  ', 'percent': '%', 'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'cot': 'cot', 'sec': 'sec',
    'csc': 'cosec', 'cosec': 'cosec', 'log': 'log', 'ln': 'ln', 'exp': 'exp', 'lim': 'lim', 'max': 'max', 'min': 'min',
    'det': 'det', 'deg': 'deg', 'gcd': 'gcd', 'mod': 'mod', 'bmod': 'mod', 'Delta': 'Δ', 'Gamma': 'Γ', 'Theta': 'Θ',
    'Lambda': 'Λ', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω', 'Pi': 'Π', 'alpha': 'α', 'beta': 'β',
    'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε', 'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ',
    'vartheta': 'θ', 'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π',
    'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ', 'varphi': 'φ', 'chi': 'χ', 'psi': 'ψ',
    'omega': 'ω', 'star': '⋆', 'ast': '∗', 'bullet': '•', 'checkmark': '✓', 'square': '□', 'lfloor': '⌊',
    'rfloor': '⌋', 'lceil': '⌈', 'rceil': '⌉', 'iff': '⇔', 'implies': '⇒', 'cdotp': '·', 'colon': ':',
    'AA': 'Å', 'o': 'ø',
}
DROP = {'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'textstyle', 'limits', 'nolimits',
        'boldsymbol', 'bm', 'mathbf', 'mathrm', 'mathit', 'text', 'textbf', 'textit', 'operatorname', 'mathsf',
        'mathcal', 'mathbb', 'rm', 'bf', 'it', 'vec', 'hat', 'bar', 'overline', 'underline', 'tilde', 'dot',
        'ddot', 'overrightarrow', 'mbox', 'hbox', 'ce', 'mathrel', 'mathop', 'underbrace', 'overbrace', 'pu',
        'begin', 'end', 'tag', 'quad'}


def _group(s, i):
    """The {...} group (or single token) at s[i]: (content, next index)."""
    while i < len(s) and s[i] == ' ':
        i += 1
    if i >= len(s):
        return '', i
    if s[i] == '{':
        depth, j = 0, i
        while j < len(s):
            if s[j] == '{':
                depth += 1
            elif s[j] == '}':
                depth -= 1
                if depth == 0:
                    return s[i + 1:j], j + 1
            j += 1
        return s[i + 1:], len(s)
    if s[i] == '\\':
        m = re.match(r'\\([A-Za-z]+|.)', s[i:])
        return m.group(0), i + len(m.group(0))
    return s[i], i + 1


def _script(text, table, mark):
    plain = tex(text)
    if plain and all(c in table for c in plain):
        return ''.join(table[c] for c in plain)
    return mark + (plain if len(plain) == 1 or plain.isalnum() else '(' + plain + ')')


def _simple(x):
    return re.fullmatch(r'[\w.′ⁿ⁰¹²³⁴⁵⁶⁷⁸⁹⁻₀₁₂₃₄₅₆₇₈₉ΔΣπθαβγδεμλωρσφ]+', x) is not None


def tex(s):
    """Plain text for a TeX fragment (no $)."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == '\\':
            m = re.match(r'\\([A-Za-z]+|.)', s[i:])
            name = m.group(1)
            i += len(m.group(0))
            if name in ('frac', 'dfrac', 'tfrac', 'cfrac'):
                a, i = _group(s, i)
                b, i = _group(s, i)
                a, b = tex(a), tex(b)
                out.append((a if _simple(a) else '(' + a + ')') + '/' + (b if _simple(b) else '(' + b + ')'))
            elif name == 'sqrt':
                n = ''
                if i < len(s) and s[i] == '[':
                    j = s.index(']', i)
                    n, i = s[i + 1:j], j + 1
                a, i = _group(s, i)
                a = tex(a)
                root = {'3': '∛', '4': '∜'}.get(n, '√')
                out.append(root + (a if _simple(a) else '(' + a + ')'))
            elif name in ('text', 'textbf', 'textit', 'mathrm', 'mathbf', 'mbox', 'operatorname', 'mathit', 'textrm', 'mathsf', 'mathbb', 'mathcal'):
                a, i = _group(s, i)
                out.append(tex(a) if name not in ('text', 'mbox', 'textrm') else a.replace('\\,', ' ').replace('\\ ', ' '))
            elif name in ('vec', 'overrightarrow'):
                a, i = _group(s, i)
                out.append(tex(a) + '⃗' if len(tex(a)) == 1 else tex(a))
            elif name in ('hat', 'bar', 'overline', 'tilde', 'dot', 'ddot', 'underline', 'boldsymbol', 'bm', 'underbrace', 'overbrace', 'ce', 'pu'):
                a, i = _group(s, i)
                out.append(tex(a))
            elif name in ('begin', 'end'):
                _, i = _group(s, i)
            elif name in SYMBOLS:
                sym = SYMBOLS[name]
                out.append(sym + (' ' if len(sym) > 1 and sym.isalpha() and i < len(s) and s[i] not in ' ({' else ''))
            elif name in (',', ';', ':', ' ', '>'):
                out.append(' ')
            elif name in ('!',):
                pass
            elif name == '\\':
                out.append('; ')
            elif name in ('{', '}', '%', '$', '#', '&', '_'):
                out.append(name)
            elif name in DROP:
                pass
            else:
                out.append(name)
        elif c == '^':
            a, i = _group(s, i + 1)
            out.append(_script(a, SUP, '^'))
        elif c == '_':
            a, i = _group(s, i + 1)
            out.append(_script(a, SUB, '_'))
        elif c in '{}':
            i += 1
        elif c == '~':
            out.append(' ')
            i += 1
        elif c == '&':
            i += 1
        else:
            out.append(c)
            i += 1
    t = ''.join(out)
    t = re.sub(r'[ \t]+', ' ', t)
    return t.strip()


def plain(s):
    """Text with $…$ / $$…$$ / \\(…\\) maths turned into plain text, and markdown emphasis dropped."""
    if not s:
        return ''
    s = re.sub(r'\$\$(.+?)\$\$', lambda m: tex(m.group(1)), s, flags=re.S)
    s = re.sub(r'\$(.+?)\$', lambda m: tex(m.group(1)), s, flags=re.S)
    s = re.sub(r'\\\((.+?)\\\)', lambda m: tex(m.group(1)), s, flags=re.S)
    if '\\' in s and re.search(r'\\[A-Za-z]+', s):
        s = tex(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'\1', s)
    return re.sub(r'[ \t]+', ' ', s).strip()


def en(v):
    if isinstance(v, dict):
        return v.get('en') or ''
    return v if isinstance(v, str) else ''


# --- Descriptive questions from the lessons --------------------------------------------------

SHORT_VERBS = {'define', 'state', 'name', 'tell', 'write', 'list', 'give', 'identify', 'recall', 'recognise',
               'recognize', 'label', 'classify', 'mention', 'what', 'distinguish', 'differentiate'}
LONG_VERBS = {'explain', 'describe', 'derive', 'discuss', 'compare', 'prove', 'show', 'analyse', 'analyze',
              'illustrate', 'justify', 'draw', 'outline', 'interpret', 'evaluate', 'examine', 'trace', 'deduce',
              'relate', 'contrast', 'establish', 'obtain', 'apply'}
NEEDS_FIGURE = re.compile(r'\b(this code|the code|following code|this program|the program below|below|shown|figure|'
                          r'diagram|graph|table|the circuit|picture|image|the map|above)\b', re.I)


def sentence(s):
    s = plain(s).strip()
    if not s:
        return s
    s = s[0].upper() + s[1:]
    return s if s[-1] in '.?!' else s + '.'


def lesson_parts(lesson):
    tp = (lesson.get('topicId') or '').split('.')[-1]
    objectives, recap, shorts, problems = [], [], [], []
    for b in lesson.get('blocks', []):
        t = b.get('type')
        if t == 'intro':
            objectives += [en(o) for o in b.get('objectives', []) if en(o)]
        elif t == 'recap':
            pts = [plain(en(p)) for p in b.get('points', [])]
            ans = [plain(en(a)) for a in b.get('answers', [])]
            for k, p in enumerate(pts):
                if p.endswith('?') and len(p.split()) >= 4 and k < len(ans) and ans[k]:
                    shorts.append({'tp': tp, 'q': p, 'a': ans[k]})
                    recap.append(ans[k])
                elif p:
                    recap.append(p)
        elif t == 'example':
            q, a = plain(en(b.get('problem'))), plain(en(b.get('answer')))
            if q and a and not NEEDS_FIGURE.search(q) and len(q) < 420:
                steps = [plain(en(x)) for x in b.get('steps', [])][:8]
                problems.append({'tp': tp, 'q': q, 'a': a, 'st': [x for x in steps if x]})
    longs = []
    for o in objectives:
        first = re.split(r'\W+', o.strip(), maxsplit=1)[0].lower()
        if first in SHORT_VERBS:
            shorts.append({'tp': tp, 'q': sentence(o), 'a': ' '.join(recap[:2])})
        elif first in LONG_VERBS:
            longs.append({'tp': tp, 'q': sentence(o), 'pts': recap[:4]})
    return shorts, longs, problems


def formula_items(pack_dir, lessons):
    out, seen = [], set()
    path = os.path.join(pack_dir, 'formulas.json')
    if os.path.exists(path):
        for f in json.load(open(path, encoding='utf-8')).get('formulas', []):
            texs = f.get('tex') or ''
            if texs and texs not in seen:
                seen.add(texs)
                out.append({'tp': (f.get('topicId') or '').split('.')[-1], 'n': plain(en(f.get('name'))), 'tex': texs,
                            'txt': tex(texs), 'note': plain(en(f.get('note')))})
    for lesson in lessons:
        tp = (lesson.get('topicId') or '').split('.')[-1]
        for b in lesson.get('blocks', []):
            texs = b.get('formula') if b.get('type') == 'trick' else None
            if isinstance(texs, str) and texs.strip() and texs not in seen:
                seen.add(texs)
                out.append({'tp': tp, 'n': plain(en(b.get('heading'))).rstrip('.'), 'tex': texs, 'txt': tex(texs), 'note': plain(en(b.get('body')))[:160]})
    return out


DIFF = {'easy': 1, 'medium': 2, 'hard': 3}


def mcqs(pack_dir):
    out = []
    for q in json.load(open(os.path.join(pack_dir, 'questions.json'), encoding='utf-8')):
        fmt = q.get('format')
        opts = [plain(en(o)) for o in q.get('options', [])]
        if fmt not in (None, 'mcq', 'assertion_reason', 'either_or') or len(opts) < 2 or not all(opts):
            continue
        a = q.get('answer')
        if not isinstance(a, int) or not 0 <= a < len(opts):
            continue
        stem = plain(en(q.get('stem')))
        if not stem or NEEDS_FIGURE.search(stem) and 'Assertion' not in stem:
            continue
        item = {'id': q['id'], 'tp': (q.get('topicId') or '').split('.')[-1], 's': stem, 'o': opts, 'a': a,
                'd': DIFF.get(q.get('difficulty'), 2)}
        x = plain(en(q.get('explanation')))
        if x:
            item['x'] = x[:320]
        if 'PUC' in (q.get('exams') or []):
            item['puc'] = 1
        out.append(item)
    return out


# --- Main ------------------------------------------------------------------------------------

def load_syllabus(path):
    chapters, subjects = {}, {}
    if not path or not os.path.isdir(path):
        return chapters, subjects
    index = os.path.join(path, 'index.json')
    if os.path.exists(index):
        for s in json.load(open(index, encoding='utf-8')).get('subjects', []):
            subjects[s['subject']] = en(s.get('title')) or s['subject'].replace('_', ' ').title()
    for f in os.listdir(path):
        if f == 'index.json' or not f.endswith('.json'):
            continue
        data = json.load(open(os.path.join(path, f), encoding='utf-8'))
        if isinstance(data, list):
            for ch in data:
                chapters[ch['id']] = ch
    return chapters, subjects


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('packs', help='the private content/packs folder')
    ap.add_argument('--syllabus', help='content/syllabus (default: next to the packs folder)')
    ap.add_argument('--patterns', help='entrance-exam mock patterns JSON (default: ../../apps/board/assets/classroom/patterns.json from the packs)')
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()

    packs = os.path.abspath(args.packs)
    if not os.path.isdir(packs):
        sys.exit(f'No packs folder at {packs}')
    syllabus = args.syllabus or os.path.join(os.path.dirname(packs), 'syllabus')
    chapters_meta, subject_titles = load_syllabus(syllabus)
    patterns = args.patterns or os.path.join(os.path.dirname(os.path.dirname(packs)), 'apps', 'board', 'assets', 'classroom', 'patterns.json')
    known_subjects = sorted(subject_titles, key=len, reverse=True)

    subjects = {}
    for name in sorted(os.listdir(packs)):
        d = os.path.join(packs, name)
        if not re.match(r'puc[12]-', name) or not os.path.exists(os.path.join(d, 'questions.json')):
            continue
        pack = json.load(open(os.path.join(d, 'pack.json'), encoding='utf-8')) if os.path.exists(os.path.join(d, 'pack.json')) else {}
        chapter_id = pack.get('chapterId') or name
        meta = chapters_meta.get(chapter_id, {})
        year = int(name[3])
        subject = meta.get('subject')
        if not subject:
            rest = chapter_id[5:]
            subject = next((s for s in known_subjects if rest.startswith(s.replace('_', '-') + '-')), rest.split('-')[0])
        m = re.search(r'-(\d+)-', chapter_id)
        number = meta.get('number') or (int(m.group(1)) if m else 0)
        lessons = []
        ldir = os.path.join(d, 'lessons')
        if os.path.isdir(ldir):
            for f in sorted(os.listdir(ldir)):
                if f.endswith('.json'):
                    lessons.append(json.load(open(os.path.join(ldir, f), encoding='utf-8')))
        topics = [[t['id'].split('.')[-1], plain(en(t.get('title')))] for t in meta.get('topics', [])]
        if not topics:
            topics = [[(l.get('topicId') or '').split('.')[-1], plain(en(l.get('title')))] for l in lessons]
        title = plain(en(meta.get('title'))) or name[5:].replace('-', ' ').capitalize()
        shorts, longs, problems = [], [], []
        for lesson in lessons:
            s, lg, p = lesson_parts(lesson)
            shorts += s
            longs += lg
            problems += p
        ch = {'id': chapter_id, 'n': number, 't': title, 'topics': topics, 'q': mcqs(d), 'sh': shorts, 'lg': longs,
              'pr': problems, 'f': formula_items(d, lessons)}
        subjects.setdefault((year, subject), []).append(ch)

    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        if f.endswith('.json.gz') or f == 'index.json':
            os.remove(os.path.join(args.out, f))
    index = {'v': 1, 'subjects': [], 'patterns': []}
    total = {'q': 0, 'sh': 0, 'lg': 0, 'pr': 0, 'f': 0}
    for (year, subject), chs in sorted(subjects.items()):
        chs.sort(key=lambda c: (c['n'], c['id']))
        file = f'puc{year}-{subject}.json.gz'
        body = json.dumps({'v': 1, 'year': year, 'subject': subject, 'chapters': chs}, ensure_ascii=False, separators=(',', ':'))
        with gzip.open(os.path.join(args.out, file), 'wt', encoding='utf-8', compresslevel=9) as g:
            g.write(body)
        index['subjects'].append({'year': year, 'subject': subject, 'title': subject_titles.get(subject) or subject.replace('_', ' ').title(), 'file': file,
                                  'chapters': [{'id': c['id'], 'n': c['n'], 't': c['t'], 'q': len(c['q'])} for c in chs]})
        for c in chs:
            for k in total:
                total[k] += len(c[k])
    if os.path.exists(patterns):
        for m in json.load(open(patterns, encoding='utf-8')).get('mocks', []):
            index['patterns'].append({'id': m['id'], 'exam': m.get('exam', ''), 't': en(m.get('title')), 'b': en(m.get('blurb')),
                                      'min': m.get('minutes', 0), 'mps': m.get('minutesPerSection'),
                                      'sec': [[s['subject'], s['count'], s['plus'], s['minus']] for s in m.get('sections', [])]})
    with open(os.path.join(args.out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(args.out, f)) for f in os.listdir(args.out) if f != 'README.txt')
    print(f"Class bank: {len(index['subjects'])} subjects, {sum(len(s['chapters']) for s in index['subjects'])} chapters, "
          f"{total['q']} MCQs, {total['sh']} short, {total['lg']} long, {total['pr']} problems, {total['f']} formulas, "
          f"{len(index['patterns'])} entrance patterns; {size / 1e6:.1f} MB in {args.out}")


if __name__ == '__main__':
    main()

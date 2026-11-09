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


# --- Written questions from the lessons -------------------------------------------------------
#
# Parts B–D of a mock test need questions that read as a teacher would set them for 2, 3 or 5
# marks. The lessons have no such bank, so this builds one, conservatively, from:
#   * the lesson objectives that are already exam instructions ("Define …", "State …",
#     "Distinguish between …", "Derive …"), rewritten only where a fixed rule applies
#     ("Tell X from Y" → "Distinguish between X and Y"; a trailing "and use …" skill is dropped);
#   * the recap's real questions ("Why is speed a derived quantity?") with their answers;
#   * the recap's homework that reads as an exam question (not "NCERT Exercise …", tables to
#     make, numericals without an answer);
#   * the worked examples (problems), sized 2, 3 or 5 marks by how much they ask.
# Anything else is left out: a part with too few questions is shortened on the paper rather
# than filled with flash-card stems ("Flux Φ = ?") or skills ("Use additivity …").
# The same checks run in the board (lib/classroom_edition/class_tools/paper.dart, examPromptProblem).

NEEDS_FIGURE = re.compile(r'\b(this code|the code|following code|this program|the program below|below|shown|figure|'
                          r'diagram|graph|table|the circuit|picture|image|the map|above)\b', re.I)
# A written prompt may ask for a diagram; it must not lean on one that is not printed.
REFERS_TO_FIGURE = re.compile(r'\b(shown|figure|fig\.|below|above|the circuit|this code|the code|following code|'
                              r'the given (?:table|graph|data)|in the quiz|the quiz|the lesson|this lesson)\b', re.I)
PRONOUN = re.compile(r'\b(it|its|their|them|they|these|this|those|each|such|here)\b', re.I)
WORDS = re.compile(r"[A-Za-z][A-Za-z'’-]+")

# Objective verb → marks (2, 3 or 5). Verbs not listed are skills, not exam questions.
TWO = {'define', 'state', 'name', 'list', 'give', 'write', 'mention', 'classify'}
THREE = {'distinguish', 'differentiate', 'contrast', 'compare', 'explain', 'outline', 'draw', 'sketch', 'justify',
         'show', 'trace'}
FIVE = {'derive', 'obtain', 'prove', 'establish', 'describe', 'discuss'}
# A longer answer for these, whatever the verb.
FIVE_WORDS = re.compile(r'\b(mechanism|working|construction|structure and|process of|life cycle|cycle|experiment|'
                        r'method|theory|model|pathway|stages|steps of|parts and)\b', re.I)
# Skills tacked on to an objective ("State and use …", "Define X and find it for …").
SKILL_TAIL = re.compile(r'\s+and\s+(use|apply|find|calculate|compute|solve|read|interpret|count|identify|recognise|'
                        r'recognize|predict|test|decide|choose|handle|work out)\b.*$', re.I)
SKILL_PAIR = re.compile(r'^(\w+)\s+and\s+(use|apply|read|interpret|identify|recognise|recognize)\s+', re.I)
QUESTION_START = re.compile(r'^(what|why|how|which|when|where|who|whom|whose|name|give|state|define|is|are|does|do|can|'
                            r'in what|mention|list|write|distinguish|differentiate|explain)\b', re.I)
ANSWER_IN = re.compile(r'\s*\((?:answer|ans)\s*[:=]\s*([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\.?\s*$', re.I)
ACTIVITY = re.compile(r'^(ncert|miscellaneous|make|copy|collect|count|prepare|revise|read|watch|try|visit|observe|'
                      r'look|find out|search|do |practise|practice)\b|\b(a table|a chart|a poster|a model|a project|'
                      r'exercise \d|ex\. ?\d|your (?:home|house|school|town|locality))\b', re.I)
NUMERIC = re.compile(r'^(find|calculate|compute|determine|evaluate|solve|how many|how much|what is the value|'
                     r'convert|balance|if |a |an |the |two |three |for |using |at what|insert|express|show that)', re.I)


def sentence(s):
    s = plain(s).strip()
    if not s:
        return s
    s = s[0].upper() + s[1:]
    return s if s[-1] in '.?!' else s + '.'


def exam_prompt_problem(q):
    """Why [q] cannot be printed as an exam question as it stands, or None."""
    t = q.strip()
    if re.search(r'(=|:|→|⇒|->)\s*\?', t):
        return 'flash-card stem'
    if len(WORDS.findall(t)) < 3:
        return 'too short'
    if '?' in t[:-1] and not re.search(r'\?\s+[A-Z(]', t):
        return 'question mark inside'
    if re.search(r'(^|\s)\(?A[.)]\s.*\s\(?B[.)]\s', t):
        return 'option letters'  # "A. … B. …" (a unit such as "5 A." alone is not an option)
    if re.match(r'^(explain|describe|discuss|answer|define|state)\s*:', t, re.I):
        return 'template glue'
    if re.search(r'\b(one or more options|which of the following|choose the correct|pick the|true or false)\b', t, re.I):
        return 'multiple-choice stem'
    if REFERS_TO_FIGURE.search(t):
        return 'refers to a missing figure'
    if not t[0].isupper() and not t[0].isdigit():
        return 'lower-case start'
    return None


def _tidy(s):
    s = re.sub(r'\s+', ' ', s).strip().rstrip('.').strip()
    return s


def objective_prompt(o, subject):
    """An objective as an exam question: (text, marks), or None when it is a skill, not a question."""
    s = _tidy(plain(o))
    if not s or ':' in s or '?' in s or PRONOUN.search(s) or REFERS_TO_FIGURE.search(s):
        return None
    s = SKILL_PAIR.sub(lambda m: m.group(1) + ' ', s)
    s = SKILL_TAIL.sub('', s)
    words = s.split()
    if len(words) < 3:
        return None
    verb = words[0].lower()
    rest = ' '.join(words[1:])
    if verb == 'tell':
        m = re.match(r'^(.+?) (?:from|and) (.+?) apart$', rest) or re.match(r'^(.+?) from (.+)$', rest)
        if not m:
            return None
        return f'Distinguish between {m.group(1)} and {m.group(2)}.', 3
    if verb in ('distinguish', 'differentiate', 'contrast'):
        if subject == 'maths':
            return None  # "Differentiate eˣ" is calculus, not a comparison
        rest = re.sub(r'^between\s+', '', rest)
        m = re.match(r'^(.+?) from (.+)$', rest)
        rest = f'{m.group(1)} and {m.group(2)}' if m else rest
        if ' and ' not in rest:
            return None
        return f'Distinguish between {rest}.', 3
    if verb == 'explain' and re.match(r'^that\b', rest):
        return None
    if verb == 'show' and not re.match(r'^(that|how)\b', rest):
        return None
    if verb == 'show' and rest.startswith('how'):
        verb, rest = 'explain', rest
        s = 'Explain ' + rest
    if verb == 'draw':
        if not re.search(r'\b(diagram|structure|projections?|graph|curve|circuit|set-up|apparatus)\b', rest, re.I):
            return None
    if verb == 'write' and ('=' in rest or not re.match(r'^(the|a|an|two|three|any)\b', rest)):
        return None
    if verb == 'give' and not re.match(r'^(the|two|three|an?|examples?|one)\b', rest):
        return None
    if verb in ('list', 'give', 'name', 'state', 'mention') and re.match(r'^(applications?|uses?|advantages?|features?|examples?|properties|functions?|types?)\b', rest) and ' of ' not in rest:
        return None  # "List applications in medicine": of what?
    if verb == 'describe' and re.match(r'^(events?|a|an)\b', rest) and not FIVE_WORDS.search(rest):
        return None
    if subject == 'maths' and verb not in ('define', 'state', 'derive', 'prove'):
        return None  # Maths papers ask problems; its other objectives are skills
    if subject == 'maths' and verb == 'prove' and re.search(r'\b(by induction|a function|results|formulas|inequalities)\b', rest):
        return None
    if verb in TWO:
        marks = 2
    elif verb in THREE:
        marks = 5 if FIVE_WORDS.search(rest) and verb in ('explain', 'trace', 'outline') else 3
    elif verb in FIVE:
        marks = 5 if verb in ('derive', 'obtain', 'prove', 'establish', 'discuss') or FIVE_WORDS.search(rest) else 3
    else:
        return None
    text = sentence(s[0].upper() + s[1:])
    return (text, marks) if exam_prompt_problem(text) is None else None


def problem_size(q, steps, subject):
    """2, 3 or 5: how many marks a worked problem is worth on a PUC paper."""
    numbers = len(re.findall(r'\d+(?:\.\d+)?', q))
    parts = len(re.findall(r'\(([a-e]|i{1,3}|iv)\)', q))
    asks = len(re.findall(r'\b(find|calculate|determine|what|how|also|and the|show that|hence)\b', q, re.I))
    if subject == 'maths':
        # Board maths: 2 marks for a one-step result, 5 for a full method (several parts, or long).
        if parts >= 2 or len(q) >= 95 or len(steps) >= 4:
            return 5
        return 2 if len(q) < 55 and len(steps) <= 2 else 3
    if parts >= 3 or (len(q) >= 120 and numbers >= 2 and (asks >= 2 or parts >= 2)) or len(q) >= 170:
        return 5
    if len(q) < 75 and len(steps) <= 2 and parts == 0:
        return 2
    return 3


def homework_item(h, subject, tp, key):
    """A recap homework line as ('w', question, marks, answer) or ('p', question, answer, size), or None."""
    s = plain(h).strip()
    if not s or ACTIVITY.search(s) or REFERS_TO_FIGURE.search(re.sub(r'\(NCERT[^)]*\)', '', s)):
        return None
    s = re.sub(r'\s*\(NCERT[^)]*\)', '', s)
    s = re.sub(r'\s*(?:Answer|Write|Explain)? ?in (?:one|two|three|four|five|\d+) (?:lines?|sentences?|words?|points?)\.?|\s*Write (?:one|two|three|four|five|\d+) (?:lines?|sentences?|points?)\.?', '', s, flags=re.I).strip()
    answer = ''
    m = ANSWER_IN.search(s)
    if m:
        answer, s = m.group(1).strip(), s[:m.start()].strip()
    s = sentence(s)
    if exam_prompt_problem(s) or PRONOUN.search(re.sub(r'\b(each|such|this|these)\b', '', s, flags=re.I)) and not answer:
        return None
    first = s.split()[0].lower()
    numeric = bool(re.search(r'\d', s)) and (NUMERIC.match(s) or re.search(r'\b(find|calculate|how many|how much)\b', s, re.I))
    if subject == 'maths' or numeric:
        if not answer:
            return None  # a problem needs its answer for the key
        return 'p', s, answer, problem_size(s, [], subject)
    if first in ('why', 'what', 'name', 'give', 'list', 'write', 'state', 'define', 'mention', 'which', 'how') or s.endswith('?'):
        return 'w', s, 2 if len(s) < 110 else 3, answer or key
    if first in ('explain', 'distinguish', 'differentiate', 'compare', 'draw', 'sketch', 'show', 'trace', 'classify', 'predict', 'arrange', 'outline'):
        if first == 'differentiate' and not re.match(r'^differentiate between\b', s, re.I):
            return None
        return 'w', s, 3, answer or key
    if first in ('describe', 'derive', 'discuss', 'prove'):
        return 'w', s, 5, answer or key
    return None


def _overlap(a, b):
    wa = {w.lower() for w in WORDS.findall(a) if len(w) > 3}
    wb = {w.lower() for w in WORDS.findall(b) if len(w) > 3}
    return len(wa & wb)


def lesson_parts(lesson, subject='physics'):
    """A lesson's written questions by marks (2, 3, 5) and its problems."""
    tp = (lesson.get('topicId') or '').split('.')[-1]
    objectives, recap, concepts, homework = [], [], [], []
    written = {2: [], 3: [], 5: []}
    problems = []
    for b in lesson.get('blocks', []):
        t = b.get('type')
        if t == 'intro':
            objectives += [en(o) for o in b.get('objectives', []) if en(o)]
        elif t == 'concept':
            pts = [plain(en(p)) for p in b.get('points', []) if en(p)]
            concepts.append((plain(en(b.get('title'))), [p for p in pts if '?' not in p]))
        elif t == 'recap':
            pts = [plain(en(p)) for p in b.get('points', [])]
            ans = [plain(en(a)) for a in b.get('answers', [])]
            homework += [en(h) for h in b.get('homework', []) if en(h)]
            for k, p in enumerate(pts):
                a = ans[k] if k < len(ans) else ''
                if p.endswith('?') and a:
                    if exam_prompt_problem(p) is None and QUESTION_START.match(p):
                        written[2].append({'tp': tp, 'q': p, 'a': a})
                        recap.append(a)
                    else:
                        # A flash card ("Flux Φ = ?") is not a question, but it is a good key line.
                        stem = re.sub(r'\s*[:=→]?\s*\?$', '', p).strip()
                        sep = ' = ' if p.rstrip('?').rstrip().endswith('=') else (' → ' if '→' in p[-4:] else ': ')
                        recap.append(sentence(stem + sep + a.rstrip('.')))
                elif p and '?' not in p:
                    recap.append(p)
        elif t == 'example':
            q, a = plain(en(b.get('problem'))), plain(en(b.get('answer')))
            if q and a and not NEEDS_FIGURE.search(q) and len(q) < 420 and exam_prompt_problem(q) is None:
                steps = [x for x in (plain(en(x)) for x in b.get('steps', [])[:8]) if x]
                problems.append({'tp': tp, 'q': q, 'a': a, 'st': steps, 'm': problem_size(q, steps, subject)})

    def key(q):
        best = max(concepts, key=lambda c: _overlap(q, c[0] + ' ' + ' '.join(c[1])), default=None)
        if best and _overlap(q, best[0] + ' ' + ' '.join(best[1])) >= 1 and best[1]:
            return ' '.join(p.rstrip('.') + '.' for p in best[1][:4])
        return ' '.join(recap[:3])

    for o in objectives:
        r = objective_prompt(o, subject)
        if r:
            written[r[1]].append({'tp': tp, 'q': r[0], 'a': key(r[0])})
    for h in homework:
        r = homework_item(h, subject, tp, '')
        if not r:
            continue
        if r[0] == 'p':
            problems.append({'tp': tp, 'q': r[1], 'a': r[2], 'st': [], 'm': r[3]})
        else:
            written[r[2]].append({'tp': tp, 'q': r[1], 'a': r[3] or key(r[1])})
    return written, problems


def _norm(q):
    return re.sub(r'[^a-z0-9]+', ' ', q.lower()).strip()


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
        # The year comes from the chapter's own id ("puc2-physics-01-…"), checked against the
        # syllabus and the pack folder: a chapter filed under the wrong year is an error, not a guess.
        years = {int(x[3]) for x in (chapter_id, name, meta.get('year') or chapter_id) if re.match(r'puc[12]', x or '')}
        if len(years) != 1:
            sys.exit(f'{name}: the chapter id, pack folder and syllabus disagree on the year ({chapter_id}, {meta.get("year")})')
        year = years.pop()
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
        chapter_mcqs = mcqs(d)
        written = {2: [], 3: [], 5: []}
        problems, seen = [], set()
        for lesson in lessons:
            w, p = lesson_parts(lesson, subject)
            for m in written:
                for x in w[m]:
                    if _norm(x['q']) not in seen:
                        seen.add(_norm(x['q']))
                        written[m].append(x)
            for x in p:
                if _norm(x['q']) not in seen:
                    seen.add(_norm(x['q']))
                    problems.append(x)
        # A question that is also one of the chapter's MCQ stems stays in Part A only.
        stems = {_norm(q['s']) for q in chapter_mcqs}
        problems = [x for x in problems if _norm(x['q']) not in stems]
        for m in written:
            written[m] = [x for x in written[m] if _norm(x['q']) not in stems]
        # 'sh' 2 marks, 'md' 3 marks, 'lg' 5 marks (written); 'pr' problems with their size 'm'.
        ch = {'id': chapter_id, 'n': number, 't': title, 'topics': topics, 'q': chapter_mcqs, 'sh': written[2], 'md': written[3],
              'lg': [{'tp': x['tp'], 'q': x['q'], 'pts': [x['a']] if x['a'] else []} for x in written[5]],
              'pr': problems, 'f': formula_items(d, lessons)}
        subjects.setdefault((year, subject), []).append(ch)

    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        if f.endswith('.json.gz') or f == 'index.json':
            os.remove(os.path.join(args.out, f))
    index = {'v': 1, 'subjects': [], 'patterns': []}
    total = {'q': 0, 'sh': 0, 'md': 0, 'lg': 0, 'pr': 0, 'f': 0}
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
          f"{total['q']} MCQs, {total['sh']} two-mark, {total['md']} three-mark, {total['lg']} five-mark, {total['pr']} problems, {total['f']} formulas, "
          f"{len(index['patterns'])} entrance patterns; {size / 1e6:.1f} MB in {args.out}")


if __name__ == '__main__':
    main()

// Mock-test papers from the real Class tools bank (built locally by tool/build_class_bank.py;
// never committed): every subject and year, every chapter, the chapter test, unit test and
// annual paper with several seeds. Each paper must read like a teacher's: no flash-card stems,
// no multiple-choice stems or options outside Part A, no "Explain: …" glue, no question asked
// twice, the board's choice ("Answer any FIVE …") and mark totals that add up. Skipped when
// the bank is not built.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/class_tools/paper.dart';

const _dir = 'assets/private/class_tools';
final _bank = File('$_dir/index.json').existsSync();

/// Awkward patterns a written prompt (Parts B–E) must never show, beyond [examPromptProblem].
final _awkward = <String, RegExp>{
  'Explain: glue': RegExp(r'^(Explain|Describe|Discuss|Answer|Define|State|Write)\s*:', caseSensitive: false),
  'flash card': RegExp(r'(=|:|→|⇒)\s*\?'),
  '? then more text': RegExp(r'\?\s+[a-z]'),
  'MCQ options': RegExp(r'(^|\s)\(?A[.)]\s.*\s\(?B[.)]\s'),
  'MCQ stem': RegExp(r'\b(which of the following|choose the correct|one or more options|the correct option)\b', caseSensitive: false),
  'a skill, not a question': RegExp(r'^(Use|Apply|Relate|Recognise|Recognize|Identify|Tell|Recall|Know|Count|Read|Handle|Decide|See)\b'),
  'ends in a blank': RegExp(r'_{3,}\s*\.?$'),
};

const _words = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

List<String> checkPaper(Paper p, PaperPattern pattern, Set<String> mcqStems) {
  final errors = <String>[];
  final seen = <String>{};
  for (final s in p.sections) {
    final part = pattern.parts.firstWhere((x) => x.label == s.part.label);
    var total = 0.0;
    for (final g in s.groups) {
      total += g.attempt * g.marks;
      if (!part.slots.contains(g.slot)) errors.add('${s.part.label}: a group not in the pattern');
      if (g.items.length > g.slot.count) errors.add('${s.part.label}: ${g.items.length} questions for ${g.slot.count}');
      if (g.attempt < 1 || g.attempt > g.items.length) errors.add('${s.part.label}: answer ${g.attempt} of ${g.items.length}');
      if (g.items.length - g.attempt > g.slot.count - g.slot.answered) errors.add('${s.part.label}: more choice than the pattern');
      final i = g.instruction;
      if (g.slot.kind == ItemKind.mcq) {
        if (!i.startsWith('Choose the correct answer')) errors.add('${s.part.label}: $i');
      } else if (g.attempt < g.items.length) {
        if (i != 'Answer any ${_words[g.attempt]} of the following ${g.slot.kind == ItemKind.problem ? 'problems' : 'questions'}.') errors.add('${s.part.label}: "$i" for ${g.attempt} of ${g.items.length}');
      } else if (!i.startsWith('Answer ') || i.contains('any')) {
        errors.add('${s.part.label}: "$i" with no choice');
      }
      for (final it in g.items) {
        if (it.marks != g.slot.marks) errors.add('${s.part.label}: ${it.marks} marks in a ${g.slot.marks}-mark group');
        if (!seen.add(it.kind == ItemKind.mcq ? it.id : normQuestion(it.text))) errors.add('asked twice: ${it.text}');
        if (it.kind == ItemKind.mcq) {
          if (it.options.length < 2 || it.answer.isEmpty) errors.add('MCQ without options or key: ${it.text}');
          continue;
        }
        if (it.options.isNotEmpty) errors.add('options on a written question: ${it.text}');
        if (mcqStems.contains(normQuestion(it.text))) errors.add('an MCQ stem as a written question: ${it.text}');
        final why = examPromptProblem(it.text);
        if (why != null) errors.add('$why: ${it.text}');
        for (final e in _awkward.entries) {
          // A worked problem may start "Identify the mode of entry: (a) … (b) …"; a written
          // question may not start with a skill.
          if (e.key.startsWith('a skill') && it.kind == ItemKind.problem) continue;
          if (e.value.hasMatch(it.text)) errors.add('${e.key}: ${it.text}');
        }
        if (it.kind == ItemKind.problem && it.answer.trim().isEmpty) errors.add('a problem without its answer: ${it.text}');
        // The part's size: a 2-mark part never takes a long question, nor a 5-mark part a short one.
        if (it.kind == ItemKind.short && g.slot.marks != 2) errors.add('a 2-mark question for ${g.slot.marks} marks: ${it.text}');
      }
    }
    if (total != s.total) errors.add('${s.part.label}: total ${s.total} is not $total');
    if (s.total > part.total) errors.add('${s.part.label}: ${s.total} marks for a ${part.total}-mark part');
  }
  final sum = p.sections.fold<num>(0, (a, s) => a + s.total);
  if (p.maxMarks != sum) errors.add('max marks ${p.maxMarks} is not $sum');
  if (p.maxMarks > pattern.maxMarks) errors.add('max marks ${p.maxMarks} over ${pattern.maxMarks}');
  return errors;
}

void main() {
  test('mock papers for every subject read like a teacher\'s and add up', () {
    final index = jsonDecode(File('$_dir/index.json').readAsStringSync()) as Map<String, dynamic>;
    var papers = 0, written = 0;
    final errors = <String>[];
    final fullAnnual = <String>[];
    for (final e in (index['subjects'] as List).cast<Map>()) {
      final subject = '${e['subject']}', year = e['year'] as int;
      final json = jsonDecode(utf8.decode(gzip.decode(File('$_dir/${e['file']}').readAsBytesSync()))) as Map<String, dynamic>;
      final chapters = [for (final c in json['chapters'] as List) BankChapter.fromJson((c as Map).cast())];
      final stems = {for (final c in chapters) for (final q in c.questions) normQuestion(q.stem)};
      final [chapterTest, unitTest, annual, _] = pucPatternsFor(subject);
      void check(Paper p, PaperPattern pattern, String what) {
        papers++;
        written += p.items.where((i) => i.kind != ItemKind.mcq).length;
        for (final x in checkPaper(p, pattern, stems)) {
          errors.add('puc$year $subject $what: $x');
        }
      }

      for (var seed = 0; seed < 3; seed++) {
        for (final (i, c) in chapters.indexed) {
          check(buildPaper(chapters: [c], pattern: chapterTest, title: 'T', seed: seed, subject: subject), chapterTest, '${c.title} chapter test');
          if (i + 1 < chapters.length) {
            check(buildPaper(chapters: [c, chapters[i + 1]], pattern: unitTest, title: 'T', seed: seed, subject: subject), unitTest, '${c.title} unit test');
          }
        }
        final p = buildPaper(chapters: chapters, pattern: annual, title: 'T', seed: seed, subject: subject);
        check(p, annual, 'annual');
        if (seed == 0 && const {'physics', 'chemistry', 'maths', 'biology'}.contains(subject) && p.maxMarks < annual.maxMarks * 0.9) {
          fullAnnual.add('puc$year $subject: ${p.maxMarks} of ${annual.maxMarks}');
        }
      }
    }
    // ignore: avoid_print
    print('$papers papers, $written written questions checked');
    expect(errors.take(40).toList(), isEmpty, reason: '${errors.length} problems');
    expect(fullAnnual, isEmpty, reason: 'the whole syllabus fills (nearly all of) the annual paper; the rest is left out, not padded');
  }, skip: _bank ? false : 'the private Class tools bank is not built (tool/build_class_bank.py)');
}

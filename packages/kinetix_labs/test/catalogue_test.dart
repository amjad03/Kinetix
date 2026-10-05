import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

/// The catalogue's integrity: every lab has all its text in English, Hindi
/// and Kannada, a bench that exists, valid levels, and draws and reads at
/// every setting.
void main() {
  final labs = LabLibrary.instance.labs;

  test('the library loads, ids are unique, and lesson links still resolve', () {
    expect(labs.length, greaterThanOrEqualTo(36));
    final ids = [for (final l in labs) l.id];
    expect(ids.toSet().length, ids.length);
    // Ids lesson content already links (TopicResource kind 'lab') and the prototype's ids.
    for (final id in [
      'lab.ohms-law', 'lab.lens-mirror', 'lab.pendulum', 'lab.break-even', 'lab.graph-plotter', //
      'ohms-law', 'resistors', 'glass-slab', 'lens-mirror', 'pendulum', 'buoyancy', 'indicators', 'displacement', 'microscope',
      'probability', 'conductors', 'magnets', 'shadows', 'prism', 'heating-curve', 'reactions', 'starch-test', 'triangle-angles',
      'separation', 'rusting', 'germination', 'osmosis', 'pinhole', 'mirror-reflection', 'pythagoras', 'circle-pi', 'lever',
      'electromagnet', 'calorimetry', 'sonometer', 'transpiration',
    ]) {
      expect(LabCatalogue.byId(id), isNotNull, reason: id);
    }
    expect(LabCatalogue.entries.length, labs.length);
  });

  group('every lab', () {
    for (final l in labs) {
      test('${l.id}: complete in three languages, valid bench and levels', () {
        void words(Words w, String what) {
          for (final lang in ['en', 'hi', 'kn']) {
            final s = w.byLang[lang];
            expect(s?.trim(), isNotEmpty, reason: '${l.id}: $what ($lang)');
            expect(s!.contains('�'), isFalse, reason: '${l.id}: $what ($lang) has a broken character');
          }
          // Hindi in Devanagari and Kannada in Kannada script (a bare number or formula is the same in all three).
          if (!RegExp('[A-Za-z]{3,}').hasMatch(w.byLang['en']!)) return;
          expect(RegExp('[ऀ-ॿ]').hasMatch(w.byLang['hi']!), isTrue, reason: '${l.id}: $what (hi)');
          expect(RegExp('[ಀ-೿]').hasMatch(w.byLang['kn']!), isTrue, reason: '${l.id}: $what (kn)');
        }

        words(l.title, 'title');
        words(l.summary, 'summary');
        words(l.aim, 'aim');
        words(l.principle, 'principle');
        words(l.conclusion, 'conclusion');
        expect(l.apparatus.length, greaterThanOrEqualTo(3), reason: '${l.id}: apparatus');
        expect(l.steps.length, greaterThanOrEqualTo(4), reason: '${l.id}: steps');
        expect(l.precautions.length, greaterThanOrEqualTo(2), reason: '${l.id}: precautions');
        expect(l.viva.length, greaterThanOrEqualTo(3), reason: '${l.id}: viva');
        for (final (k, list) in [('apparatus', l.apparatus), ('steps', l.steps), ('precautions', l.precautions)]) {
          for (var i = 0; i < list.length; i++) {
            words(list[i], '$k ${i + 1}');
          }
        }
        for (final v in l.viva) {
          words(v.q, 'viva question');
          words(v.a, 'viva answer');
        }
        expect(l.levels, isNotEmpty, reason: '${l.id}: levels');
        expect(l.keywords, isNotEmpty, reason: '${l.id}: keywords');
        expect(l.reviewed, isFalse, reason: '${l.id}: no lab is reviewed until a subject teacher checks it');
        expect(['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Electronics', 'Forensics'], contains(l.subject));
        final e = LabCatalogue.byId(l.id)!;
        if (l.bench == 'sim') {
          expect(e.isBench, isFalse);
        } else {
          expect(labBenches[l.bench], isNotNull, reason: '${l.id}: bench ${l.bench}');
          expect(e.isBench, isTrue);
        }
      });
    }
  });

  group('every bench lab draws and reads at every setting', () {
    for (final l in labs.where((l) => labBenches.containsKey(l.bench))) {
      test(l.id, () {
        final bench = labBenches[l.bench]!;
        final start = {...bench.defaults, ...l.setup};
        final preview = {...bench.preview, ...l.setup};
        final variants = <LabParams>[start, preview];
        for (final c in bench.controls(start)) {
          switch (c) {
            case LabChoice ch:
              for (final (v, _) in ch.options) {
                variants.add(bench.act('set:${ch.key}', {...preview, ch.key: v}));
              }
            case LabSlider s:
              variants.add({...preview, s.key: s.min});
              variants.add({...preview, s.key: s.max});
            case LabToggle g:
              variants.add({...preview, g.key: !pBool(preview, g.key)});
            case LabAction a:
              variants.add(bench.act(a.key, preview));
          }
          // Every control reads a setting the bench starts with.
          if (c is! LabAction) expect(start.containsKey(c.key), isTrue, reason: '${l.id}: ${c.key}');
        }
        for (final size in const [Size(320, 240), Size(1300, 640)]) {
          for (final p in variants) {
            final rec = ui.PictureRecorder();
            bench.paint(Canvas(rec), size, p, 1.3);
            rec.endRecording().dispose();
            bench.live(p);
            final r = bench.read(p);
            expect(r.row != null || (r.why?.isNotEmpty ?? false), isTrue);
            if (r.row != null) expect(r.row!.length, bench.columns.length, reason: '${l.id}: row length');
          }
        }
      });
    }
  });

  test('filter by domain, level, subject and words', () {
    final physics = LabCatalogue.filter(domains: {LabDomain.physics});
    expect(physics, isNotEmpty);
    expect(physics.every((e) => e.domain == LabDomain.physics), isTrue);
    final ten = LabCatalogue.filter(levels: {LabLevel.class10});
    expect(ten.map((e) => e.id), containsAll(['ohms-law', 'lab.ohms-law']));
    expect(ten.every((e) => e.labLevels.contains(LabLevel.class10)), isTrue);
    expect(LabCatalogue.filter(query: 'ohm').map((e) => e.id), contains('ohms-law'));
    // Hindi and Kannada titles are searchable too.
    expect(LabCatalogue.filter(query: 'ओम').map((e) => e.id), contains('ohms-law'));
    expect(LabCatalogue.filter(query: 'zzzz-no-such-lab'), isEmpty);
    expect(LabCatalogue.forLesson('Electricity').map((e) => e.id), contains('ohms-law'));
  });

  test('levels and domains read from their codes', () {
    expect(LabLevel.fromCode('lkg'), LabLevel.lkg);
    expect(LabLevel.fromCode(10), LabLevel.class10);
    expect(LabLevel.fromCode('ug')!.isDegree, isTrue);
    expect(LabLevel.class12.schoolClass, 12);
    expect(LabLevel.fromCode('13'), isNull);
    expect(LabDomain.fromName('forensics'), LabDomain.forensics);
  });

  test('every interface string is translated into Hindi and Kannada', () {
    final lit = RegExp(r"""\btrn?\(\s*(?:[^,'"]+,\s*)?'((?:[^'\\]|\\.)*)'""");
    final missing = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.contains('strings_') || f.path.endsWith('.g.dart')) continue;
      for (final m in lit.allMatches(f.readAsStringSync())) {
        final key = m.group(1)!.replaceAll(r"\'", "'").replaceAll(r'\$', r'$');
        currentLabLang = LabLang.hi;
        final hi = tr(key);
        currentLabLang = LabLang.kn;
        final kn = tr(key);
        currentLabLang = LabLang.en;
        final words = key.replaceAll(RegExp(r'\{\w+\}'), '');
        // Acronyms (LED, CRO) read the same in every language.
        if (RegExp('[A-Za-z]{3,}').hasMatch(words) && words != words.toUpperCase() && (hi == key || kn == key)) missing.add('${f.path}: $key');
      }
    }
    expect(missing, isEmpty);
  });

  test('a report exports its readings as CSV', () {
    final r = LabReport.snapshot('ohms-law')!;
    final b = r.bench;
    final rows = [
      for (final c in [1, 2, 3]) b.read({...b.defaults, 'cells': c, 'on': true}).row!,
    ];
    final csv = LabReport(lab: r.lab, bench: b, params: r.params, rows: rows).toCsv();
    final lines = csv.trim().split('\r\n');
    expect(lines.length, 4);
    expect(lines.first, startsWith('#,'));
    expect(lines[1], startsWith('1,'));
    expect(LabReport.snapshot('no-such-lab'), isNull);
  });

  testWidgets('a report renders a PNG for the board', (t) async {
    final png = await t.runAsync(() => LabReport.snapshot('glass-slab')!.toPng(width: 800));
    expect(png!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
  });

  test('a line fit gives slope, intercept and their uncertainties', () {
    final f = LinearFit.of([1, 2, 3, 4], [3, 5, 7, 9])!;
    expect(f.slope, closeTo(2, 1e-12));
    expect(f.intercept, closeTo(1, 1e-12));
    expect(f.slopeSe, closeTo(0, 1e-12));
    final g = LinearFit.of([1, 2, 3, 4, 5], [2.1, 3.9, 6.2, 7.8, 10.1])!;
    expect(g.slope, closeTo(1.99, 0.01));
    expect(g.slopeSe, greaterThan(0));
    expect(g.r2, greaterThan(0.99));
    final m = meanSe([9.7, 9.9, 9.8, 9.8]);
    expect(m.mean, closeTo(9.8, 1e-9));
    expect(pm(9.8123, 0.043), '9.81 ± 0.04');
    expect(pm(1234.5, 16), '1235 ± 16');
  });
}

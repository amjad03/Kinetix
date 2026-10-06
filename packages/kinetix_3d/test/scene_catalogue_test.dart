import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

final _devanagari = RegExp('[ऀ-ॿ]');
final _kannada = RegExp('[ಀ-೿]');

/// The narrated scenes' catalogue (written from tool/models/src/scenes by write_scenes.mjs):
/// every step has a caption in English, Hindi and Kannada, names parts that exist, and the
/// timeline adds up.
void main() {
  // [script]: written in Devanagari and Kannada (names like "ATP" stay as they are).
  void three(LocalText t, String what, {bool script = true}) {
    expect(t.complete, isTrue, reason: '$what: en, hi and kn');
    if (script || t.of('hi') != t.en) expect(t.of('hi'), matches(_devanagari), reason: '$what in Hindi');
    if (script || t.of('kn') != t.en) expect(t.of('kn'), matches(_kannada), reason: '$what in Kannada');
    for (final l in viewerLanguages) {
      expect(t.of(l).contains('�'), isFalse, reason: what);
      expect(t.of(l).trim(), t.of(l), reason: '$what has no stray spaces');
    }
  }

  test('ids are unique and the first six are there', () {
    final ids = [for (final s in ProcessScene.all) s.id];
    expect(ids.toSet().length, ids.length);
    expect(ids, contains('photosynthesis'));
    expect(ProcessScene.byId('photosynthesis'), same(ProcessScene.all.first));
    expect(ProcessScene.byId('nothing'), isNull);
    expect(ProcessScene.byId(null), isNull);
  });

  for (final sc in ProcessScene.all) {
    group(sc.id, () {
      test('titles, parts and groups in three languages', () {
        three(sc.title, 'title');
        three(sc.summary, 'summary');
        expect(['Biology', 'Geography', 'Space'], contains(sc.subject));
        expect(sc.keywords, isNotEmpty);
        expect(sc.classes, isNotEmpty);
        final groups = {for (final g in sc.groups) g.id};
        for (final g in sc.groups) {
          three(g.name, 'group ${g.id}');
        }
        final ids = <String>{};
        for (final p in sc.parts) {
          expect(ids.add(p.id), isTrue, reason: 'part ${p.id} twice');
          three(p.name, 'part ${p.id} name', script: false);
          if (p.info.byLang.isNotEmpty) three(p.info, 'part ${p.id} note');
          expect(groups, contains(p.group), reason: 'part ${p.id} group');
          expect(p.color, matches(RegExp(r'^#[0-9a-fA-F]{6}$')));
        }
      });

      test('steps: captions in three languages, real parts, a timeline that adds up', () {
        expect(sc.steps.length, greaterThanOrEqualTo(5));
        final parts = {for (final p in sc.parts) p.id};
        final stepIds = <String>{};
        for (final (i, st) in sc.steps.indexed) {
          expect(stepIds.add(st.id), isTrue, reason: 'step ${st.id} twice');
          three(st.title, 'step ${i + 1} title');
          three(st.caption, 'step ${i + 1} caption');
          expect(st.caption.en.length, inInclusiveRange(30, 320), reason: 'step ${i + 1}: a caption is a sentence or three');
          expect(st.stage, isNotEmpty);
          expect(st.seconds, inInclusiveRange(4, 30));
          for (final id in [...st.highlight, ...st.labels]) {
            expect(parts, contains(id), reason: 'step ${st.id} names $id');
          }
          expect(st.spoken('hi'), contains(st.caption.of('hi')));
          // Reading the step aloud takes about as long as the step lasts at 1×.
          expect(st.caption.en.split(' ').length / 2.6, lessThan(st.seconds + 2), reason: 'step ${st.id} is too short to read');
        }
        expect(sc.startOf(0), 0);
        expect(sc.startOf(sc.steps.length), closeTo(sc.seconds, 1e-9));
        for (var i = 0; i < sc.steps.length; i++) {
          expect(sc.stepAt(sc.startOf(i) + 0.01), i);
        }
        expect(sc.stepAt(sc.seconds + 5), sc.steps.length - 1);
      });

      test('as a model for the viewer\'s controls', () {
        final m = sc.toManifest();
        expect(m.id, sc.id);
        expect(m.parts, hasLength(sc.parts.length));
        expect(m.canTakeApart, isFalse);
        expect(m.animations, isEmpty);
        expect(sc.matches(sc.title.en), isTrue);
        expect(sc.matches(sc.keywords.first), isTrue);
        expect(sc.thumbAsset, endsWith('thumbs/scene_${sc.id}.jpg'));
      });
    });
  }

  test('the catalogue is written from the scene scripts', () {
    // Every scene has its script in tool/models/src/scenes and is registered there.
    final index = File('tool/models/src/scenes/index.js').readAsStringSync();
    for (final sc in ProcessScene.all) {
      final file = File('tool/models/src/scenes/${sc.id}.js');
      expect(file.existsSync(), isTrue, reason: '${sc.id}.js');
      expect(index, contains("'./${sc.id}.js'"));
      final src = file.readAsStringSync();
      for (final st in sc.steps) {
        expect(src, contains("id: '${st.id}'"), reason: '${sc.id}: step ${st.id} in the script');
        expect(src, contains(st.caption.en.substring(0, 30)), reason: '${sc.id}: caption of ${st.id}');
      }
    }
  });

  test('the shipped page knows every scene', () {
    final bundle = File('assets/viewer3d/viewer.js').readAsStringSync();
    expect(bundle, contains('scene:'), reason: 'run node tool/models/build_viewer.mjs');
    for (final sc in ProcessScene.all) {
      expect(bundle, contains(sc.steps.first.caption.en.substring(0, 40)), reason: '${sc.id} is in the bundle');
    }
  });
}

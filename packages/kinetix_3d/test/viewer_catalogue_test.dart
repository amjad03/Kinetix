import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// Checks every viewer model against its files: names and notes in all three languages,
/// the GLB, manifest and picture present, references resolved, credits kept.
const _assets = 'assets/viewer3d';

Map<String, dynamic> _json(String path) => jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

void _complete(Object? words, String where) {
  expect(words, isA<Map<String, dynamic>>(), reason: where);
  final m = words as Map<String, dynamic>;
  for (final lang in viewerLanguages) {
    expect((m[lang] as String? ?? '').trim(), isNotEmpty, reason: '$where has no $lang');
  }
}

void main() {
  final index = _json('$_assets/models/index.json')['models'] as List;

  test('the Dart catalogue data matches the model index', () {
    expect([for (final m in ViewerModelInfo.all) m.id], [for (final m in index) m['id']]);
    for (final m in index) {
      final info = ViewerModelInfo.byId(m['id'] as String)!;
      expect(info.subject, m['subject']);
      for (final lang in viewerLanguages) {
        expect(info.title.of(lang), m['title'][lang], reason: '${info.id} $lang');
      }
      expect(info.classes, m['classes']);
    }
  });

  test('every model has its manifest, geometry and picture', () {
    for (final m in ViewerModelInfo.all) {
      final manifest = File('$_assets/models/${m.id}.json');
      expect(manifest.existsSync(), isTrue, reason: m.id);
      final j = _json(manifest.path);
      expect(j['id'], m.id);
      expect(File('$_assets/models/${j['file']}').existsSync(), isTrue, reason: '${m.id}: ${j['file']}');
      expect(File('$_assets/thumbs/${m.id}.jpg').existsSync(), isTrue, reason: '${m.id} picture');
      expect(m.classes, isNotEmpty, reason: m.id);
      expect(m.keywords, isNotEmpty, reason: m.id);
      expect(['Biology', 'Physics', 'Chemistry', 'Geography', 'Space', 'Maths'], contains(m.subject), reason: m.id);
    }
  });

  test('every name, note, group, view, cut and step is in English, Hindi and Kannada', () {
    for (final m in ViewerModelInfo.all) {
      final j = _json('$_assets/models/${m.id}.json');
      _complete(j['title'], '${m.id} title');
      _complete(j['summary'], '${m.id} summary');
      for (final g in j['groups'] as List) {
        _complete(g['name'], '${m.id} group ${g['id']}');
      }
      for (final p in j['parts'] as List) {
        _complete(p['name'], '${m.id} part ${p['id']}');
        _complete(p['info'], '${m.id} part ${p['id']} note');
      }
      for (final v in j['views'] as List) {
        _complete(v['name'], '${m.id} view ${v['id']}');
      }
      for (final s in j['slices'] as List) {
        _complete(s['name'], '${m.id} cut ${s['id']}');
      }
      for (final v in (j['variants'] as List? ?? const [])) {
        _complete(v['name'], '${m.id} version ${v['id']}');
      }
      for (final a in j['animations'] as List) {
        _complete(a['name'], '${m.id} animation ${a['id']}');
        for (final (i, s) in (a['steps'] as List? ?? const []).indexed) {
          _complete(s['text'], '${m.id} ${a['id']} step ${i + 1}');
        }
      }
    }
  });

  test('every part belongs to a group and an existing version, and ids are unique', () {
    for (final m in ViewerModelInfo.all) {
      final model = ViewerManifest.fromJson(_json('$_assets/models/${m.id}.json'));
      final groups = {for (final g in model.groups) g.id};
      final variants = {for (final v in model.variants) v.id};
      final ids = [for (final p in model.parts) p.id];
      expect(ids.toSet(), hasLength(ids.length), reason: m.id);
      expect(model.parts, isNotEmpty, reason: m.id);
      expect(model.views, isNotEmpty, reason: m.id);
      for (final p in model.parts) {
        expect(groups, contains(p.group), reason: '${m.id}/${p.id}');
        if (p.variant != null) expect(variants, contains(p.variant), reason: '${m.id}/${p.id}');
      }
      // Every version shows something.
      for (final v in variants) {
        expect(model.parts.any((p) => p.variant == v), isTrue, reason: '${m.id} version $v');
      }
      for (final s in model.slices) {
        if (s.view != null) expect(model.view(s.view), isNotNull, reason: '${m.id} cut ${s.id}');
      }
      expect(m.variants, [for (final v in model.variants) v.id], reason: m.id);
    }
  });

  test('the old ids still open the same models', () {
    for (final e in ModelCatalogue.all.where((e) => e.usesViewer)) {
      final info = ViewerModelInfo.byId(e.viewerId!);
      expect(info, isNotNull, reason: e.id);
      if (e.variant != null) expect(info!.variants, contains(e.variant), reason: e.id);
    }
  });

  test('the new models for higher classes are there, with procedural credits', () {
    for (final id in ['orbitals', 'hybridisation', 'crystal_lattices', 'electric_circuit', 'ac_generator', 'transformer', 'simple_machines', 'ear', 'nephron']) {
      final m = ViewerModelInfo.byId(id);
      expect(m, isNotNull, reason: id);
      expect(m!.fromBodyParts3D, isFalse, reason: id);
    }
    expect(ViewerModelInfo.byId('orbitals')!.variants, containsAll(['s1', 'px', 'dz2']));
    expect(ViewerModelInfo.byId('crystal_lattices')!.variants, ['sc', 'bcc', 'fcc', 'nacl']);
  });

  test('BodyParts3D and three.js are credited', () {
    final anatomy = [for (final m in ViewerModelInfo.all) if (m.fromBodyParts3D) m.id];
    expect(anatomy, containsAll(['heart', 'brain', 'digestive', 'lungs', 'eye', 'excretory', 'skeleton']));
    for (final id in anatomy) {
      expect(ViewerModelInfo.byId(id)!.credit, contains('CC BY 4.0'), reason: id);
    }
    for (final f in ['NOTICE', '$_assets/CREDITS.txt']) {
      final text = File(f).readAsStringSync();
      expect(text, contains('BodyParts3D'), reason: f);
      expect(text, contains('Creative Commons Attribution 4.0'), reason: f);
      expect(text, contains('three.js'), reason: f);
      expect(text, contains('MIT'), reason: f);
    }
    expect(File('$_assets/viewer.js').readAsStringSync(), startsWith('/* KINETIX 3D viewer. Includes three.js (MIT License'));
    for (final lang in viewerLanguages) {
      final lines = Model3dCredits.lines(lang);
      expect(lines.join('\n'), contains('BodyParts3D'));
      expect(lines.join('\n'), contains('three.js'));
    }
  });

  test('the controls\' words are all in English, Hindi and Kannada', () {
    for (final e in Viewer3dStrings.words.entries) {
      expect(e.value, hasLength(3), reason: e.key);
      for (final w in e.value) {
        expect(w.trim(), isNotEmpty, reason: e.key);
      }
      // Hindi and Kannada are not left in English (names like three.js aside).
      if (!e.value[0].contains('three.js') && !e.value[0].contains('BodyParts3D') && !e.value[0].contains('Natural Earth')) {
        expect(e.value[1], isNot(e.value[0]), reason: '${e.key} hi');
        expect(e.value[2], isNot(e.value[0]), reason: '${e.key} kn');
      }
    }
  });

  test('a topic finds its model', () {
    expect(ViewerModelInfo.bestFor('Structure of the human heart and double circulation')?.id, 'heart');
    expect(ViewerModelInfo.bestFor('Shapes of s, p and d orbitals')?.id, 'orbitals');
    expect(ViewerModelInfo.bestFor('Packing efficiency of a face centred cubic unit cell')?.id, 'crystal_lattices');
    expect(ViewerModelInfo.bestFor('How does a step up transformer work?')?.id, 'transformer');
    expect(ViewerModelInfo.bestFor('Structure of a nephron')?.id, 'nephron');
    expect(ViewerModelInfo.bestFor('Heartily welcome'), isNull);
  });
}

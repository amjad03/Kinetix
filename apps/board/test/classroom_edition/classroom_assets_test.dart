// Which bundled PhET sims and 3D models the Classroom edition's PUC lessons use, worked out
// from the lesson files themselves (assets/lessons/puc and, when built, the School overlays in
// assets/private/lessons). The Classroom APK carries only these
// (lib/classroom_edition/classroom_assets.dart, read by android/app/build.gradle.kts).
//
// Lists them:          flutter test test/classroom_edition/classroom_assets_test.dart --reporter expanded
// Rewrites the lists:  CLASSROOM_ASSETS_WRITE=1 flutter test test/classroom_edition/classroom_assets_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/classroom_edition/classroom_assets.dart';
import 'package:kinetix_board/features/sim_hub/sim_entry.dart';

/// What the lessons use: PhET sim ids and 3D viewer model ids, with a chapter that uses each.
class LessonAssetUse {
  final phet = <String, String>{};
  final models = <String, String>{};
  final unknownModels = <String, String>{};

  void scan(Object? o, String chapter) {
    if (o is Map) {
      final type = o['type'];
      if (type == 'simulation' && o['source'] == 'phet' && o['simId'] is String) phet.putIfAbsent(o['simId'] as String, () => chapter);
      if (type == '3d_model' && o['modelId'] is String) {
        final id = o['modelId'] as String;
        final viewer = ModelCatalogue.byId(id)?.viewerId;
        if (ModelCatalogue.byId(id) == null) unknownModels.putIfAbsent(id, () => chapter);
        if (viewer != null) models.putIfAbsent(viewer, () => chapter);
      }
      for (final v in o.values) {
        scan(v, chapter);
      }
    } else if (o is List) {
      for (final v in o) {
        scan(v, chapter);
      }
    }
  }
}

Map<String, dynamic> _readGz(File f) => jsonDecode(utf8.decode(gzip.decode(f.readAsBytesSync()))) as Map<String, dynamic>;

List<File> _chapters(String dir) {
  final d = Directory(dir);
  if (!d.existsSync()) return const [];
  return [
    for (final f in d.listSync())
      if (f is File && f.path.endsWith('.json.gz')) f,
  ]..sort((a, b) => a.path.compareTo(b.path));
}

String _setLiteral(String doc, String name, Iterable<String> ids) =>
    '$doc\nconst $name = <String>{\n${[for (final id in [...ids]..sort()) "  '$id',\n"].join()}};\n';

String _replaceBlock(String source, String marker, String body) {
  final begin = '// classroom-assets:$marker:begin\n';
  final end = '// classroom-assets:$marker:end';
  final a = source.indexOf(begin), b = source.indexOf(end);
  if (a < 0 || b < a) throw StateError('no $marker markers in classroom_assets.dart');
  return source.replaceRange(a + begin.length, b, body);
}

void main() {
  final use = LessonAssetUse();
  final base = _chapters('assets/lessons/puc');
  final school = _chapters('assets/private/lessons');
  for (final f in [...base, ...school]) {
    use.scan(_readGz(f), f.uri.pathSegments.last.replaceAll('.json.gz', ''));
  }

  test('lists the PhET sims and 3D models the PUC lessons use', () {
    expect(base.length, greaterThan(300), reason: 'the bundled PUC lessons (assets/lessons/puc)');
    // ignore: avoid_print
    print('PUC lessons: ${base.length} chapters${school.isEmpty ? ' (no School overlays built)' : ', ${school.length} School overlays'}');
    // ignore: avoid_print
    print('PhET sims used (${use.phet.length} of ${simCatalogue.where((e) => e.source == 'PhET' && e.asset != null).length}):');
    for (final id in use.phet.keys.toList()..sort()) {
      // ignore: avoid_print
      print('  $id  (first in ${use.phet[id]})');
    }
    // ignore: avoid_print
    print('3D viewer models used (${use.models.length} of ${ViewerModelInfo.all.length}):');
    for (final id in use.models.keys.toList()..sort()) {
      // ignore: avoid_print
      print('  $id  (first in ${use.models[id]})');
    }
    expect(use.unknownModels, isEmpty, reason: 'lessons link 3D models the board does not have');

    if (Platform.environment['CLASSROOM_ASSETS_WRITE'] == '1') {
      final file = File('lib/classroom_edition/classroom_assets.dart');
      var s = file.readAsStringSync();
      s = _replaceBlock(s, 'phet', _setLiteral('/// The PhET sims the lessons use (`assets/simhub/phet/<id>.html`).', 'classroomPhetSims', use.phet.keys));
      s = _replaceBlock(s, 'models', _setLiteral('/// The 3D viewer models the lessons use (kinetix_3d `assets/viewer3d/models/<id>.glb` and `.json`).', 'classroomViewerModels', use.models.keys));
      file.writeAsStringSync(s);
      // ignore: avoid_print
      print('Wrote ${file.path}; run the test again without CLASSROOM_ASSETS_WRITE.');
      return;
    }

    const rewrite = 'Run CLASSROOM_ASSETS_WRITE=1 flutter test test/classroom_edition/classroom_assets_test.dart';
    // Everything a lesson uses is in the Classroom APK...
    expect(use.phet.keys.toSet().difference(classroomPhetSims), isEmpty, reason: 'lessons use PhET sims the Classroom APK leaves out. $rewrite');
    expect(use.models.keys.toSet().difference(classroomViewerModels), isEmpty, reason: 'lessons use 3D models the Classroom APK leaves out. $rewrite');
    // ...and, with the School overlays built (a release), nothing more.
    if (school.isNotEmpty) {
      expect(classroomPhetSims, use.phet.keys.toSet(), reason: 'no lesson uses some listed PhET sims. $rewrite');
      expect(classroomViewerModels, use.models.keys.toSet(), reason: 'no lesson uses some listed 3D models. $rewrite');
    }
  });

  test('every listed sim and model is one the board bundles', () {
    for (final id in classroomPhetSims) {
      expect(File('assets/simhub/phet/$id.html').existsSync(), isTrue, reason: id);
      expect(simCatalogue.where((e) => e.id == 'phet-$id' && e.kind == SimKindOf.bundled), hasLength(1), reason: id);
    }
    for (final id in classroomViewerModels) {
      expect(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.glb').existsSync(), isTrue, reason: id);
      expect(ViewerModelInfo.byId(id), isNotNull, reason: id);
    }
    for (final dir in classroomDroppedSimDirs) {
      expect(Directory('assets/simhub/$dir').existsSync(), isTrue, reason: dir);
    }
  });

  test('the Sims hub and the 3D library show only what the Classroom APK carries', () {
    addTearDown(() {
      simIncluded = (_) => true;
      ModelCatalogue.bundledViewerModels = null;
    });
    expect(classroomHasSim('phet/charges-and-fields.html'), isTrue);
    expect(classroomHasSim('phet/arithmetic.html'), isFalse);
    expect(classroomHasSim('jupyterlite/repl/index.html?kernel=python&toolbar=1'), isFalse);
    expect(classroomHasSim('circuitjs/index.html'), isTrue);
    expect(classroomHasSim(null), isTrue);

    final everything = filterSims().length;
    final models = ModelCatalogue.entries.length;
    // As main.dart sets them for the Classroom edition.
    simIncluded = (e) => e.kind != SimKindOf.bundled || classroomHasSim(e.asset);
    ModelCatalogue.bundledViewerModels = classroomViewerModels;
    final shown = filterSims();
    expect(shown.where((e) => e.source == 'PhET' && e.asset != null).map((e) => e.id.substring(5)).toSet(), classroomPhetSims);
    expect(shown.where((e) => e.id == 'jupyterlite'), isEmpty);
    expect(simById('jupyterlite'), isNull);
    expect(shown.where((e) => e.id == 'circuitjs'), hasLength(1));
    expect(shown.length, lessThan(everything));
    final listed = ModelCatalogue.entries;
    expect(listed.length, lessThan(models));
    expect(listed.where((e) => e.viewerId != null && e.remote == null && !classroomViewerModels.contains(e.viewerId)), isEmpty);
    expect(listed.where((e) => e.viewerId == 'heart'), isNotEmpty);
  });
}

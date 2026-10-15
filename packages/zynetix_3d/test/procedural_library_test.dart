import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_3d/zynetix_3d.dart';

void main() {
  final procedural = [for (final e in ModelCatalogue.all) if (e.buildLang != null) e];

  test('the library has the requested subjects', () {
    final ids = {for (final e in procedural) e.id};
    expect(ids, containsAll(['proc.gears', 'proc.engine', 'proc.optics-convex', 'proc.optics-concave', 'proc.lab-apparatus', 'proc.globe', 'proc.landforms', 'proc.virus', 'proc.teeth', 'proc.skull', 'proc.taj-mahal', 'proc.qutub-minar', 'proc.india-gate', 'proc.konark']));
    expect({for (final e in procedural) e.subjects.first}, containsAll(['Engineering', 'Physics', 'Chemistry', 'Geography', 'Biology', 'History']));
  });

  for (final e in procedural) {
    test('${e.id} builds in en, hi and kn with named parts and labels on real parts', () {
      final titles = <String>{};
      for (final lang in viewerLanguages) {
        final m = e.buildModel(lang);
        titles.add(m.title);
        expect(m.parts, isNotEmpty);
        expect(m.triangleCount, greaterThan(50));
        expect(m.triangleCount, lessThan(120000));
        for (final l in m.labels) {
          expect(l.text.trim(), isNotEmpty);
          if (l.partId != null) expect(m.partById(l.partId!), isNotNull, reason: '${e.id} label ${l.text}');
        }
        for (final p in m.parts.where((p) => p.pickable)) {
          expect(p.name, isNotEmpty, reason: '${e.id}/${p.id}');
        }
        for (final p in m.parts) {
          for (final v in p.mesh.positions) {
            expect(v.isFinite, isTrue, reason: '${e.id}/${p.id}');
          }
        }
        final (_, r) = m.bounds;
        expect(r, greaterThan(0.2));
      }
      expect(titles.length, 3, reason: 'title is translated');
      expect(e.titles!.complete, isTrue);
    });
  }

  test('the engine moves: piston down on the intake stroke, a cycle takes four seconds', () {
    final m = ModelCatalogue.byId('proc.engine')!.buildModel();
    final piston = m.partById('piston')!;
    double y(double t) => piston.motion!(t).transformPoint(Vec3.zero).y;
    expect(y(0), greaterThan(y(1)));
    expect((y(0) - y(4)).abs(), lessThan(1e-6));
    final rod = m.partById('rod')!;
    final end = rod.motion!(0.37).transformPoint(const Vec3(0, 1.7, 0));
    final pin = piston.motion!(0.37).transformPoint(const Vec3(0, 0.2, 0));
    expect((end - pin).length, lessThan(1e-6));
  });

  test('meshing gears turn opposite ways at a 2:1 ratio', () {
    final m = ModelCatalogue.byId('proc.gears')!.buildModel();
    double angle(String id, double t) {
      final p = m.partById(id)!.motion!(t).transformDirection(Vec3.unitX);
      return math.atan2(-p.z, p.x);
    }

    final dA = angle('gear0', 0.1) - angle('gear0', 0);
    final dB = angle('gear1', 0.1) - angle('gear1', 0);
    expect(dA * dB, lessThan(0));
    expect((dA / dB).abs(), closeTo(2, 1e-6));
  });

  test('lens: convex makes a real image, concave a virtual one', () {
    final cx = ModelCatalogue.byId('proc.optics-convex')!.buildModel();
    final cv = ModelCatalogue.byId('proc.optics-concave')!.buildModel();
    expect(cx.partById('image')!.name, contains('Real'));
    expect(cv.partById('image')!.name, contains('Virtual'));
  });

  test('downloadable models are in the catalogue with subject and class filters', () {
    final dl = ModelCatalogue.all.where((e) => e.remote != null).toList();
    expect(dl.length, RemoteModels.all.length);
    expect(dl.every((e) => !e.native && e.classes.isNotEmpty), isTrue);
  });
}

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

const _style = RenderStyle(
  foreground: Color(0xFFFFFFFF),
  labelBackground: Color(0xFF333333),
  labelForeground: Color(0xFFFFFFFF),
  accent: Color(0xFFFFB300),
  onAccent: Color(0xFF000000),
  textStyle: TextStyle(fontSize: 14),
);

void _render(SceneRenderer r, OrbitCamera cam, {Size size = const Size(800, 600), double time = 0}) {
  final rec = ui.PictureRecorder();
  r.paint(Canvas(rec), size, cam, _style, RenderOptions(time: time));
  rec.endRecording().dispose();
}

void main() {
  test('matrices: rotation, quaternion and TRS agree', () {
    final rz = Mat4.rotationZ(math.pi / 2);
    final p = rz.transformPoint(Vec3.unitX);
    expect(p.x, closeTo(0, 1e-12));
    expect(p.y, closeTo(1, 1e-12));
    final q = Mat4.fromQuaternion(0, 0, math.sin(math.pi / 4), math.cos(math.pi / 4));
    expect(q.transformPoint(Vec3.unitX).y, closeTo(1, 1e-12));
    final trs = Mat4.trs(const Vec3(1, 2, 3), [0, 0, 0, 1], const Vec3(2, 2, 2));
    final t = trs.transformPoint(const Vec3(1, 1, 1));
    expect([t.x, t.y, t.z], [3, 4, 5]);
    expect(Mat4.identity().isIdentity, isTrue);
  });

  test('a cube mesh has 12 triangles and 12 feature edges', () {
    final cube = Primitives.box(2, 2, 2);
    expect(cube.triangleCount, 12);
    expect(cube.featureEdges, hasLength(12));
    // A smooth sphere has no feature edges, only silhouettes.
    expect(Primitives.sphere(1).featureEdges, isEmpty);
  });

  test('back faces are culled: about half of a sphere is drawn', () {
    final model = Model3D(title: 's', parts: [ModelPart(id: 's', mesh: Primitives.sphere(1, segments: 32, rings: 16), color: const Color(0xFF8888FF), name: 'Ball')]);
    final r = SceneRenderer(model);
    _render(r, OrbitCamera());
    expect(r.lastVisibleTriangles, greaterThan(r.totalTriangles * 0.3));
    expect(r.lastVisibleTriangles, lessThan(r.totalTriangles * 0.62));
  });

  test('hit testing returns the front-most named part', () {
    final model = Model3D(title: 't', parts: [
      ModelPart(id: 'back', mesh: Primitives.sphere(1, center: const Vec3(0, 0, -3)), color: const Color(0xFFFF0000), name: 'Back'),
      ModelPart(id: 'front', mesh: Primitives.sphere(1, center: const Vec3(0, 0, 3)), color: const Color(0xFF00FF00), name: 'Front'),
    ], center: Vec3.zero);
    final r = SceneRenderer(model);
    _render(r, OrbitCamera(yaw: 0, pitch: 0));
    expect(r.hitTest(const Offset(400, 300)), 'front');
    expect(r.hitTest(const Offset(5, 5)), isNull);
    // Turn around: the other ball is now in front.
    _render(r, OrbitCamera(yaw: 180, pitch: 0));
    expect(r.hitTest(const Offset(400, 300)), 'back');
  });

  test('animated parts move with time', () {
    final m = AstronomyModels.solarSystem();
    final r = SceneRenderer(m);
    _render(r, OrbitCamera(), time: 0);
    final a = r.projectPart('earth');
    _render(r, OrbitCamera(), time: 3);
    final b = r.projectPart('earth');
    expect((a - b).distance, greaterThan(5));
  });

  test('every catalogue model renders without errors', () {
    for (final e in ModelCatalogue.entries) {
      final model = e.buildModel();
      final r = SceneRenderer(model);
      _render(r, OrbitCamera(yaw: model.initialYaw, pitch: model.initialPitch), size: const Size(1920, 1080));
      expect(r.lastVisibleTriangles, greaterThan(0), reason: e.id);
      r.dispose();
    }
  });

  test('catalogue ids are stable and unique', () {
    expect(ModelCatalogue.ids, [
      'solid.cube', 'solid.cuboid', 'solid.sphere', 'solid.hemisphere', 'solid.cylinder', 'solid.cone', 'solid.frustum',
      'solid.square-pyramid', 'solid.triangular-prism', 'solid.tetrahedron',
      'chem.water', 'chem.methane', 'chem.co2', 'chem.nacl', 'astro.solar-system', 'astro.earth',
    ]);
    expect(ModelCatalogue.ids.toSet(), hasLength(ModelCatalogue.ids.length));
  });

  test('the world map puts India and the Sahara on land, the oceans in water', () {
    expect(isLand(22, 79), isTrue); // central India
    expect(isLand(12.97, 77.59), isTrue); // Bengaluru
    expect(isLand(23, 10), isTrue); // Sahara
    expect(isLand(0, -30), isFalse); // Atlantic
    expect(isLand(-10, 80), isFalse); // Indian Ocean
    expect(isLand(15, 88), isFalse); // Bay of Bengal
    expect(isLand(-80, 0), isTrue); // Antarctica
  });

  test('frame cost (report): Earth and NaCl at 1920×1080', () {
    for (final id in ['astro.earth', 'chem.nacl', 'astro.solar-system', 'solid.sphere']) {
      final model = ModelCatalogue.byId(id)!.buildModel();
      final r = SceneRenderer(model);
      final cam = OrbitCamera(yaw: model.initialYaw, pitch: model.initialPitch);
      for (var i = 0; i < 5; i++) {
        _render(r, cam, size: const Size(1920, 1080), time: i * 0.016);
      }
      final sw = Stopwatch()..start();
      const frames = 30;
      for (var i = 0; i < frames; i++) {
        cam.rotateBy(2, 0);
        _render(r, cam, size: const Size(1920, 1080), time: i * 0.016);
      }
      final ms = sw.elapsedMicroseconds / frames / 1000;
      // ignore: avoid_print
      print('$id: ${r.totalTriangles} triangles, ${r.lastVisibleTriangles} drawn, ${ms.toStringAsFixed(2)} ms/frame (CPU side, debug JIT)');
      expect(ms, lessThan(100));
    }
  });
}

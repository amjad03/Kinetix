import 'dart:math' as math;
import 'dart:ui' show Color;

import 'earth_map.dart';
import 'math3d.dart';
import 'mesh.dart';
import 'model.dart';
import 'primitives.dart';
import 'viewer/manifest.dart';

/// Teaching models drawn by KINETIX in code (no third-party files): machines, optics, lab
/// apparatus, the globe, landforms, a virus, teeth, a skull and four Indian monuments.
/// Parts are named and noted; labels come in English, Hindi and Kannada. The monuments, skull
/// and teeth are simplified shapes and say so in their captions.
abstract final class ProceduralModels {
  static LocalText _t(String en, String hi, String kn) => LocalText({'en': en, 'hi': hi, 'kn': kn});

  static Mesh _at(Mesh m, Mat4 t) => (MeshBuilder()..addMesh(m, t)).build();
  static Mesh _up(Mesh m, Vec3 p) => _at(m, Mat4.translation(p));

  /// Joins meshes into one.
  static Mesh _join(List<Mesh> ms) {
    final b = MeshBuilder();
    for (final m in ms) {
      b.addMesh(m);
    }
    return b.build();
  }

  static Mat4 _scale(double x, double y, double z) => Mat4.scale(Vec3(x, y, z));

  // ───────────────────────────── gears ─────────────────────────────

  /// A spur gear in the xz plane (axis y), [n] teeth, teeth tip radius [tip], root radius [root].
  static Mesh gearMesh(int n, double root, double tip, double thick) {
    final b = MeshBuilder();
    final pitch = 2 * math.pi / n;
    final ring = <Vec3>[];
    for (var i = 0; i < n; i++) {
      for (final (r, f) in [(root, 0.0), (tip, 0.18), (tip, 0.48), (root, 0.66)]) {
        final a = (i + f) * pitch;
        ring.add(Vec3(r * math.cos(a), 0, -r * math.sin(a)));
      }
    }
    final top = b.addVertex(Vec3(0, thick, 0), normal: Vec3.unitY);
    final bottom = b.addVertex(Vec3.zero, normal: -Vec3.unitY);
    final m = ring.length;
    final tv = [for (final p in ring) b.addVertex(p + Vec3(0, thick, 0), normal: Vec3.unitY)];
    final bv = [for (final p in ring) b.addVertex(p, normal: -Vec3.unitY)];
    for (var i = 0; i < m; i++) {
      final j = (i + 1) % m;
      b.addTriangle(top, tv[j], tv[i]);
      b.addTriangle(bottom, bv[i], bv[j]);
    }
    for (var i = 0; i < m; i++) {
      final j = (i + 1) % m;
      final p = ring[i], q = ring[j];
      final nrm = Vec3(p.x + q.x, 0, p.z + q.z).normalized;
      final a = b.addVertex(p, normal: nrm), c = b.addVertex(q, normal: nrm);
      final d = b.addVertex(q + Vec3(0, thick, 0), normal: nrm), e = b.addVertex(p + Vec3(0, thick, 0), normal: nrm);
      b.addQuad(a, c, d, e);
    }
    return b.build();
  }

  /// A driver gear of 12 teeth, a driven gear of 24 and an idler of 12: turning speeds, directions and the 2:1 ratio.
  static Model3D gears(String lang) {
    const mod = 0.1;
    final cs = [Vec3.zero, const Vec3(1.8, 0, 0), const Vec3(3.0, 0, 0)];
    final ns = [12, 24, 12];
    final colours = [const Color(0xFFD9822B), const Color(0xFF3F7CAC), const Color(0xFF5BA55B)];
    final names = [
      _t('Driver gear (12 teeth)', 'चालक गियर (12 दाँते)', 'ಚಾಲಕ ಗೇರ್ (12 ಹಲ್ಲುಗಳು)'),
      _t('Driven gear (24 teeth)', 'चालित गियर (24 दाँते)', 'ಚಾಲಿತ ಗೇರ್ (24 ಹಲ್ಲುಗಳು)'),
      _t('Second driven gear (12 teeth)', 'दूसरा चालित गियर (12 दाँते)', 'ಎರಡನೇ ಚಾಲಿತ ಗೇರ್ (12 ಹಲ್ಲುಗಳು)'),
    ];
    final notes = [
      _t('Turns once per second here.', 'यहाँ यह एक सेकंड में एक चक्कर लगाता है।', 'ಇಲ್ಲಿ ಇದು ಒಂದು ಸೆಕೆಂಡಿಗೆ ಒಂದು ಸುತ್ತು ತಿರುಗುತ್ತದೆ.'),
      _t('Twice the teeth, so it turns half as fast and the opposite way: speed ratio 2:1, torque doubles.', 'दाँते दुगुने, इसलिए आधी गति से और उलटी दिशा में घूमता है: गति अनुपात 2:1, बल-आघूर्ण दुगुना।', 'ಹಲ್ಲುಗಳು ಎರಡರಷ್ಟು, ಆದ್ದರಿಂದ ಅರ್ಧ ವೇಗದಲ್ಲಿ ಹಾಗೂ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ತಿರುಗುತ್ತದೆ: ವೇಗ ಅನುಪಾತ 2:1, ತಿರುಗುಬಲ ದ್ವಿಗುಣ.'),
      _t('Turns the same way as the first gear and as fast.', 'पहले गियर की दिशा में और उसी गति से घूमता है।', 'ಮೊದಲ ಗೇರ್‌ನ ದಿಕ್ಕಿನಲ್ಲೇ ಹಾಗೂ ಅದೇ ವೇಗದಲ್ಲಿ ತಿರುಗುತ್ತದೆ.'),
    ];
    const w = 2 * math.pi; // driver: one turn per second
    final parts = <ModelPart>[];
    final labels = <Label3D>[];
    for (var i = 0; i < 3; i++) {
      final n = ns[i];
      final pr = n * mod / 2;
      final pitch = 2 * math.pi / n;
      final phase = i == 0 ? -0.33 * pitch : i == 1 ? math.pi - 0.83 * pitch : math.pi - 0.33 * pitch;
      final ratio = i == 1 ? -12 / 24 : i == 0 ? 1.0 : 1.0;
      final c = cs[i];
      parts.add(ModelPart(
        id: 'gear$i',
        mesh: _join([gearMesh(n, pr - 0.09, pr + 0.09, 0.25), _up(Primitives.cylinder(0.09, 0.45), const Vec3(0, -0.1, 0))]),
        color: colours[i],
        name: names[i].of(lang),
        description: notes[i].of(lang),
        motion: (t) => Mat4.translation(c) * Mat4.rotationY(phase + ratio * w * t * 0.25),
      ));
      labels.add(Label3D(names[i].of(lang), c + Vec3(0, 0.5, pr + 0.2), partId: 'gear$i'));
    }
    return Model3D(
      title: _t('Gears and gear train', 'गियर और गियर-गाड़ी', 'ಗೇರ್‌ಗಳು ಮತ್ತು ಗೇರ್ ಸರಣಿ').of(lang),
      caption: _t('Meshing gears turn in opposite directions; the speed ratio is the ratio of teeth.', 'आपस में फँसे गियर उलटी दिशा में घूमते हैं; गति अनुपात दाँतों का अनुपात होता है।', 'ಹೊಂದಿಕೊಂಡ ಗೇರ್‌ಗಳು ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ತಿರುಗುತ್ತವೆ; ವೇಗ ಅನುಪಾತ ಹಲ್ಲುಗಳ ಅನುಪಾತ.').of(lang),
      subjects: const ['Engineering', 'Physics'],
      parts: parts,
      labels: labels,
      animated: true,
      initialPitch: 55,
      initialYaw: 0,
    );
  }

  // ───────────────────────────── engine ─────────────────────────────

  static Mesh _halfTube(double r, double y0, double y1) {
    final b = MeshBuilder();
    const seg = 24;
    for (var i = 0; i <= seg; i++) {
      final a = math.pi + math.pi * i / seg; // back half: z < 0
      final n = Vec3(-math.cos(a), 0, -math.sin(a));
      b.addVertex(Vec3(r * math.cos(a), y0, r * math.sin(a)), normal: n);
      b.addVertex(Vec3(r * math.cos(a), y1, r * math.sin(a)), normal: n);
    }
    for (var i = 0; i < seg; i++) {
      b.addQuad(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1);
    }
    return b.build();
  }

  /// A single-cylinder four-stroke petrol engine (cut away at the front): intake, compression, power, exhaust.
  static Model3D engine(String lang) {
    const r = 0.5, rodLen = 1.7, bore = 0.45;
    double pistonY(double a) => r * math.cos(a) + math.sqrt(rodLen * rodLen - r * r * math.sin(a) * math.sin(a));
    double crank(double t) => t * math.pi; // half a turn per second: a full cycle in four seconds
    final nIntake = _t('Intake valve', 'अंतर्ग्रहण वाल्व', 'ಒಳಹರಿವು ಕವಾಟ');
    final nExhaust = _t('Exhaust valve', 'निकास वाल्व', 'ನಿರ್ಗಮನ ಕವಾಟ');
    final nPiston = _t('Piston', 'पिस्टन', 'ಪಿಸ್ಟನ್');
    final nRod = _t('Connecting rod', 'संयोजक छड़', 'ಸಂಪರ್ಕ ಸಲಾಕೆ');
    final nCrank = _t('Crankshaft', 'क्रैंकशाफ्ट', 'ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್');
    final nPlug = _t('Spark plug', 'स्पार्क प्लग', 'ಸ್ಪಾರ್ಕ್ ಪ್ಲಗ್');
    final nCyl = _t('Cylinder', 'सिलेंडर', 'ಸಿಲಿಂಡರ್');
    const headY = 3.0;
    double valve(double t, bool intake) {
      final c = (crank(t) % (4 * math.pi));
      if (intake) return c < math.pi ? math.sin(c) : 0;
      return c > 3 * math.pi ? -math.sin(c) : 0;
    }

    final parts = <ModelPart>[
      ModelPart(id: 'cyl', mesh: _halfTube(bore, 0.9, headY), color: const Color(0xFF8D99A6), name: nCyl.of(lang), description: _t('The piston slides in it; fuel and air burn at the top.', 'पिस्टन इसमें सरकता है; ऊपर ईंधन और हवा जलती है।', 'ಪಿಸ್ಟನ್ ಇದರಲ್ಲಿ ಜಾರುತ್ತದೆ; ಮೇಲ್ಭಾಗದಲ್ಲಿ ಇಂಧನ ಮತ್ತು ಗಾಳಿ ಉರಿಯುತ್ತವೆ.').of(lang), doubleSided: true),
      ModelPart(id: 'head', mesh: _up(Primitives.box(1.3, 0.25, 0.9), const Vec3(0, headY, 0)), color: const Color(0xFF6B7683), name: _t('Cylinder head', 'सिलेंडर हेड', 'ಸಿಲಿಂಡರ್ ಹೆಡ್').of(lang)),
      ModelPart(id: 'plug', mesh: _up(Primitives.cylinder(0.06, 0.5), const Vec3(0, headY + 0.25, 0)), color: const Color(0xFFE6E0D0), name: nPlug.of(lang), description: _t('Makes the spark that lights the compressed mixture at the start of the power stroke.', 'शक्ति स्ट्रोक की शुरुआत में संपीडित मिश्रण को जलाने वाली चिंगारी बनाता है।', 'ಶಕ್ತಿ ಸ್ಟ್ರೋಕ್ ಆರಂಭದಲ್ಲಿ ಸಂಕುಚಿತ ಮಿಶ್ರಣವನ್ನು ಹೊತ್ತಿಸುವ ಕಿಡಿ ಉಂಟುಮಾಡುತ್ತದೆ.').of(lang)),
      ModelPart(
        id: 'piston',
        mesh: _join([Primitives.cylinder(bore - 0.03, 0.45), _up(Primitives.cylinder(bore - 0.01, 0.06), const Vec3(0, 0.3, 0))]),
        color: const Color(0xFFC9CED6),
        name: nPiston.of(lang),
        description: _t('Pushed down by the burning gas it turns the crankshaft through the connecting rod.', 'जलती गैस इसे नीचे धकेलती है और यह संयोजक छड़ से क्रैंकशाफ्ट घुमाता है।', 'ಉರಿಯುವ ಅನಿಲ ಇದನ್ನು ಕೆಳಗೆ ತಳ್ಳುತ್ತದೆ; ಇದು ಸಂಪರ್ಕ ಸಲಾಕೆಯ ಮೂಲಕ ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್ ತಿರುಗಿಸುತ್ತದೆ.').of(lang),
        motion: (t) => Mat4.translation(Vec3(0, pistonY(crank(t)) - 0.2, 0)),
      ),
      ModelPart(
        id: 'rod',
        mesh: _up(Primitives.box(0.18, rodLen, 0.18), Vec3.zero),
        color: const Color(0xFFB07A3F),
        name: nRod.of(lang),
        motion: (t) {
          final a = crank(t);
          final pin = Vec3(r * math.sin(a), r * math.cos(a), 0);
          final dx = -r * math.sin(a), dy = pistonY(a) - r * math.cos(a);
          return Mat4.translation(pin) * Mat4.rotationZ(math.atan2(-dx, dy));
        },
      ),
      ModelPart(
        id: 'crank',
        mesh: _join([
          _at(Primitives.cylinder(0.14, 0.7), Mat4.translation(const Vec3(0, 0, -0.35)) * Mat4.rotationX(math.pi / 2)),
          _up(Primitives.box(0.3, r + 0.1, 0.12), const Vec3(0, 0, 0.2)),
          _at(Primitives.cylinder(0.12, 0.3), Mat4.translation(const Vec3(0, r, -0.15)) * Mat4.rotationX(math.pi / 2)),
          _at(Primitives.cylinder(0.32, 0.1), Mat4.translation(const Vec3(0, -0.2, 0.2)) * Mat4.rotationX(math.pi / 2)),
        ]),
        color: const Color(0xFF444B55),
        name: nCrank.of(lang),
        description: _t('Turns the up-and-down push of the piston into rotation. It turns twice for each cycle.', 'पिस्टन के ऊपर-नीचे धक्के को घूर्णन में बदलता है। एक चक्र में यह दो बार घूमता है।', 'ಪಿಸ್ಟನ್‌ನ ಮೇಲೆ-ಕೆಳಗಿನ ತಳ್ಳುವಿಕೆಯನ್ನು ಸುತ್ತುವಿಕೆಯಾಗಿ ಬದಲಿಸುತ್ತದೆ. ಒಂದು ಚಕ್ರದಲ್ಲಿ ಎರಡು ಬಾರಿ ತಿರುಗುತ್ತದೆ.').of(lang),
        motion: (t) => Mat4.rotationZ(-crank(t)),
      ),
    ];
    for (final (id, x, intake, name) in [('valve-in', -0.28, true, nIntake), ('valve-out', 0.28, false, nExhaust)]) {
      parts.add(ModelPart(
        id: id,
        mesh: _join([_up(Primitives.cylinder(0.03, 0.55), const Vec3(0, 0.25, 0)), Primitives.cylinder(0.14, 0.05)]),
        color: intake ? const Color(0xFF3F9E6B) : const Color(0xFFC0503B),
        name: name.of(lang),
        description: (intake
                ? _t('Opens on the intake stroke to let fuel-air mixture in.', 'अंतर्ग्रहण स्ट्रोक में खुलकर ईंधन-वायु मिश्रण भीतर आने देता है।', 'ಒಳಹರಿವು ಸ್ಟ್ರೋಕ್‌ನಲ್ಲಿ ತೆರೆದು ಇಂಧನ-ಗಾಳಿ ಮಿಶ್ರಣವನ್ನು ಒಳಗೆ ಬಿಡುತ್ತದೆ.')
                : _t('Opens on the exhaust stroke to let burnt gas out.', 'निकास स्ट्रोक में खुलकर जली गैस बाहर निकलने देता है।', 'ನಿರ್ಗಮನ ಸ್ಟ್ರೋಕ್‌ನಲ್ಲಿ ತೆರೆದು ಸುಟ್ಟ ಅನಿಲವನ್ನು ಹೊರಗೆ ಬಿಡುತ್ತದೆ.'))
            .of(lang),
        motion: (t) => Mat4.translation(Vec3(x, headY - 0.12 - 0.12 * valve(t, intake), 0)),
      ));
    }
    return Model3D(
      title: _t('Four-stroke engine', 'चार-स्ट्रोक इंजन', 'ನಾಲ್ಕು-ಸ್ಟ್ರೋಕ್ ಎಂಜಿನ್').of(lang),
      caption: _t('Intake, compression, power, exhaust: the crankshaft turns twice per cycle.', 'अंतर्ग्रहण, संपीडन, शक्ति, निकास: एक चक्र में क्रैंकशाफ्ट दो बार घूमता है।', 'ಒಳಹರಿವು, ಸಂಕೋಚನ, ಶಕ್ತಿ, ನಿರ್ಗಮನ: ಒಂದು ಚಕ್ರದಲ್ಲಿ ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್ ಎರಡು ಬಾರಿ ತಿರುಗುತ್ತದೆ.').of(lang),
      subjects: const ['Engineering', 'Physics'],
      parts: parts,
      labels: [
        Label3D(nPiston.of(lang), const Vec3(0.45, 1.9, 0), partId: 'piston'),
        Label3D(nIntake.of(lang), const Vec3(-0.5, 3.2, 0), partId: 'valve-in'),
        Label3D(nExhaust.of(lang), const Vec3(0.5, 3.2, 0), partId: 'valve-out'),
        Label3D(nPlug.of(lang), const Vec3(0, 3.8, 0), partId: 'plug'),
        Label3D(nCrank.of(lang), const Vec3(0, -0.1, 0.4), partId: 'crank'),
        Label3D(nRod.of(lang), const Vec3(0.4, 1.0, 0), partId: 'rod'),
      ],
      animated: true,
      initialPitch: 8,
      initialYaw: 0,
    );
  }

  // ───────────────────────────── optics ─────────────────────────────

  /// A lens solid about the y axis (turned onto x by the caller): convex is thick in the middle, concave thin.
  static Mesh _lens(double halfHeight, double radius, bool convex) {
    double sag(double h) => radius - math.sqrt(radius * radius - h * h);
    double y(double h) => convex ? sag(halfHeight) + 0.02 - sag(h) : 0.06 + sag(h);
    const steps = 12;
    final bottom = [for (var i = 0; i <= steps; i++) (halfHeight * i / steps, -y(halfHeight * i / steps))];
    final top = [for (var i = steps; i >= 0; i--) (halfHeight * i / steps, y(halfHeight * i / steps))];
    return Primitives.lathe([...bottom, ...top], segments: 40, caps: false);
  }

  /// A lens on an optics bench with an object and its image: rays from the object tip and the image formed (real for the convex lens, virtual for the concave).
  static Model3D optics(String lang, {required bool convex}) {
    final f = convex ? 1.5 : -1.5;
    const u = -4.0, h = 0.8;
    final v = 1 / (1 / f + 1 / u);
    final hi = h * v / u; // image height (negative: inverted)
    final nLens = convex ? _t('Convex lens', 'उत्तल लेंस', 'ಪೀನ ಮಸೂರ') : _t('Concave lens', 'अवतल लेंस', 'ನಿಮ್ನ ಮಸೂರ');
    final nObj = _t('Object', 'वस्तु', 'ವಸ್ತು');
    final nImg = convex ? _t('Real, inverted image', 'वास्तविक, उलटा प्रतिबिंब', 'ನೈಜ, ತಲೆಕೆಳಗಾದ ಪ್ರತಿಬಿಂಬ') : _t('Virtual, upright, smaller image', 'आभासी, सीधा, छोटा प्रतिबिंब', 'ಮಿಥ್ಯಾ, ನೇರ, ಚಿಕ್ಕ ಪ್ರತಿಬಿಂಬ');
    final nF = _t('Focus F', 'फोकस F', 'ಕೇಂದ್ರ F');
    final lensMesh = _at(_lens(1.2, 2.4, convex), Mat4.rotationZ(-math.pi / 2));
    Mesh arrow(double x, double height) {
      final s = height < 0 ? -1.0 : 1.0;
      return _join([
        Primitives.rod(Vec3(x, 0, 0), Vec3(x, height - 0.12 * s, 0), 0.03),
        _at(Primitives.cone(0.08, 0.14), Mat4.translation(Vec3(x, height - 0.12 * s, 0)) * (s > 0 ? Mat4.identity() : Mat4.rotationZ(math.pi))),
      ]);
    }

    final focusTip = Vec3(f, 0, 0);
    // The ray parallel to the axis leaves the lens along the line through the focus.
    Vec3 afterLens(double x) {
      final k = (x - 0) / (f - 0);
      return Vec3(x, h * (1 - k), 0);
    }

    final lines = <Line3D>[
      const Line3D([Vec3(-6, 0, 0), Vec3(6, 0, 0)], color: Color(0xFF8A8F98), dashed: true, width: 1),
      Line3D([Vec3(u, h, 0), const Vec3(0, h, 0), afterLens(convex ? 4.2 : 3.0)], color: const Color(0xFFE2562E), width: 2.5, arrows: true),
      Line3D([Vec3(u, h, 0), Vec3(convex ? 4.2 : 3.0, (convex ? 4.2 : 3.0) * h / u, 0)], color: const Color(0xFF2E7BE2), width: 2.5, arrows: true),
      if (!convex) Line3D([const Vec3(0, h, 0), Vec3(v, hi, 0)], color: const Color(0xFFE2562E), dashed: true, width: 1.5),
    ];
    return Model3D(
      title: nLens.of(lang),
      caption: _t('Object at 4 units, focal length 1.5: ', 'वस्तु 4 इकाई पर, फोकस दूरी 1.5: ', 'ವಸ್ತು 4 ಏಕಮಾನದಲ್ಲಿ, ಸರಿಸಂಬಂಧ ಫೋಕಲ್ ದೂರ 1.5: ').of(lang) + nImg.of(lang),
      subjects: const ['Physics'],
      parts: [
        ModelPart(id: 'bench', mesh: _up(Primitives.box(12.5, 0.1, 0.8), const Vec3(0, -0.5, 0)), color: const Color(0xFF8B6B4A), name: _t('Optics bench', 'प्रकाशिकी बेंच', 'ಆಪ್ಟಿಕ್ಸ್ ಬೆಂಚ್').of(lang), pickable: false),
        ModelPart(id: 'lens', mesh: lensMesh, color: const Color(0xAA9AD1F0), name: nLens.of(lang), doubleSided: true, description: (convex ? _t('Thicker in the middle: it bends parallel rays to meet at the focus.', 'बीच में मोटा: समानांतर किरणों को फोकस पर मिला देता है।', 'ಮಧ್ಯದಲ್ಲಿ ದಪ್ಪ: ಸಮಾಂತರ ಕಿರಣಗಳನ್ನು ಕೇಂದ್ರದಲ್ಲಿ ಸೇರಿಸುತ್ತದೆ.') : _t('Thinner in the middle: it spreads parallel rays as if from the focus.', 'बीच में पतला: समानांतर किरणों को ऐसे फैलाता है जैसे फोकस से आ रही हों।', 'ಮಧ್ಯದಲ್ಲಿ ತೆಳು: ಸಮಾಂತರ ಕಿರಣಗಳನ್ನು ಕೇಂದ್ರದಿಂದ ಬಂದಂತೆ ಹರಡುತ್ತದೆ.')).of(lang)),
        ModelPart(id: 'object', mesh: arrow(u, h), color: const Color(0xFF2A9D8F), name: nObj.of(lang)),
        ModelPart(id: 'image', mesh: arrow(v, hi), color: const Color(0xFFF4A261), name: nImg.of(lang)),
        ModelPart(id: 'f1', mesh: Primitives.sphere(0.06, center: focusTip), color: const Color(0xFF222222), name: nF.of(lang)),
        ModelPart(id: 'f2', mesh: Primitives.sphere(0.06, center: Vec3(-f, 0, 0)), color: const Color(0xFF222222), name: nF.of(lang)),
      ],
      labels: [
        Label3D(nObj.of(lang), Vec3(u, h + 0.3, 0), partId: 'object'),
        Label3D(nLens.of(lang), const Vec3(0, 1.4, 0), partId: 'lens'),
        Label3D(nImg.of(lang), Vec3(v, hi + (hi < 0 ? -0.35 : 0.3), 0), partId: 'image', emphasis: true),
        Label3D('F', Vec3(f, -0.25, 0), partId: 'f1'),
        Label3D('F', Vec3(-f, -0.25, 0), partId: 'f2'),
      ],
      lines: lines,
      initialPitch: 12,
      initialYaw: 0,
    );
  }

  // ───────────────────────────── lab apparatus ─────────────────────────────

  static Model3D labApparatus(String lang) {
    const glass = Color(0x99A8D8F0);
    const liquid = Color(0xCC4FB3E8);
    Mesh vessel(List<(double, double)> outer) => Primitives.lathe(outer, segments: 32, caps: false);
    final nBeaker = _t('Beaker', 'बीकर', 'ಬೀಕರ್');
    final nFlask = _t('Conical flask', 'शंक्वाकार फ्लास्क', 'ಶಂಕುವಿನಾಕಾರದ ಫ್ಲಾಸ್ಕ್');
    final nTube = _t('Test tube', 'परखनली', 'ಪರೀಕ್ಷಾ ನಳಿಕೆ');
    final nBurette = _t('Burette', 'ब्यूरेट', 'ಬ್ಯೂರೆಟ್');
    final nBunsen = _t('Bunsen burner', 'बन्सन बर्नर', 'ಬನ್ಸೆನ್ ಬರ್ನರ್');
    final nStand = _t('Retort stand', 'रिटॉर्ट स्टैंड', 'ರಿಟಾರ್ಟ್ ಸ್ಟ್ಯಾಂಡ್');
    ModelPart p(String id, Mesh m, Color c, LocalText n, LocalText d, {bool dbl = false}) => ModelPart(id: id, mesh: m, color: c, name: n.of(lang), description: d.of(lang), doubleSided: dbl);
    final parts = [
      p('bench', _up(Primitives.box(9, 0.1, 2.4), const Vec3(0, -0.1, 0)), const Color(0xFF9B7B57), _t('Table', 'मेज़', 'ಮೇಜು'), _t('', '', ''), dbl: false),
      p('beaker', _up(vessel([(0.55, 0), (0.55, 1.2), (0.6, 1.25)]), const Vec3(-3.6, 0, 0)), glass, nBeaker, _t('A flat-bottomed container for mixing and heating liquids; its markings are only approximate.', 'तरल मिलाने और गर्म करने का समतल पेंदे वाला पात्र; इसके निशान लगभग सही होते हैं।', 'ದ್ರವಗಳನ್ನು ಬೆರೆಸಲು ಮತ್ತು ಕಾಯಿಸಲು ಚಪ್ಪಟೆ ತಳದ ಪಾತ್ರೆ; ಇದರ ಗುರುತುಗಳು ಅಂದಾಜು ಮಾತ್ರ.'), dbl: true),
      p('beaker-liquid', _up(Primitives.cylinder(0.53, 0.7), const Vec3(-3.6, 0.02, 0)), liquid, nBeaker, _t('', '', '')),
      p('flask', _up(vessel([(0.8, 0), (0.78, 0.1), (0.2, 1.2), (0.2, 1.7), (0.27, 1.75)]), const Vec3(-1.9, 0, 0)), glass, nFlask, _t('Used for titrations: the narrow neck stops the liquid splashing out when swirled.', 'अनुमापन में उपयोगी: संकरी गर्दन घुमाने पर तरल को छलकने नहीं देती।', 'ಟೈಟ್ರೇಶನ್‌ಗೆ ಬಳಕೆ: ಕಿರಿದಾದ ಕುತ್ತಿಗೆ ತಿರುಗಿಸುವಾಗ ದ್ರವ ಚೆಲ್ಲದಂತೆ ತಡೆಯುತ್ತದೆ.'), dbl: true),
      p('flask-liquid', _up(Primitives.cone(0.7, 0.9), const Vec3(-1.9, 0.05, 0)), liquid, nFlask, _t('', '', '')),
      p('tube', _up(vessel([(0.18, 0.3), (0.18, 1.6), (0.21, 1.65)]), const Vec3(-0.3, 0, 0)), glass, nTube, _t('Holds small amounts of a substance for heating or a reaction.', 'थोड़ी मात्रा के पदार्थ को गर्म करने या अभिक्रिया के लिए रखता है।', 'ಸ್ವಲ್ಪ ಪ್ರಮಾಣದ ವಸ್ತುವನ್ನು ಕಾಯಿಸಲು ಅಥವಾ ಕ್ರಿಯೆಗೆ ಹಿಡಿಯುತ್ತದೆ.'), dbl: true),
      p('tube-liquid', _up(Primitives.cylinder(0.16, 0.6), const Vec3(-0.3, 0.32, 0)), liquid, nTube, _t('', '', '')),
      p('stand-base', _up(Primitives.box(1.6, 0.12, 1.0), const Vec3(1.8, 0, 0)), const Color(0xFF3D4650), nStand, _t('A heavy base, a vertical rod and clamps hold the burette upright.', 'भारी आधार, ऊर्ध्वाधर छड़ और क्लैंप ब्यूरेट को सीधा थामते हैं।', 'ಭಾರವಾದ ತಳ, ಲಂಬ ಸಲಾಕೆ ಮತ್ತು ಕ್ಲ್ಯಾಂಪ್‌ಗಳು ಬ್ಯೂರೆಟ್ ಅನ್ನು ನೆಟ್ಟಗೆ ಹಿಡಿಯುತ್ತವೆ.')),
      p('stand-rod', _up(Primitives.cylinder(0.05, 4.3), const Vec3(1.45, 0.1, 0)), const Color(0xFF3D4650), nStand, _t('', '', '')),
      p('clamp', _at(Primitives.cylinder(0.04, 0.4), Mat4.translation(const Vec3(1.45, 3.2, 0)) * Mat4.rotationZ(math.pi / 2)), const Color(0xFF3D4650), nStand, _t('', '', '')),
      p('burette', _up(vessel([(0.12, 0.55), (0.12, 4.2), (0.14, 4.25)]), const Vec3(1.8, 0, 0)), glass, nBurette, _t('A long graduated tube with a tap, to run out exact volumes of liquid in titration.', 'नल वाली लंबी अंशांकित नली, अनुमापन में सटीक आयतन का तरल गिराने के लिए।', 'ನಲ್ಲಿಯಿರುವ ಉದ್ದ ಅಂಶಾಂಕಿತ ನಳಿಕೆ, ಟೈಟ್ರೇಶನ್‌ನಲ್ಲಿ ನಿಖರ ಗಾತ್ರದ ದ್ರವ ಬಿಡಲು.'), dbl: true),
      p('burette-liquid', _up(Primitives.cylinder(0.1, 2.6), const Vec3(1.8, 1.4, 0)), liquid, nBurette, _t('', '', '')),
      p('tap', _at(Primitives.cylinder(0.04, 0.5), Mat4.translation(const Vec3(1.55, 0.7, 0)) * Mat4.rotationZ(math.pi / 2)), const Color(0xFFD9822B), nBurette, _t('', '', '')),
      p('bunsen-base', _up(Primitives.cylinder(0.5, 0.12), const Vec3(3.4, 0, 0)), const Color(0xFF5A6570), nBunsen, _t('Burns gas with air let in at the collar: open collar gives a hot blue flame, closed gives a yellow sooty one.', 'कॉलर से हवा आने पर गैस जलती है: खुला कॉलर गर्म नीली लौ देता है, बंद कॉलर पीली कालिख वाली।', 'ಕಾಲರ್‌ನಿಂದ ಗಾಳಿ ಬಂದು ಅನಿಲ ಉರಿಯುತ್ತದೆ: ತೆರೆದ ಕಾಲರ್ ಬಿಸಿ ನೀಲಿ ಜ್ವಾಲೆ, ಮುಚ್ಚಿದ್ದು ಹಳದಿ ಹೊಗೆ ಜ್ವಾಲೆ ಕೊಡುತ್ತದೆ.')),
      p('bunsen-barrel', _up(Primitives.cylinder(0.12, 1.4), const Vec3(3.4, 0.12, 0)), const Color(0xFF8D99A6), nBunsen, _t('', '', '')),
      ModelPart(id: 'flame', mesh: _up(Primitives.cone(0.13, 0.7), const Vec3(3.4, 1.52, 0)), color: const Color(0xFF4A8CFF), name: nBunsen.of(lang), emissive: true, pickable: false),
    ];
    return Model3D(
      title: _t('Laboratory apparatus', 'प्रयोगशाला के उपकरण', 'ಪ್ರಯೋಗಾಲಯದ ಉಪಕರಣಗಳು').of(lang),
      caption: _t('Tap any piece to see what it is used for.', 'किसी भी उपकरण को छुएँ और उसका उपयोग जानें।', 'ಯಾವುದೇ ಉಪಕರಣವನ್ನು ಮುಟ್ಟಿ ಅದರ ಬಳಕೆ ತಿಳಿಯಿರಿ.').of(lang),
      subjects: const ['Chemistry'],
      parts: parts,
      labels: [
        Label3D(nBeaker.of(lang), const Vec3(-3.6, 1.3, 0), partId: 'beaker'),
        Label3D(nFlask.of(lang), const Vec3(-1.9, 1.8, 0), partId: 'flask'),
        Label3D(nTube.of(lang), const Vec3(-0.3, 1.7, 0), partId: 'tube'),
        Label3D(nBurette.of(lang), const Vec3(1.8, 4.4, 0), partId: 'burette'),
        Label3D(nStand.of(lang), const Vec3(1.0, 0.2, 0.5), partId: 'stand-base'),
        Label3D(nBunsen.of(lang), const Vec3(3.4, 2.3, 0), partId: 'bunsen-barrel'),
      ],
      initialPitch: 12,
      initialYaw: 0,
    );
  }

  // ───────────────────────────── globe ─────────────────────────────

  /// The globe on its stand, tilted 23.5°, with the equator, tropics and poles marked.
  static Model3D globe(String lang) {
    const tilt = 23.5 * math.pi / 180;
    final nEq = _t('Equator', 'भूमध्य रेखा', 'ಸಮಭಾಜಕ ವೃತ್ತ');
    final nNorth = _t('North Pole', 'उत्तरी ध्रुव', 'ಉತ್ತರ ಧ್ರುವ');
    final nSouth = _t('South Pole', 'दक्षिणी ध्रुव', 'ದಕ್ಷಿಣ ಧ್ರುವ');
    final nCancer = _t('Tropic of Cancer', 'कर्क रेखा', 'ಕರ್ಕಾಟಕ ಸಂಕ್ರಾಂತಿ ವೃತ್ತ');
    final nAxis = _t('Axis (tilted 23.5°)', 'अक्ष (23.5° झुका)', 'ಅಕ್ಷ (23.5° ವಾಲಿದೆ)');
    Vec3 tiltP(Vec3 p) => Mat4.rotationZ(-tilt).transformPoint(p);
    List<Vec3> circle(double lat) => [
          for (var i = 0; i < 64; i++)
            Vec3(1.04 * math.cos(lat) * math.cos(i * math.pi / 32), 1.04 * math.sin(lat), 1.04 * math.cos(lat) * math.sin(i * math.pi / 32)),
        ];
    return Model3D(
      title: _t('Globe', 'ग्लोब', 'ಭೂಗೋಳ').of(lang),
      caption: _t('Spin it to find places; the axis is tilted 23.5° and the Earth turns once a day.', 'घुमाकर स्थान खोजें; अक्ष 23.5° झुका है और पृथ्वी दिन में एक बार घूमती है।', 'ತಿರುಗಿಸಿ ಸ್ಥಳಗಳನ್ನು ಹುಡುಕಿ; ಅಕ್ಷ 23.5° ವಾಲಿದೆ ಮತ್ತು ಭೂಮಿ ದಿನಕ್ಕೆ ಒಂದು ಬಾರಿ ತಿರುಗುತ್ತದೆ.').of(lang),
      subjects: const ['Geography'],
      parts: [
        ModelPart(
          id: 'earth',
          mesh: Primitives.sphere(1, segments: 48, rings: 24),
          color: const Color(0xFFFFFFFF),
          texture: earthTexture(),
          name: _t('Earth', 'पृथ्वी', 'ಭೂಮಿ').of(lang),
          description: _t('Land and ocean shown on a simple map.', 'सरल नक्शे पर भूमि और महासागर।', 'ಸರಳ ನಕ್ಷೆಯಲ್ಲಿ ಭೂಮಿ ಮತ್ತು ಸಾಗರ.').of(lang),
          motion: (t) => Mat4.rotationZ(-tilt) * Mat4.rotationY(t * 0.6),
        ),
        ModelPart(id: 'axis', mesh: Primitives.rod(tiltP(const Vec3(0, -1.35, 0)), tiltP(const Vec3(0, 1.35, 0)), 0.02), color: const Color(0xFF444444), name: nAxis.of(lang), pickable: false),
        ModelPart(id: 'base', mesh: _join([Primitives.cylinder(0.7, 0.1), _up(Primitives.cylinder(0.08, 0.6), const Vec3(0, 0.1, 0))]), color: const Color(0xFF6B4F3A), name: _t('Stand', 'स्टैंड', 'ಸ್ಟ್ಯಾಂಡ್').of(lang), pickable: false, motion: (_) => Mat4.translation(const Vec3(0, -1.65, 0))),
      ],
      labels: [
        Label3D(nNorth.of(lang), tiltP(const Vec3(0, 1.35, 0)), partId: 'earth'),
        Label3D(nSouth.of(lang), tiltP(const Vec3(0, -1.35, 0)), partId: 'earth'),
        Label3D(nAxis.of(lang), tiltP(const Vec3(0.05, 1.1, 0)) + const Vec3(0.2, 0, 0), partId: 'axis'),
        Label3D(nEq.of(lang), tiltP(const Vec3(1.04, 0, 0)), partId: 'earth', emphasis: true),
        Label3D(nCancer.of(lang), tiltP(Vec3(1.04 * math.cos(tilt), 1.04 * math.sin(tilt), 0)), partId: 'earth'),
      ],
      lines: [
        Line3D([for (final p in circle(0)) tiltP(p)], color: const Color(0xFFE23D3D), width: 2, closed: true),
        Line3D([for (final p in circle(tilt)) tiltP(p)], color: const Color(0xFFE2A13D), width: 1.5, dashed: true, closed: true),
        Line3D([for (final p in circle(-tilt)) tiltP(p)], color: const Color(0xFFE2A13D), width: 1.5, dashed: true, closed: true),
      ],
      animated: true,
      lightFixedInWorld: false,
      initialPitch: 10,
    );
  }

  // ───────────────────────────── landforms ─────────────────────────────

  /// A height-field patch of [size] units over [n] cells; [h] gives height and an optional water flag at (x, z).
  static Mesh _terrain(double size, int n, (double, bool) Function(double x, double z) at, Vec3 origin) {
    final b = MeshBuilder();
    int colour(double h, bool water) {
      if (water) return 0xFF3E8EDE;
      if (h < 0.15) return 0xFF6BAA56;
      if (h < 0.7) return 0xFF8DB35E;
      if (h < 1.3) return 0xFF9C7B54;
      if (h < 1.9) return 0xFF7B6A5C;
      return 0xFFF2F4F7;
    }

    for (var i = 0; i <= n; i++) {
      for (var j = 0; j <= n; j++) {
        final x = (i / n - 0.5) * size, z = (j / n - 0.5) * size;
        final (h, w) = at(x, z);
        const e = 0.05;
        final nx = at(x - e, z).$1 - at(x + e, z).$1, nz = at(x, z - e).$1 - at(x, z + e).$1;
        b.addVertex(origin + Vec3(x, h, z), normal: Vec3(nx, 2 * e, nz).normalized, color: colour(h, w));
      }
    }
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        final a = i * (n + 1) + j;
        b.addQuad(a, a + 1, a + n + 2, a + n + 1);
      }
    }
    // A base so the block has sides.
    final sides = Primitives.box(size, 0.05, size);
    b.addMesh(sides, Mat4.translation(origin + const Vec3(0, -0.06, 0)));
    return b.build();
  }

  /// Mountain, valley, plateau and river delta on one height map each, side by side.
  static Model3D landforms(String lang) {
    const s = 3.0;
    double smooth(double e0, double e1, double x) {
      final t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
      return t * t * (3 - 2 * t);
    }

    (double, bool) mountain(double x, double z) {
      final d = math.sqrt(x * x + z * z);
      final ridge = 0.12 * math.sin(x * 5) * math.cos(z * 4);
      return (math.max(0, 2.3 * math.pow(math.max(0, 1 - d / 1.5), 1.4) + ridge * smooth(1.4, 0.3, d)), false);
    }

    (double, bool) valley(double x, double z) {
      final river = (x - 0.25 * math.sin(z * 2)).abs();
      final h = 0.05 + 1.1 * smooth(0.0, 1.5, river);
      return (h, river < 0.12);
    }

    (double, bool) plateau(double x, double z) {
      final edge = math.max(x.abs(), z.abs());
      return (0.15 + 1.2 * (1 - smooth(0.85, 1.25, edge)), false);
    }

    (double, bool) delta(double x, double z) {
      var water = false;
      // Channels fan out from the river mouth at the top (z = -1.5) towards the sea at the bottom.
      final t = (z + 1.5) / 3.0;
      for (final k in [-1.0, -0.5, 0.0, 0.5, 1.0]) {
        final cx = k * t * 1.1 + 0.08 * math.sin(z * 6 + k);
        if ((x - cx).abs() < 0.07 + 0.03 * t && t < 0.88) water = true;
      }
      final land = t < 0.88 ? 0.1 : 0.0;
      return (land, water || t >= 0.88);
    }

    final defs = [
      ('mountain', mountain, const Vec3(-1.8, 0, -1.8), _t('Mountain', 'पर्वत', 'ಪರ್ವತ'), _t('A high, steep landform with a peak; snow lies on the top.', 'चोटी वाली ऊँची, खड़ी भू-आकृति; शिखर पर बर्फ़ होती है।', 'ಶಿಖರವಿರುವ ಎತ್ತರದ, ಕಡಿದಾದ ಭೂರೂಪ; ತುದಿಯಲ್ಲಿ ಹಿಮವಿರುತ್ತದೆ.')),
      ('valley', valley, const Vec3(1.8, 0, -1.8), _t('Valley with river', 'नदी वाली घाटी', 'ನದಿಯಿರುವ ಕಣಿವೆ'), _t('Low land between hills; a river cut it over a long time.', 'पहाड़ियों के बीच निचली भूमि; नदी ने इसे लंबे समय में काटा।', 'ಬೆಟ್ಟಗಳ ನಡುವಿನ ತಗ್ಗು ನೆಲ; ನದಿ ಬಹುಕಾಲದಲ್ಲಿ ಇದನ್ನು ಕೊರೆದಿದೆ.')),
      ('plateau', plateau, const Vec3(-1.8, 0, 1.8), _t('Plateau', 'पठार', 'ಪ್ರಸ್ಥಭೂಮಿ'), _t('A high, flat-topped land with steep sides, like the Deccan Plateau.', 'ऊँची, समतल सतह और खड़े किनारों वाली भूमि, जैसे दक्कन का पठार।', 'ಎತ್ತರದ, ಸಮತಟ್ಟಾದ ಮೇಲ್ಮೈ ಮತ್ತು ಕಡಿದಾದ ಬದಿಗಳ ನೆಲ, ಡೆಕ್ಕನ್ ಪ್ರಸ್ಥಭೂಮಿಯಂತೆ.')),
      ('delta', delta, const Vec3(1.8, 0, 1.8), _t('River delta', 'नदी का डेल्टा', 'ನದಿ ಮುಖಜ ಭೂಮಿ'), _t('Where a river splits into channels and drops its silt before meeting the sea, like the Sundarbans.', 'जहाँ नदी समुद्र से मिलने से पहले धाराओं में बँटकर गाद जमा करती है, जैसे सुंदरवन।', 'ಸಮುದ್ರ ಸೇರುವ ಮುನ್ನ ನದಿ ಕವಲುಗಳಾಗಿ ಒಡೆದು ಹೂಳು ಬಿಡುವ ಸ್ಥಳ, ಸುಂದರಬನದಂತೆ.')),
    ];
    return Model3D(
      title: _t('Landforms', 'भू-आकृतियाँ', 'ಭೂರೂಪಗಳು').of(lang),
      caption: _t('Four landforms on height maps: tap one to read about it.', 'ऊँचाई नक्शों पर चार भू-आकृतियाँ: पढ़ने के लिए एक को छुएँ।', 'ಎತ್ತರ ನಕ್ಷೆಗಳ ಮೇಲೆ ನಾಲ್ಕು ಭೂರೂಪಗಳು: ತಿಳಿಯಲು ಒಂದನ್ನು ಮುಟ್ಟಿ.').of(lang),
      subjects: const ['Geography'],
      parts: [for (final (id, f, o, n, d) in defs) ModelPart(id: id, mesh: _terrain(s, 28, f, o), color: const Color(0xFFFFFFFF), name: n.of(lang), description: d.of(lang))],
      labels: [for (final (id, _, o, n, _) in defs) Label3D(n.of(lang), o + Vec3(0, id == 'mountain' ? 2.6 : 1.6, 0), partId: id)],
      initialPitch: 35,
    );
  }

  // ───────────────────────────── biology ─────────────────────────────

  /// A coronavirus-like virus: protein coat, spikes and the RNA inside (not to scale: real ones are about 100 nm).
  static Model3D virus(String lang) {
    final nCoat = _t('Envelope', 'आवरण', 'ಹೊದಿಕೆ');
    final nSpike = _t('Spike protein', 'स्पाइक प्रोटीन', 'ಸ್ಪೈಕ್ ಪ್ರೋಟೀನ್');
    final nRna = _t('RNA genome', 'आरएनए जीनोम', 'ಆರ್‌ಎನ್‌ಎ ಜೀನೋಮ್');
    const count = 42;
    final spikes = <Mesh>[];
    for (var i = 0; i < count; i++) {
      final y = 1 - 2 * (i + 0.5) / count;
      final r = math.sqrt(1 - y * y);
      final a = i * math.pi * (3 - math.sqrt(5));
      final d = Vec3(r * math.cos(a), y, r * math.sin(a));
      spikes.add(Primitives.rod(d * 0.95, d * 1.4, 0.035, segments: 8));
      spikes.add(Primitives.sphere(0.1, center: d * 1.45, segments: 10, rings: 6));
    }
    final rna = <Mesh>[];
    for (var i = 0; i < 60; i++) {
      final t = i / 59 * 6 * math.pi;
      rna.add(Primitives.sphere(0.07, center: Vec3(0.5 * math.cos(t) * math.sin(i * 0.3), 0.5 * math.cos(i * 0.21), 0.5 * math.sin(t) * 0.8), segments: 8, rings: 5));
    }
    return Model3D(
      title: _t('Virus', 'विषाणु', 'ವೈರಸ್').of(lang),
      caption: _t('A simplified coronavirus-like particle. Viruses are not cells: they need a host cell to multiply.', 'सरलीकृत कोरोनावायरस जैसा कण। विषाणु कोशिका नहीं हैं: बढ़ने के लिए उन्हें पोषी कोशिका चाहिए।', 'ಸರಳೀಕೃತ ಕೊರೊನಾವೈರಸ್ ತರಹದ ಕಣ. ವೈರಸ್ ಕೋಶವಲ್ಲ: ಹೆಚ್ಚಲು ಅದಕ್ಕೆ ಆತಿಥೇಯ ಕೋಶ ಬೇಕು.').of(lang),
      subjects: const ['Biology'],
      parts: [
        ModelPart(id: 'coat', mesh: Primitives.sphere(0.95, segments: 32, rings: 16), color: const Color(0xCCD0636F), name: nCoat.of(lang), doubleSided: true, description: _t('A fatty layer with proteins set in it, that wraps the genome.', 'वसा की परत जिसमें प्रोटीन जड़े होते हैं और जो जीनोम को लपेटती है।', 'ಪ್ರೋಟೀನ್‌ಗಳು ಜೋಡಿಸಿದ ಕೊಬ್ಬಿನ ಪದರ; ಜೀನೋಮ್ ಅನ್ನು ಸುತ್ತಿರುತ್ತದೆ.').of(lang)),
        ModelPart(id: 'spikes', mesh: _join(spikes), color: const Color(0xFF8E3B46), name: nSpike.of(lang), description: _t('Lock onto receptors on the host cell so the virus can get in.', 'पोषी कोशिका के रिसेप्टरों से जुड़कर विषाणु को भीतर जाने देते हैं।', 'ಆತಿಥೇಯ ಕೋಶದ ಗ್ರಾಹಕಗಳಿಗೆ ಹಿಡಿದು ವೈರಸ್ ಒಳಗೆ ಹೋಗಲು ಅನುವು ಮಾಡುತ್ತವೆ.').of(lang)),
        ModelPart(id: 'rna', mesh: _join(rna), color: const Color(0xFFF2C14E), name: nRna.of(lang), description: _t('The instructions the virus uses to make copies of itself inside the host.', 'वे निर्देश जिनसे विषाणु पोषी के भीतर अपनी प्रतियाँ बनाता है।', 'ವೈರಸ್ ಆತಿಥೇಯದೊಳಗೆ ತನ್ನ ಪ್ರತಿಗಳನ್ನು ಮಾಡಲು ಬಳಸುವ ಸೂಚನೆಗಳು.').of(lang)),
      ],
      labels: [
        Label3D(nSpike.of(lang), const Vec3(1.3, 0.6, 0.3), partId: 'spikes'),
        Label3D(nCoat.of(lang), const Vec3(-0.9, 0.5, 0.5), partId: 'coat'),
        Label3D(nRna.of(lang), const Vec3(0, 0.2, 0.2), partId: 'rna'),
      ],
      initialPitch: 15,
    );
  }

  /// Adult teeth of the upper jaw on a gum arch: incisors, canines, premolars and molars.
  static Model3D teeth(String lang) {
    final kinds = [
      ('incisor', _t('Incisors (cut)', 'कृंतक (काटने के लिए)', 'ಕತ್ತರಿಸುವ ಹಲ್ಲುಗಳು'), _t('Sharp and flat, to bite and cut food. 4 in each jaw.', 'तीखे और चपटे, भोजन काटने के लिए। हर जबड़े में 4।', 'ಚೂಪಾದ ಮತ್ತು ಚಪ್ಪಟೆ, ಆಹಾರ ಕಚ್ಚಿ ಕತ್ತರಿಸಲು. ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4.'), const Color(0xFFF7F2E5)),
      ('canine', _t('Canines (tear)', 'रदनक (फाड़ने के लिए)', 'ಕೋರೆ ಹಲ್ಲುಗಳು'), _t('Pointed, to tear food. 2 in each jaw.', 'नुकीले, भोजन फाड़ने के लिए। हर जबड़े में 2।', 'ಮೊನಚಾದ, ಆಹಾರ ಹರಿಯಲು. ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 2.'), const Color(0xFFF2EBD8)),
      ('premolar', _t('Premolars (crush)', 'अग्रचर्वणक', 'ಪ್ರೀಮೋಲಾರ್‌ಗಳು'), _t('Two cusps, to crush and grind. 4 in each jaw.', 'दो नुकीली सतहें, कुचलने और पीसने के लिए। हर जबड़े में 4।', 'ಎರಡು ಉಬ್ಬುಗಳು, ಜಜ್ಜಿ ಅರೆಯಲು. ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4.'), const Color(0xFFEFE6D0)),
      ('molar', _t('Molars (grind)', 'चर्वणक (पीसने के लिए)', 'ಅರೆ ಹಲ್ಲುಗಳು'), _t('Broad, to grind food. 6 in each jaw.', 'चौड़े, भोजन पीसने के लिए। हर जबड़े में 6।', 'ಅಗಲ, ಆಹಾರ ಅರೆಯಲು. ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 6.'), const Color(0xFFEBE0C6)),
    ];
    // 16 teeth from the left back to the right back along a horseshoe, by kind.
    const order = ['molar', 'molar', 'molar', 'premolar', 'premolar', 'canine', 'incisor', 'incisor', 'incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'molar'];
    final byKind = {for (final k in kinds) k.$1: <Mesh>[]};
    final gum = <Mesh>[];
    for (var i = 0; i < order.length; i++) {
      final a = math.pi * (0.08 + 0.84 * i / (order.length - 1)); // 0 right back .. pi left back
      final x = 1.5 * math.cos(a), z = -1.1 * math.sin(a) + 0.4;
      final face = math.atan2(-x * 0.7, -(z - 0.2));
      final rot = Mat4.translation(Vec3(x, 0, z)) * Mat4.rotationY(face);
      final k = order[i];
      final m = switch (k) {
        'incisor' => Primitives.frustum(0.12, 0.09, 0.45, segments: 4),
        'canine' => Primitives.cone(0.14, 0.55, segments: 8),
        'premolar' => Primitives.frustum(0.17, 0.14, 0.38, segments: 8),
        _ => Primitives.frustum(0.24, 0.2, 0.34, segments: 8),
      };
      byKind[k]!.add(_at(m, rot * Mat4.translation(const Vec3(0, -0.5, 0)) * (k == 'incisor' ? _scale(1.6, 1, 0.8) : Mat4.identity())));
      gum.add(_at(Primitives.sphere(0.22, segments: 8, rings: 5), Mat4.translation(Vec3(x, -0.55, z)) * _scale(1, 0.7, 1)));
    }
    return Model3D(
      title: _t('Teeth', 'दाँत', 'ಹಲ್ಲುಗಳು').of(lang),
      caption: _t('Simplified upper jaw of an adult (16 teeth): four kinds, each shaped for its job.', 'वयस्क का सरलीकृत ऊपरी जबड़ा (16 दाँत): चार प्रकार, हर एक अपने काम के आकार का।', 'ವಯಸ್ಕರ ಸರಳೀಕೃತ ಮೇಲಿನ ದವಡೆ (16 ಹಲ್ಲುಗಳು): ನಾಲ್ಕು ವಿಧ, ಪ್ರತಿಯೊಂದು ತನ್ನ ಕೆಲಸಕ್ಕೆ ತಕ್ಕ ಆಕಾರ.').of(lang),
      subjects: const ['Biology'],
      parts: [
        ModelPart(id: 'gum', mesh: _join(gum), color: const Color(0xFFD97B84), name: _t('Gum', 'मसूड़ा', 'ವಸಡು').of(lang), pickable: false),
        for (final k in kinds) ModelPart(id: k.$1, mesh: _join(byKind[k.$1]!), color: k.$4, name: k.$2.of(lang), description: k.$3.of(lang)),
      ],
      labels: [
        Label3D(kinds[0].$2.of(lang), const Vec3(0, -0.2, 1.1), partId: 'incisor'),
        Label3D(kinds[1].$2.of(lang), const Vec3(0.8, -0.2, 1.0), partId: 'canine'),
        Label3D(kinds[2].$2.of(lang), const Vec3(1.25, -0.2, 0.7), partId: 'premolar'),
        Label3D(kinds[3].$2.of(lang), const Vec3(1.5, -0.2, -0.2), partId: 'molar'),
      ],
      initialPitch: 50,
      initialYaw: 0,
    );
  }

  /// A simplified human skull: cranium, face, eye sockets, nose, upper and lower jaw.
  static Model3D skull(String lang) {
    const bone = Color(0xFFEDE6D3);
    final nCranium = _t('Cranium', 'कपाल', 'ಕಪಾಲ');
    final nJaw = _t('Mandible (lower jaw)', 'निचला जबड़ा', 'ಕೆಳದವಡೆ');
    final nMax = _t('Maxilla (upper jaw)', 'ऊपरी जबड़ा', 'ಮೇಲಿನ ದವಡೆ');
    final nOrbit = _t('Eye sockets', 'नेत्र कोटर', 'ಕಣ್ಣಿನ ಗೂಡುಗಳು');
    final nNose = _t('Nasal opening', 'नासा छिद्र', 'ಮೂಗಿನ ರಂಧ್ರ');
    return Model3D(
      title: _t('Human skull', 'मानव खोपड़ी', 'ಮಾನವ ತಲೆಬುರುಡೆ').of(lang),
      caption: _t('A simplified skull. The cranium protects the brain; the jaw is the only bone of the head that moves.', 'सरलीकृत खोपड़ी। कपाल मस्तिष्क की रक्षा करता है; जबड़ा सिर की एकमात्र चलने वाली हड्डी है।', 'ಸರಳೀಕೃತ ತಲೆಬುರುಡೆ. ಕಪಾಲ ಮಿದುಳನ್ನು ಕಾಯುತ್ತದೆ; ದವಡೆ ತಲೆಯಲ್ಲಿ ಚಲಿಸುವ ಏಕೈಕ ಮೂಳೆ.').of(lang),
      subjects: const ['Biology'],
      parts: [
        ModelPart(id: 'cranium', mesh: _at(Primitives.sphere(1, segments: 32, rings: 16), Mat4.translation(const Vec3(0, 0.3, -0.1)) * _scale(0.95, 1.0, 1.1)), color: bone, name: nCranium.of(lang), description: _t('Eight fused bones form a hard case around the brain.', 'आठ जुड़ी हड्डियाँ मस्तिष्क के चारों ओर कठोर खोल बनाती हैं।', 'ಎಂಟು ಸೇರಿದ ಮೂಳೆಗಳು ಮಿದುಳಿನ ಸುತ್ತ ಗಟ್ಟಿ ಕವಚ ಮಾಡುತ್ತವೆ.').of(lang)),
        ModelPart(id: 'maxilla', mesh: _at(Primitives.sphere(0.6, segments: 20, rings: 10), Mat4.translation(const Vec3(0, -0.45, 0.62)) * _scale(0.95, 0.8, 0.8)), color: bone, name: nMax.of(lang), description: _t('Holds the upper teeth and forms the cheek and roof of the mouth.', 'ऊपरी दाँतों को थामता है और गाल तथा तालु बनाता है।', 'ಮೇಲಿನ ಹಲ್ಲುಗಳನ್ನು ಹಿಡಿದು ಕೆನ್ನೆ ಮತ್ತು ಬಾಯಿಯ ಛಾವಣಿ ರಚಿಸುತ್ತದೆ.').of(lang)),
        ModelPart(id: 'orbits', mesh: _join([Primitives.sphere(0.2, center: const Vec3(-0.38, -0.05, 0.85), segments: 14, rings: 8), Primitives.sphere(0.2, center: const Vec3(0.38, -0.05, 0.85), segments: 14, rings: 8)]), color: const Color(0xFF2B2B2B), name: nOrbit.of(lang), description: _t('Deep sockets that protect the eyes.', 'गहरे गड्ढे जो आँखों की रक्षा करते हैं।', 'ಕಣ್ಣುಗಳನ್ನು ಕಾಯುವ ಆಳವಾದ ಗೂಡುಗಳು.').of(lang)),
        ModelPart(id: 'nose', mesh: _at(Primitives.cone(0.14, 0.35), Mat4.translation(const Vec3(0, -0.55, 1.0)) * Mat4.rotationX(math.pi)), color: const Color(0xFF2B2B2B), name: nNose.of(lang)),
        ModelPart(
          id: 'mandible',
          mesh: _join([_at(Primitives.box(1.15, 0.22, 0.2), Mat4.translation(const Vec3(0, -1.05, 0.95))), _at(Primitives.box(0.12, 0.7, 0.5), Mat4.translation(const Vec3(-0.58, -1.0, 0.5))), _at(Primitives.box(0.12, 0.7, 0.5), Mat4.translation(const Vec3(0.58, -1.0, 0.5)))]),
          color: bone,
          name: nJaw.of(lang),
          description: _t('The lower jaw hinges at the ear and moves to chew and speak.', 'निचला जबड़ा कान के पास जुड़ा है और चबाने तथा बोलने में चलता है।', 'ಕೆಳದವಡೆ ಕಿವಿಯ ಬಳಿ ಕೀಲಿನಂತೆ ಜೋಡಿಸಿ ಜಗಿಯಲು ಮತ್ತು ಮಾತನಾಡಲು ಚಲಿಸುತ್ತದೆ.').of(lang),
        ),
      ],
      labels: [
        Label3D(nCranium.of(lang), const Vec3(0, 1.3, 0), partId: 'cranium'),
        Label3D(nOrbit.of(lang), const Vec3(-0.6, -0.05, 1.0), partId: 'orbits'),
        Label3D(nNose.of(lang), const Vec3(0.3, -0.6, 1.1), partId: 'nose'),
        Label3D(nMax.of(lang), const Vec3(0.7, -0.5, 0.8), partId: 'maxilla'),
        Label3D(nJaw.of(lang), const Vec3(0, -1.2, 1.0), partId: 'mandible'),
      ],
      initialPitch: 5,
      initialYaw: 0,
    );
  }

  // ───────────────────────────── monuments (simplified) ─────────────────────────────

  static LocalText get _simplified => _t('Simplified model, not to scale.', 'सरलीकृत मॉडल, पैमाने के अनुसार नहीं।', 'ಸರಳೀಕೃತ ಮಾದರಿ, ಅಳತೆಗೆ ತಕ್ಕಂತೆ ಅಲ್ಲ.');

  static Mesh _dome(double r, double h, {double y = 0}) => _at(Primitives.lathe([for (var i = 0; i <= 10; i++) (r * math.cos(i / 10 * math.pi / 2) * (1 + 0.12 * math.sin(i / 10 * math.pi)), h * math.sin(i / 10 * math.pi / 2))], segments: 32), Mat4.translation(Vec3(0, y, 0)));

  static Model3D tajMahal(String lang) {
    const marble = Color(0xFFF4F1EA), plinthC = Color(0xFFD8C9A8);
    final nDome = _t('Main dome', 'मुख्य गुंबद', 'ಮುಖ್ಯ ಗುಮ್ಮಟ');
    final nMinaret = _t('Minaret', 'मीनार', 'ಮಿನಾರ್');
    final nPlinth = _t('Plinth', 'चबूतरा', 'ಪೀಠ');
    final nTomb = _t('Main tomb', 'मुख्य मकबरा', 'ಮುಖ್ಯ ಸಮಾಧಿ');
    final nChhatri = _t('Chhatri (small dome)', 'छतरी', 'ಛತ್ರಿ (ಸಣ್ಣ ಗುಮ್ಮಟ)');
    final minarets = <Mesh>[], caps = <Mesh>[], chhatris = <Mesh>[];
    for (final sx in [-1.0, 1.0]) {
      for (final sz in [-1.0, 1.0]) {
        minarets.add(_up(Primitives.frustum(0.14, 0.11, 2.4, segments: 16), Vec3(sx * 2.2, 0.5, sz * 2.2)));
        for (final y in [1.2, 2.0]) {
          minarets.add(_up(Primitives.cylinder(0.2, 0.06), Vec3(sx * 2.2, y, sz * 2.2)));
        }
        caps.add(_dome(0.2, 0.3, y: 2.9).let((m) => _up(m, Vec3(sx * 2.2, 0, sz * 2.2))));
        chhatris.add(_up(_dome(0.28, 0.32, y: 1.9), Vec3(sx * 0.85, 0, sz * 0.85)));
        chhatris.add(_up(Primitives.cylinder(0.05, 0.4), Vec3(sx * 0.85, 1.5, sz * 0.85)));
      }
    }
    return Model3D(
      title: _t('Taj Mahal, Agra', 'ताजमहल, आगरा', 'ತಾಜ್ ಮಹಲ್, ಆಗ್ರಾ').of(lang),
      caption: '${_t('A white marble tomb built by Shah Jahan (1632 to 1653). ', 'शाहजहाँ द्वारा बनवाया गया सफ़ेद संगमरमर का मकबरा (1632 से 1653)। ', 'ಷಾಜಹಾನ್ ಕಟ್ಟಿಸಿದ ಬಿಳಿ ಅಮೃತಶಿಲೆಯ ಸಮಾಧಿ (1632 ರಿಂದ 1653). ').of(lang)}${_simplified.of(lang)}',
      subjects: const ['History'],
      parts: [
        ModelPart(id: 'plinth', mesh: _up(Primitives.box(6.4, 0.5, 6.4), Vec3.zero), color: plinthC, name: nPlinth.of(lang), description: _t('A raised platform of red sandstone and marble.', 'लाल बलुआ पत्थर और संगमरमर का ऊँचा चबूतरा।', 'ಕೆಂಪು ಮರಳುಗಲ್ಲು ಮತ್ತು ಅಮೃತಶಿಲೆಯ ಎತ್ತರದ ವೇದಿಕೆ.').of(lang)),
        ModelPart(id: 'tomb', mesh: _up(Primitives.box(2.8, 1.7, 2.8), const Vec3(0, 0.5, 0)), color: marble, name: nTomb.of(lang), description: _t('A square building with cut corners and four arched entrances.', 'कटे कोनों और चार मेहराबदार द्वारों वाली वर्गाकार इमारत।', 'ಕತ್ತರಿಸಿದ ಮೂಲೆಗಳು ಮತ್ತು ನಾಲ್ಕು ಕಮಾನು ಬಾಗಿಲುಗಳ ಚೌಕಾಕಾರದ ಕಟ್ಟಡ.').of(lang)),
        ModelPart(id: 'drum', mesh: _up(Primitives.cylinder(0.85, 0.5), const Vec3(0, 2.2, 0)), color: marble, name: nDome.of(lang), pickable: false),
        ModelPart(id: 'dome', mesh: _dome(0.95, 1.2, y: 2.7), color: marble, name: nDome.of(lang), description: _t('The onion dome is about 35 m tall in the real building, topped by a gold finial.', 'असली इमारत में प्याज़ के आकार का गुंबद लगभग 35 मीटर ऊँचा है, जिसके ऊपर सोने का कलश है।', 'ನಿಜವಾದ ಕಟ್ಟಡದಲ್ಲಿ ಈರುಳ್ಳಿ ಆಕಾರದ ಗುಮ್ಮಟ ಸುಮಾರು 35 ಮೀ ಎತ್ತರ, ಮೇಲೆ ಚಿನ್ನದ ಕಲಶ.').of(lang)),
        ModelPart(id: 'finial', mesh: _up(Primitives.cone(0.06, 0.6), const Vec3(0, 3.85, 0)), color: const Color(0xFFD4A82B), name: nDome.of(lang), pickable: false),
        ModelPart(id: 'chhatris', mesh: _join(chhatris), color: marble, name: nChhatri.of(lang)),
        ModelPart(id: 'minarets', mesh: _join(minarets), color: marble, name: nMinaret.of(lang), description: _t('Four minarets lean slightly outward so that they fall away from the tomb in an earthquake.', 'चारों मीनारें थोड़ी बाहर की ओर झुकी हैं ताकि भूकंप में मकबरे से दूर गिरें।', 'ನಾಲ್ಕು ಮಿನಾರ್‌ಗಳು ಸ್ವಲ್ಪ ಹೊರಗೆ ವಾಲಿವೆ, ಭೂಕಂಪದಲ್ಲಿ ಸಮಾಧಿಯಿಂದ ದೂರ ಬೀಳಲಿ ಎಂದು.').of(lang)),
        ModelPart(id: 'caps', mesh: _join(caps), color: marble, name: nMinaret.of(lang), pickable: false),
      ],
      labels: [
        Label3D(nDome.of(lang), const Vec3(0, 4.0, 0), partId: 'dome', emphasis: true),
        Label3D(nTomb.of(lang), const Vec3(0, 1.4, 1.5), partId: 'tomb'),
        Label3D(nMinaret.of(lang), const Vec3(2.2, 3.3, 2.2), partId: 'minarets'),
        Label3D(nChhatri.of(lang), const Vec3(0.85, 2.3, 0.85), partId: 'chhatris'),
        Label3D(nPlinth.of(lang), const Vec3(0, 0.1, 3.3), partId: 'plinth'),
      ],
      initialPitch: 12,
    );
  }

  static Model3D qutubMinar(String lang) {
    const red = Color(0xFFB5503A), buff = Color(0xFFD9B27A), marble = Color(0xFFEDE3CF);
    // Five storeys: radius shrinks, each ends in a balcony ring.
    final tiers = <(double, double, double, Color)>[(0.9, 0.7, 2.0, red), (0.7, 0.58, 1.7, red), (0.58, 0.5, 1.3, buff), (0.5, 0.44, 0.9, marble), (0.44, 0.4, 0.8, buff)];
    final parts = <ModelPart>[];
    final labels = <Label3D>[];
    var y = 0.0;
    final names = [_t('Storey 1 (red sandstone)', 'पहली मंज़िल (लाल बलुआ पत्थर)', 'ಮೊದಲ ಅಂತಸ್ತು (ಕೆಂಪು ಮರಳುಗಲ್ಲು)'), _t('Storey 2 (red sandstone)', 'दूसरी मंज़िल (लाल बलुआ पत्थर)', 'ಎರಡನೇ ಅಂತಸ್ತು (ಕೆಂಪು ಮರಳುಗಲ್ಲು)'), _t('Storey 3 (red sandstone)', 'तीसरी मंज़िल (लाल बलुआ पत्थर)', 'ಮೂರನೇ ಅಂತಸ್ತು (ಕೆಂಪು ಮರಳುಗಲ್ಲು)'), _t('Storey 4 (marble)', 'चौथी मंज़िल (संगमरमर)', 'ನಾಲ್ಕನೇ ಅಂತಸ್ತು (ಅಮೃತಶಿಲೆ)'), _t('Storey 5 (marble and sandstone)', 'पाँचवीं मंज़िल (संगमरमर और बलुआ पत्थर)', 'ಐದನೇ ಅಂತಸ್ತು (ಅಮೃತಶಿಲೆ ಮತ್ತು ಮರಳುಗಲ್ಲು)')];
    for (var i = 0; i < tiers.length; i++) {
      final (r0, r1, h, c) = tiers[i];
      parts.add(ModelPart(
        id: 'tier$i',
        mesh: _join([_up(Primitives.lathe([for (var k = 0; k <= 12; k++) (((r0 + (r1 - r0) * k / 12) * (1 + 0.06 * math.cos(k * math.pi * 2 / 3))), h * k / 12)], segments: 24), Vec3(0, y, 0)), _up(Primitives.cylinder(r1 + 0.16, 0.08), Vec3(0, y + h - 0.02, 0))]),
        color: c,
        name: names[i].of(lang),
        description: i == 0 ? _t('The tower was begun by Qutb-ud-din Aibak in 1199 and finished by Iltutmish and later Firoz Shah Tughlaq. It is about 73 m tall, with a 379-step spiral stair.', 'मीनार की शुरुआत 1199 में कुतुबुद्दीन ऐबक ने की और इल्तुतमिश तथा बाद में फ़िरोज़ शाह तुग़लक़ ने पूरी की। यह लगभग 73 मीटर ऊँची है, 379 सीढ़ियाँ।', 'ಗೋಪುರವನ್ನು 1199ರಲ್ಲಿ ಕುತುಬುದ್ದೀನ್ ಐಬಕ್ ಆರಂಭಿಸಿ ಇಲ್ತುತ್ಮಿಶ್ ಹಾಗೂ ನಂತರ ಫಿರೋಜ್ ಷಾ ತುಘಲಕ್ ಪೂರ್ಣಗೊಳಿಸಿದರು. ಸುಮಾರು 73 ಮೀ ಎತ್ತರ, 379 ಮೆಟ್ಟಿಲುಗಳು.').of(lang) : _t('Each storey ends in a balcony held up by carved brackets.', 'हर मंज़िल एक छज्जे पर समाप्त होती है जिसे नक्काशीदार कोष्ठक थामते हैं।', 'ಪ್ರತಿ ಅಂತಸ್ತು ಕೆತ್ತಿದ ಆಧಾರಗಳಿಂದ ಹಿಡಿದ ಬಾಲ್ಕನಿಯಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ.').of(lang),
      ));
      labels.add(Label3D('${i + 1}', Vec3(r1 + 0.2, y + h / 2, 0), partId: 'tier$i'));
      y += h;
    }
    parts.add(ModelPart(id: 'cap', mesh: _up(_dome(0.34, 0.4), Vec3(0, y, 0)), color: buff, name: _t('Cupola', 'शिखर', 'ಶಿಖರ').of(lang), pickable: false));
    parts.add(ModelPart(id: 'base', mesh: _up(Primitives.cylinder(1.2, 0.2), const Vec3(0, -0.2, 0)), color: const Color(0xFF8D8A80), name: _t('Base', 'आधार', 'ತಳ').of(lang), pickable: false));
    return Model3D(
      title: _t('Qutub Minar, Delhi', 'क़ुतुब मीनार, दिल्ली', 'ಕುತುಬ್ ಮಿನಾರ್, ದೆಹಲಿ').of(lang),
      caption: '${_t('The tallest brick minaret in the world, a UNESCO World Heritage Site. ', 'दुनिया की सबसे ऊँची ईंट की मीनार, यूनेस्को विश्व धरोहर। ', 'ಜಗತ್ತಿನ ಅತಿ ಎತ್ತರದ ಇಟ್ಟಿಗೆ ಮಿನಾರ್, ಯುನೆಸ್ಕೊ ವಿಶ್ವ ಪರಂಪರೆ ತಾಣ. ').of(lang)}${_simplified.of(lang)}',
      subjects: const ['History'],
      parts: parts,
      labels: labels,
      initialPitch: 8,
    );
  }

  static Model3D indiaGate(String lang) {
    const stone = Color(0xFFC79A6B), dark = Color(0xFF9A7650);
    final nArch = _t('Arch', 'मेहराब', 'ಕಮಾನು');
    final nCornice = _t('Cornice with inscription', 'अभिलेख वाला कंगूरा', 'ಶಾಸನವಿರುವ ಕಾರ್ನಿಸ್');
    final nBase = _t('Stepped base', 'सीढ़ीदार आधार', 'ಮೆಟ್ಟಿಲಿನ ತಳ');
    final nFlame = _t('Eternal flame (Amar Jawan Jyoti)', 'अमर जवान ज्योति', 'ಅಮರ್ ಜವಾನ್ ಜ್ಯೋತಿ');
    return Model3D(
      title: _t('India Gate, New Delhi', 'इंडिया गेट, नई दिल्ली', 'ಇಂಡಿಯಾ ಗೇಟ್, ನವದೆಹಲಿ').of(lang),
      caption: '${_t('A war memorial, 42 m tall, to Indian soldiers of the First World War. ', 'प्रथम विश्व युद्ध के भारतीय सैनिकों का 42 मीटर ऊँचा स्मारक। ', 'ಮೊದಲ ವಿಶ್ವಯುದ್ಧದ ಭಾರತೀಯ ಸೈನಿಕರ 42 ಮೀ ಎತ್ತರದ ಸ್ಮಾರಕ. ').of(lang)}${_simplified.of(lang)}',
      subjects: const ['History'],
      parts: [
        ModelPart(id: 'base', mesh: _join([_up(Primitives.box(5.6, 0.25, 3.6), Vec3.zero), _up(Primitives.box(5.0, 0.25, 3.0), const Vec3(0, 0.25, 0)), _up(Primitives.box(4.5, 0.25, 2.5), const Vec3(0, 0.5, 0))]), color: dark, name: nBase.of(lang)),
        ModelPart(id: 'piers', mesh: _join([_up(Primitives.box(1.15, 3.0, 2.0), const Vec3(-1.6, 0.75, 0)), _up(Primitives.box(1.15, 3.0, 2.0), const Vec3(1.6, 0.75, 0))]), color: stone, name: _t('Pylons', 'स्तंभ', 'ಸ್ತಂಭಗಳು').of(lang)),
        ModelPart(id: 'arch', mesh: _up(Primitives.box(4.4, 0.9, 2.0), const Vec3(0, 3.0, 0)), color: stone, name: nArch.of(lang), description: _t('A round arch 10 m wide spans the road between the two pylons.', 'दो स्तंभों के बीच 10 मीटर चौड़ी गोल मेहराब सड़क को पाटती है।', 'ಎರಡು ಸ್ತಂಭಗಳ ನಡುವೆ 10 ಮೀ ಅಗಲದ ಕಮಾನು ರಸ್ತೆಯನ್ನು ಹಾದುಹೋಗುತ್ತದೆ.').of(lang)),
        ModelPart(id: 'cornice', mesh: _join([_up(Primitives.box(4.8, 0.5, 2.2), const Vec3(0, 3.9, 0)), _up(Primitives.box(3.8, 0.4, 1.8), const Vec3(0, 4.4, 0))]), color: stone, name: nCornice.of(lang), description: _t('"INDIA" is carved at the top, with the names of 13,300 soldiers on the walls.', 'ऊपर "INDIA" खुदा है और दीवारों पर 13,300 सैनिकों के नाम हैं।', 'ಮೇಲ್ಭಾಗದಲ್ಲಿ "INDIA" ಕೆತ್ತಲಾಗಿದೆ, ಗೋಡೆಗಳ ಮೇಲೆ 13,300 ಸೈನಿಕರ ಹೆಸರುಗಳಿವೆ.').of(lang)),
        ModelPart(id: 'flame', mesh: _up(Primitives.cone(0.18, 0.5), const Vec3(0, 0.75, 1.9)), color: const Color(0xFFE8782B), emissive: true, name: nFlame.of(lang), description: _t('A flame burns day and night in memory of unknown soldiers.', 'अज्ञात सैनिकों की स्मृति में यह ज्योति दिन-रात जलती है।', 'ಅಜ್ಞಾತ ಸೈನಿಕರ ನೆನಪಿನಲ್ಲಿ ಜ್ಯೋತಿ ಹಗಲು ರಾತ್ರಿ ಉರಿಯುತ್ತದೆ.').of(lang)),
      ],
      labels: [
        Label3D(nCornice.of(lang), const Vec3(0, 4.9, 0), partId: 'cornice', emphasis: true),
        Label3D(nArch.of(lang), const Vec3(0, 2.4, 1.1), partId: 'arch'),
        Label3D(nBase.of(lang), const Vec3(2.9, 0.3, 0), partId: 'base'),
        Label3D(nFlame.of(lang), const Vec3(0, 1.4, 1.9), partId: 'flame'),
      ],
      initialPitch: 10,
    );
  }

  static Model3D konark(String lang) {
    const sand = Color(0xFFC9A36B), dark = Color(0xFFA6824E);
    final nWheel = _t('Chariot wheel (sundial)', 'रथ का पहिया (धूप-घड़ी)', 'ರಥದ ಚಕ್ರ (ಸೂರ್ಯ ಗಡಿಯಾರ)');
    final nPlat = _t('Platform (chariot)', 'चबूतरा (रथ)', 'ವೇದಿಕೆ (ರಥ)');
    final nTemple = _t('Jagamohana (hall)', 'जगमोहन (सभा-मंडप)', 'ಜಗಮೋಹನ (ಸಭಾಂಗಣ)');
    final nHorse = _t('Horses', 'घोड़े', 'ಕುದುರೆಗಳು');
    Mesh wheel(Vec3 c) {
      final ms = <Mesh>[_at(Primitives.ring(0.12, 0.62, segments: 32).let((m) => _at(m, Mat4.identity())), Mat4.translation(c) * Mat4.rotationX(math.pi / 2))];
      for (var s = 0; s < 8; s++) {
        final a = s * math.pi / 4;
        ms.add(Primitives.rod(c, c + Vec3(0.6 * math.cos(a), 0.6 * math.sin(a), 0), 0.035, segments: 6));
      }
      ms.add(Primitives.sphere(0.12, center: c, segments: 10, rings: 6));
      return _join(ms);
    }

    final wheels = <Mesh>[];
    for (var i = 0; i < 6; i++) {
      wheels.add(wheel(Vec3(-2.5 + i * 1.0, 0.75, 1.55)));
    }
    final horses = <Mesh>[];
    for (var i = 0; i < 3; i++) {
      horses.add(_up(Primitives.box(0.5, 0.5, 1.0), Vec3(-1.2 + i * 1.2, 0.5, 3.2)));
      horses.add(_at(Primitives.cylinder(0.14, 0.5), Mat4.translation(Vec3(-1.2 + i * 1.2, 0.95, 3.5)) * Mat4.rotationX(-0.5)));
    }
    return Model3D(
      title: _t('Sun Temple, Konark', 'सूर्य मंदिर, कोणार्क', 'ಸೂರ್ಯ ದೇವಾಲಯ, ಕೋನಾರ್ಕ್').of(lang),
      caption: '${_t('A 13th century temple built as the chariot of the Sun god with 24 wheels and seven horses. ', 'सूर्य देव का रथ बनाकर 13वीं सदी में बना मंदिर: 24 पहिए और सात घोड़े। ', 'ಸೂರ್ಯದೇವನ ರಥದ ರೂಪದಲ್ಲಿ 13ನೇ ಶತಮಾನದಲ್ಲಿ ಕಟ್ಟಿದ ದೇವಾಲಯ: 24 ಚಕ್ರಗಳು ಮತ್ತು ಏಳು ಕುದುರೆಗಳು. ').of(lang)}${_simplified.of(lang)}',
      subjects: const ['History'],
      parts: [
        ModelPart(id: 'platform', mesh: _up(Primitives.box(6.4, 0.9, 3.0), Vec3.zero), color: dark, name: nPlat.of(lang), description: _t('The whole temple stands on a raised platform carved like a chariot.', 'पूरा मंदिर रथ की तरह तराशे गए ऊँचे चबूतरे पर खड़ा है।', 'ಇಡೀ ದೇವಾಲಯ ರಥದಂತೆ ಕೆತ್ತಿದ ಎತ್ತರದ ವೇದಿಕೆಯ ಮೇಲೆ ನಿಂತಿದೆ.').of(lang)),
        ModelPart(id: 'wheels', mesh: _join(wheels), color: sand, name: nWheel.of(lang), doubleSided: true, description: _t('Each wheel has 8 spokes. The shadow of the hub on the spokes tells the time of day.', 'हर पहिये में 8 आरे हैं। आरों पर धुरी की छाया दिन का समय बताती है।', 'ಪ್ರತಿ ಚಕ್ರಕ್ಕೆ 8 ಅರೆಗಳು. ಅರೆಗಳ ಮೇಲಿನ ಅಚ್ಚಿನ ನೆರಳು ಸಮಯ ತಿಳಿಸುತ್ತದೆ.').of(lang)),
        ModelPart(id: 'hall', mesh: _join([_up(Primitives.box(3.0, 1.6, 2.4), const Vec3(0, 0.9, 0)), _up(Primitives.box(2.6, 0.5, 2.0), const Vec3(0, 2.5, 0)), _up(Primitives.box(2.0, 0.5, 1.6), const Vec3(0, 3.0, 0)), _up(Primitives.box(1.4, 0.5, 1.2), const Vec3(0, 3.5, 0)), _up(Primitives.cone(0.5, 0.6), const Vec3(0, 4.0, 0))]), color: sand, name: nTemple.of(lang), description: _t('A hall with a stepped pyramid roof; the tower behind it has fallen.', 'सीढ़ीदार पिरामिड छत वाला सभा-मंडप; इसके पीछे की मीनार गिर चुकी है।', 'ಮೆಟ್ಟಿಲಿನ ಪಿರಮಿಡ್ ಛಾವಣಿಯ ಸಭಾಂಗಣ; ಹಿಂದಿನ ಗೋಪುರ ಬಿದ್ದುಹೋಗಿದೆ.').of(lang)),
        ModelPart(id: 'horses', mesh: _join(horses), color: dark, name: nHorse.of(lang), description: _t('Seven horses pull the Sun god\'s chariot (three shown here).', 'सात घोड़े सूर्य देव का रथ खींचते हैं (यहाँ तीन दिखाए गए हैं)।', 'ಏಳು ಕುದುರೆಗಳು ಸೂರ್ಯದೇವನ ರಥ ಎಳೆಯುತ್ತವೆ (ಇಲ್ಲಿ ಮೂರು ತೋರಿಸಿದೆ).').of(lang)),
      ],
      labels: [
        Label3D(nWheel.of(lang), const Vec3(0.5, 1.5, 1.6), partId: 'wheels', emphasis: true),
        Label3D(nTemple.of(lang), const Vec3(0, 4.8, 0), partId: 'hall'),
        Label3D(nPlat.of(lang), const Vec3(-3.2, 0.5, 0), partId: 'platform'),
        Label3D(nHorse.of(lang), const Vec3(0, 1.5, 3.4), partId: 'horses'),
      ],
      initialPitch: 14,
      initialYaw: -25,
    );
  }
}

extension on Mesh {
  /// Applies [f] to this mesh (reads better in a long expression).
  Mesh let(Mesh Function(Mesh) f) => f(this);
}

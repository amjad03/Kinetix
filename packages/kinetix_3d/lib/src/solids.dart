import 'dart:math' as math;
import 'dart:ui';

import 'math3d.dart';
import 'mesh.dart';
import 'model.dart';
import 'primitives.dart';

/// The solids in the CBSE/NCERT "Surface Areas and Volumes" chapters (and Class 8 mensuration).
enum SolidKind {
  cube('Cube', 'solid.cube'),
  cuboid('Cuboid', 'solid.cuboid'),
  sphere('Sphere', 'solid.sphere'),
  hemisphere('Hemisphere', 'solid.hemisphere'),
  cylinder('Cylinder', 'solid.cylinder'),
  cone('Cone', 'solid.cone'),
  frustum('Frustum of a cone', 'solid.frustum'),
  squarePyramid('Square pyramid', 'solid.square-pyramid'),
  triangularPrism('Triangular prism', 'solid.triangular-prism'),
  tetrahedron('Regular tetrahedron', 'solid.tetrahedron');

  const SolidKind(this.title, this.id);
  final String title;

  /// Stable catalogue id.
  final String id;
}

/// One editable dimension of a solid, in centimetres.
class SolidDimension {
  const SolidDimension(this.key, this.name, {this.min = 1, this.max = 10, this.initial = 4});
  final String key; // the symbol used in the formulas: a, l, b, h, r, R
  final String name;
  final double min, max, initial;
}

/// A computed quantity with its formula, the formula with the numbers put in, and the value.
class Measurement {
  const Measurement(this.name, this.formula, this.working, this.value, this.unit);
  final String name;

  /// e.g. "V = ⅓πr²h"
  final String formula;

  /// e.g. "⅓ × π × 3.00² × 4.00"
  final String working;
  final double value;

  /// cm, cm² or cm³
  final String unit;

  String get valueText => '${formatNumber(value)} $unit';
}

/// Two decimals, never "-0.00".
String formatNumber(double v) {
  final s = v.toStringAsFixed(2);
  return s == '-0.00' ? '0.00' : s;
}

/// Which value of π the calculations use. NCERT exercises often say "take π = 22/7".
enum PiMode { exact, twentyTwoBySeven }

/// A solid with concrete dimensions: volume, surface areas, slant height and a 3D model.
class Solid {
  Solid(this.kind, [Map<String, double>? dims, this.piMode = PiMode.exact])
      : dims = {for (final d in dimensionsOf(kind)) d.key: dims?[d.key] ?? d.initial};

  final SolidKind kind;
  final Map<String, double> dims;
  final PiMode piMode;

  double get pi => piMode == PiMode.exact ? math.pi : 22 / 7;
  String get _piText => piMode == PiMode.exact ? 'π' : '22/7';

  double operator [](String k) => dims[k]!;

  Solid copyWith({Map<String, double>? dims, PiMode? piMode}) => Solid(kind, {...this.dims, ...?dims}, piMode ?? this.piMode);

  static List<SolidDimension> dimensionsOf(SolidKind kind) => switch (kind) {
        SolidKind.cube => const [SolidDimension('a', 'Edge')],
        SolidKind.cuboid => const [
            SolidDimension('l', 'Length', initial: 6),
            SolidDimension('b', 'Breadth', initial: 4),
            SolidDimension('h', 'Height', initial: 3),
          ],
        SolidKind.sphere => const [SolidDimension('r', 'Radius', initial: 3.5)],
        SolidKind.hemisphere => const [SolidDimension('r', 'Radius', initial: 3.5)],
        SolidKind.cylinder => const [SolidDimension('r', 'Radius', initial: 3), SolidDimension('h', 'Height', initial: 7)],
        SolidKind.cone => const [SolidDimension('r', 'Radius', initial: 3), SolidDimension('h', 'Height', initial: 4)],
        SolidKind.frustum => const [
            SolidDimension('R', 'Bottom radius', initial: 5),
            SolidDimension('r', 'Top radius', min: 0.5, initial: 2),
            SolidDimension('h', 'Height', initial: 4),
          ],
        SolidKind.squarePyramid => const [SolidDimension('a', 'Base edge', initial: 6), SolidDimension('h', 'Height', initial: 4)],
        SolidKind.triangularPrism => const [SolidDimension('a', 'Triangle edge', initial: 4), SolidDimension('h', 'Length', initial: 7)],
        SolidKind.tetrahedron => const [SolidDimension('a', 'Edge', initial: 6)],
      };

  /// Slant height where the syllabus uses one (cone, frustum, square pyramid, tetrahedron
  /// face height); null otherwise.
  double? get slantHeight => switch (kind) {
        SolidKind.cone => math.sqrt(this['r'] * this['r'] + this['h'] * this['h']),
        SolidKind.frustum => math.sqrt(this['h'] * this['h'] + math.pow(this['R'] - this['r'], 2)),
        SolidKind.squarePyramid => math.sqrt(this['h'] * this['h'] + math.pow(this['a'] / 2, 2)),
        SolidKind.tetrahedron => math.sqrt(3) / 2 * this['a'],
        _ => null,
      };

  double get volume {
    final p = pi;
    return switch (kind) {
      SolidKind.cube => math.pow(this['a'], 3).toDouble(),
      SolidKind.cuboid => this['l'] * this['b'] * this['h'],
      SolidKind.sphere => 4 / 3 * p * math.pow(this['r'], 3),
      SolidKind.hemisphere => 2 / 3 * p * math.pow(this['r'], 3),
      SolidKind.cylinder => p * this['r'] * this['r'] * this['h'],
      SolidKind.cone => p * this['r'] * this['r'] * this['h'] / 3,
      SolidKind.frustum => p * this['h'] / 3 * (this['R'] * this['R'] + this['r'] * this['r'] + this['R'] * this['r']),
      SolidKind.squarePyramid => this['a'] * this['a'] * this['h'] / 3,
      SolidKind.triangularPrism => math.sqrt(3) / 4 * this['a'] * this['a'] * this['h'],
      SolidKind.tetrahedron => math.pow(this['a'], 3) / (6 * math.sqrt(2)),
    };
  }

  /// Curved (or lateral) surface area; null for the sphere and the tetrahedron, where the
  /// syllabus uses only the total.
  double? get curvedSurfaceArea {
    final p = pi;
    final l = slantHeight;
    return switch (kind) {
      SolidKind.cube => 4 * this['a'] * this['a'],
      SolidKind.cuboid => 2 * this['h'] * (this['l'] + this['b']),
      SolidKind.sphere => null,
      SolidKind.hemisphere => 2 * p * this['r'] * this['r'],
      SolidKind.cylinder => 2 * p * this['r'] * this['h'],
      SolidKind.cone => p * this['r'] * l!,
      SolidKind.frustum => p * l! * (this['R'] + this['r']),
      SolidKind.squarePyramid => 2 * this['a'] * l!,
      SolidKind.triangularPrism => 3 * this['a'] * this['h'],
      SolidKind.tetrahedron => null,
    };
  }

  double get totalSurfaceArea {
    final p = pi;
    final l = slantHeight;
    return switch (kind) {
      SolidKind.cube => 6 * this['a'] * this['a'],
      SolidKind.cuboid => 2 * (this['l'] * this['b'] + this['b'] * this['h'] + this['h'] * this['l']),
      SolidKind.sphere => 4 * p * this['r'] * this['r'],
      SolidKind.hemisphere => 3 * p * this['r'] * this['r'],
      SolidKind.cylinder => 2 * p * this['r'] * (this['r'] + this['h']),
      SolidKind.cone => p * this['r'] * (l! + this['r']),
      SolidKind.frustum => p * l! * (this['R'] + this['r']) + p * this['R'] * this['R'] + p * this['r'] * this['r'],
      SolidKind.squarePyramid => this['a'] * this['a'] + 2 * this['a'] * l!,
      SolidKind.triangularPrism => 3 * this['a'] * this['h'] + math.sqrt(3) / 2 * this['a'] * this['a'],
      SolidKind.tetrahedron => math.sqrt(3) * this['a'] * this['a'],
    };
  }

  /// Everything shown in the measurements panel, in textbook order.
  List<Measurement> get measurements {
    String n(String k) => formatNumber(this[k]);
    final pt = _piText;
    final l = slantHeight;
    final ln = l == null ? '' : formatNumber(l);
    final v = volume, tsa = totalSurfaceArea, csa = curvedSurfaceArea;
    return switch (kind) {
      SolidKind.cube => [
          Measurement('Volume', 'V = a³', '${n('a')}³', v, 'cm³'),
          Measurement('Lateral surface area', 'LSA = 4a²', '4 × ${n('a')}²', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = 6a²', '6 × ${n('a')}²', tsa, 'cm²'),
          Measurement('Diagonal', 'd = √3 a', '√3 × ${n('a')}', math.sqrt(3) * this['a'], 'cm'),
        ],
      SolidKind.cuboid => [
          Measurement('Volume', 'V = l × b × h', '${n('l')} × ${n('b')} × ${n('h')}', v, 'cm³'),
          Measurement('Lateral surface area', 'LSA = 2h(l + b)', '2 × ${n('h')} × (${n('l')} + ${n('b')})', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = 2(lb + bh + hl)', '2 × (${n('l')} × ${n('b')} + ${n('b')} × ${n('h')} + ${n('h')} × ${n('l')})', tsa, 'cm²'),
          Measurement('Diagonal', 'd = √(l² + b² + h²)', '√(${n('l')}² + ${n('b')}² + ${n('h')}²)',
              math.sqrt(this['l'] * this['l'] + this['b'] * this['b'] + this['h'] * this['h']), 'cm'),
        ],
      SolidKind.sphere => [
          Measurement('Volume', 'V = (4/3)πr³', '(4/3) × $pt × ${n('r')}³', v, 'cm³'),
          Measurement('Surface area', 'S = 4πr²', '4 × $pt × ${n('r')}²', tsa, 'cm²'),
          Measurement('Diameter', 'd = 2r', '2 × ${n('r')}', 2 * this['r'], 'cm'),
        ],
      SolidKind.hemisphere => [
          Measurement('Volume', 'V = (2/3)πr³', '(2/3) × $pt × ${n('r')}³', v, 'cm³'),
          Measurement('Curved surface area', 'CSA = 2πr²', '2 × $pt × ${n('r')}²', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = 3πr²', '3 × $pt × ${n('r')}²', tsa, 'cm²'),
        ],
      SolidKind.cylinder => [
          Measurement('Volume', 'V = πr²h', '$pt × ${n('r')}² × ${n('h')}', v, 'cm³'),
          Measurement('Curved surface area', 'CSA = 2πrh', '2 × $pt × ${n('r')} × ${n('h')}', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = 2πr(r + h)', '2 × $pt × ${n('r')} × (${n('r')} + ${n('h')})', tsa, 'cm²'),
        ],
      SolidKind.cone => [
          Measurement('Slant height', 'l = √(r² + h²)', '√(${n('r')}² + ${n('h')}²)', l!, 'cm'),
          Measurement('Volume', 'V = ⅓πr²h', '⅓ × $pt × ${n('r')}² × ${n('h')}', v, 'cm³'),
          Measurement('Curved surface area', 'CSA = πrl', '$pt × ${n('r')} × $ln', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = πr(l + r)', '$pt × ${n('r')} × ($ln + ${n('r')})', tsa, 'cm²'),
        ],
      SolidKind.frustum => [
          Measurement('Slant height', 'l = √(h² + (R − r)²)', '√(${n('h')}² + (${n('R')} − ${n('r')})²)', l!, 'cm'),
          Measurement('Volume', 'V = ⅓πh(R² + r² + Rr)', '⅓ × $pt × ${n('h')} × (${n('R')}² + ${n('r')}² + ${n('R')} × ${n('r')})', v, 'cm³'),
          Measurement('Curved surface area', 'CSA = πl(R + r)', '$pt × $ln × (${n('R')} + ${n('r')})', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = πl(R + r) + πR² + πr²', '$pt × $ln × (${n('R')} + ${n('r')}) + $pt × ${n('R')}² + $pt × ${n('r')}²', tsa, 'cm²'),
        ],
      SolidKind.squarePyramid => [
          Measurement('Slant height', 'l = √(h² + (a/2)²)', '√(${n('h')}² + (${n('a')}/2)²)', l!, 'cm'),
          Measurement('Volume', 'V = ⅓a²h', '⅓ × ${n('a')}² × ${n('h')}', v, 'cm³'),
          Measurement('Lateral surface area', 'LSA = 2al', '2 × ${n('a')} × $ln', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = a² + 2al', '${n('a')}² + 2 × ${n('a')} × $ln', tsa, 'cm²'),
        ],
      SolidKind.triangularPrism => [
          Measurement('Base area', 'B = (√3/4)a²', '(√3/4) × ${n('a')}²', math.sqrt(3) / 4 * this['a'] * this['a'], 'cm²'),
          Measurement('Volume', 'V = B × h', '(√3/4) × ${n('a')}² × ${n('h')}', v, 'cm³'),
          Measurement('Lateral surface area', 'LSA = 3ah', '3 × ${n('a')} × ${n('h')}', csa!, 'cm²'),
          Measurement('Total surface area', 'TSA = 3ah + 2B', '3 × ${n('a')} × ${n('h')} + 2 × (√3/4) × ${n('a')}²', tsa, 'cm²'),
        ],
      SolidKind.tetrahedron => [
          Measurement('Height', 'h = a√(2/3)', '${n('a')} × √(2/3)', math.sqrt(2 / 3) * this['a'], 'cm'),
          Measurement('Slant height (face)', 'l = (√3/2)a', '(√3/2) × ${n('a')}', l!, 'cm'),
          Measurement('Volume', 'V = a³ / (6√2)', '${n('a')}³ / (6√2)', v, 'cm³'),
          Measurement('Total surface area', 'TSA = √3 a²', '√3 × ${n('a')}²', tsa, 'cm²'),
        ],
    };
  }

  static const _palette = {
    SolidKind.cube: Color(0xFF4F86E8),
    SolidKind.cuboid: Color(0xFF2FA58F),
    SolidKind.sphere: Color(0xFFE8664F),
    SolidKind.hemisphere: Color(0xFFE5873A),
    SolidKind.cylinder: Color(0xFF5B8DEF),
    SolidKind.cone: Color(0xFFF0A431),
    SolidKind.frustum: Color(0xFF9273E0),
    SolidKind.squarePyramid: Color(0xFFD9A93E),
    SolidKind.triangularPrism: Color(0xFF3FB0A4),
    SolidKind.tetrahedron: Color(0xFFE66B97),
  };

  /// Bounding radius of the model, for fitting the camera.
  double get extent {
    final (_, r) = toModel().bounds;
    return r;
  }

  /// The solid standing on a 1 cm floor grid, with dimension lines and labels.
  Model3D toModel({bool grid = true}) {
    final color = _palette[kind]!;
    final cap = Color.lerp(color, const Color(0xFFFFFFFF), 0.22)!;
    final parts = <ModelPart>[];
    final lines = <Line3D>[];
    final labels = <Label3D>[];
    
    ModelPart part(String id, Mesh m, Color c, String name, String desc) =>
        ModelPart(id: id, mesh: m, color: c, name: name, description: desc, outline: true);
    String cm(double v) => '${formatNumber(v)} cm';

    void dim(Vec3 a, Vec3 b, String text, {bool hidden = false, Vec3? normal, Vec3 labelShift = Vec3.zero}) {
      lines.add(Line3D([a, b], width: 2.4, dashed: hidden, arrows: true, normal: normal, accent: true));
      labels.add(Label3D(text, a.lerp(b, 0.5) + labelShift, kind: LabelKind.dimension, normal: normal));
    }

    // Front-right and front-left directions for the default view (yaw −30°).
    final fr = Vec3(math.cos(-60 * math.pi / 180), 0, -math.sin(-60 * math.pi / 180)); // towards the viewer, right
    final fl = Vec3(math.cos(-140 * math.pi / 180), 0, -math.sin(-140 * math.pi / 180));
    var footprint = 1.0;

    switch (kind) {
      case SolidKind.cube || SolidKind.cuboid:
        final a = kind == SolidKind.cube;
        final lx = a ? this['a'] : this['l'], hy = a ? this['a'] : this['h'], bz = a ? this['a'] : this['b'];
        parts.add(part('faces', Primitives.box(lx, hy, bz), color, a ? 'Faces of the cube' : 'Faces of the cuboid',
            'TSA = ${formatNumber(totalSurfaceArea)} cm², LSA = ${formatNumber(curvedSurfaceArea!)} cm²'));
        final x = lx / 2, z = bz / 2;
        if (a) {
          dim(Vec3(-x, 0, z), Vec3(x, 0, z), 'a = ${cm(lx)}', normal: Vec3.unitZ);
        } else {
          dim(Vec3(-x, 0, z), Vec3(x, 0, z), 'l = ${cm(lx)}', normal: Vec3.unitZ);
          dim(Vec3(x, 0, z), Vec3(x, 0, -z), 'b = ${cm(bz)}', normal: Vec3.unitX);
          dim(Vec3(x, 0, z), Vec3(x, hy, z), 'h = ${cm(hy)}', normal: const Vec3(1, 0, 1));
        }
        footprint = math.max(lx, bz) / 2;
      case SolidKind.sphere:
        final r = this['r'];
        parts.add(part('surface', Primitives.sphere(r, center: Vec3(0, r, 0), segments: 48, rings: 24), color, 'Surface of the sphere',
            'S = 4πr² = ${formatNumber(totalSurfaceArea)} cm²'));
        lines.addAll(_circleArcs(Vec3(0, r, 0), r, color: const Color(0xFFFFFFFF)));
        dim(Vec3(0, r, 0), Vec3(0, r, 0) + fr * r, 'r = ${cm(r)}', hidden: true);
        labels.add(Label3D('Centre O', Vec3(0, r, 0), kind: LabelKind.callout));
        footprint = r;
      case SolidKind.hemisphere:
        final r = this['r'];
        // The curved dome and the flat base are separate parts so each can be tapped.
        parts.add(part('curved', Primitives.hemisphere(r, base: false), color, 'Curved surface',
            'CSA = 2πr² = ${formatNumber(curvedSurfaceArea!)} cm²'));
        parts.add(part('base', Primitives.disk(r, down: true), cap, 'Flat base (a circle)', 'Area = πr² = ${formatNumber(pi * r * r)} cm²'));
        dim(Vec3.zero, fr * r, 'r = ${cm(r)}', hidden: true);
        footprint = r;
      case SolidKind.cylinder:
        final r = this['r'], h = this['h'];
        parts.add(part('curved', Primitives.lathe([(r, 0), (r, h)], caps: false), color, 'Curved surface', 'CSA = 2πrh = ${formatNumber(curvedSurfaceArea!)} cm²'));
        parts.add(part('top', Primitives.disk(r, y: h), cap, 'Top (a circle)', 'Area = πr² = ${formatNumber(pi * r * r)} cm²'));
        parts.add(part('base', Primitives.disk(r, down: true), cap, 'Base (a circle)', 'Area = πr² = ${formatNumber(pi * r * r)} cm²'));
        dim(Vec3(0, h, 0), Vec3(0, h, 0) + fr * r, 'r = ${cm(r)}', normal: Vec3.unitY);
        dim(fl * r, fl * r + Vec3(0, h, 0), 'h = ${cm(h)}', normal: fl);
        footprint = r;
      case SolidKind.cone:
        final r = this['r'], h = this['h'];
        parts.add(part('curved', Primitives.lathe([(r, 0), (0, h)], caps: false), color, 'Curved surface', 'CSA = πrl = ${formatNumber(curvedSurfaceArea!)} cm²'));
        parts.add(part('base', Primitives.disk(r, down: true), cap, 'Base (a circle)', 'Area = πr² = ${formatNumber(pi * r * r)} cm²'));
        dim(Vec3.zero, Vec3(0, h, 0), 'h = ${cm(h)}', hidden: true);
        dim(Vec3.zero, fr * r, 'r = ${cm(r)}', hidden: true);
        final sn = (fl * h + Vec3(0, r, 0)).normalized;
        dim(fl * r, Vec3(0, h, 0), 'l = ${cm(slantHeight!)}', normal: sn);
        footprint = r;
      case SolidKind.frustum:
        final rb = this['R'], rt = this['r'], h = this['h'];
        parts.add(part('curved', Primitives.lathe([(rb, 0), (rt, h)], caps: false), color, 'Curved surface', 'CSA = πl(R + r) = ${formatNumber(curvedSurfaceArea!)} cm²'));
        parts.add(part('top', Primitives.disk(rt, y: h), cap, 'Top circle (radius r)', 'Area = πr² = ${formatNumber(pi * rt * rt)} cm²'));
        parts.add(part('base', Primitives.disk(rb, down: true), cap, 'Bottom circle (radius R)', 'Area = πR² = ${formatNumber(pi * rb * rb)} cm²'));
        dim(Vec3.zero, Vec3(0, h, 0), 'h = ${cm(h)}', hidden: true);
        dim(Vec3.zero, fr * rb, 'R = ${cm(rb)}', hidden: true);
        dim(Vec3(0, h, 0), Vec3(0, h, 0) + fr * rt, 'r = ${cm(rt)}', normal: Vec3.unitY);
        final sn = (fl * h + Vec3(0, rb - rt, 0)).normalized;
        dim(fl * rb, fl * rt + Vec3(0, h, 0), 'l = ${cm(slantHeight!)}', normal: sn);
        footprint = math.max(rb, rt);
      case SolidKind.squarePyramid:
        final a = this['a'], h = this['h'], x = a / 2;
        final base = [Vec3(-x, 0, x), Vec3(x, 0, x), Vec3(x, 0, -x), Vec3(-x, 0, -x)];
        parts.add(part('faces', Primitives.pyramid(base, Vec3(0, h, 0)), color, 'Faces of the pyramid',
            '4 triangles + a square base. LSA = ${formatNumber(curvedSurfaceArea!)} cm²'));
        dim(Vec3(-x, 0, x), Vec3(x, 0, x), 'a = ${cm(a)}', normal: Vec3.unitZ);
        dim(Vec3.zero, Vec3(0, h, 0), 'h = ${cm(h)}', hidden: true);
        final fn = Vec3(0, x, h).normalized;
        dim(Vec3(0, 0, x), Vec3(0, h, 0), 'l = ${cm(slantHeight!)}', normal: fn);
        footprint = x * math.sqrt2;
      case SolidKind.triangularPrism:
        final a = this['a'], h = this['h'];
        final rc = a / math.sqrt(3);
        final tri = Primitives.regularPolygon(3, rc, startDeg: 90);
        parts.add(part('faces', Primitives.prism(tri, h), color, 'Faces of the prism',
            '2 equilateral triangles + 3 rectangles. LSA = ${formatNumber(curvedSurfaceArea!)} cm²'));
        // tri[1] and tri[2] form the front edge for the default view.
        final e = (tri[1] + tri[2]) * 0.5;
        dim(tri[1], tri[2], 'a = ${cm(a)}', normal: e.normalized);
        dim(tri[2], tri[2] + Vec3(0, h, 0), 'h = ${cm(h)}', normal: tri[2].normalized);
        footprint = rc;
      case SolidKind.tetrahedron:
        final a = this['a'];
        final rc = a / math.sqrt(3);
        final h = math.sqrt(2 / 3) * a;
        final tri = Primitives.regularPolygon(3, rc, startDeg: 90);
        parts.add(part('faces', Primitives.pyramid(tri, Vec3(0, h, 0)), color, 'Faces of the tetrahedron', '4 equilateral triangles. TSA = √3 a²'));
        final e = (tri[1] + tri[2]) * 0.5;
        dim(tri[1], tri[2], 'a = ${cm(a)}', normal: e.normalized);
        dim(Vec3.zero, Vec3(0, h, 0), 'h = ${cm(h)}', hidden: true);
        footprint = rc;
    }

    if (grid) {
      final g = (footprint + 1.5).ceilToDouble();
      for (var i = -g; i <= g + 1e-9; i += 1) {
        lines.add(Line3D([Vec3(i, 0, -g), Vec3(i, 0, g)], width: 1, overlay: false, opacity: i == 0 ? 0.28 : 0.14));
        lines.add(Line3D([Vec3(-g, 0, i), Vec3(g, 0, i)], width: 1, overlay: false, opacity: i == 0 ? 0.28 : 0.14));
      }
    }

    return Model3D(
      title: kind.title,
      caption: 'Drag to turn it. Change the dimensions; the measurements update. Floor grid: 1 cm squares.',
      subjects: const ['Maths', 'Surface areas and volumes'],
      parts: parts,
      lines: lines,
      labels: labels,
      ambient: 0.38,
      initialYaw: -30,
      initialPitch: 22,
    );
  }

  /// A horizontal circle as short arcs, each with its own outward normal, so the far half
  /// is drawn dashed and faint.
  static List<Line3D> _circleArcs(Vec3 c, double r, {Color? color, int arcs = 16}) => [
        for (var k = 0; k < arcs; k++)
          Line3D(
            [
              for (var s = 0; s <= 4; s++)
                c + Vec3(r * math.cos((k + s / 4) / arcs * 2 * math.pi), 0, -r * math.sin((k + s / 4) / arcs * 2 * math.pi)),
            ],
            width: 1.6,
            color: color,
            opacity: 0.7,
            normal: Vec3(math.cos((k + 0.5) / arcs * 2 * math.pi), 0, -math.sin((k + 0.5) / arcs * 2 * math.pi)),
          ),
      ];
}

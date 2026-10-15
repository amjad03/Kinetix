import 'dart:math' as math;
import 'dart:ui';

import 'math3d.dart';
import 'model.dart';
import 'primitives.dart';

/// An element with its CPK colour and a display radius for ball-and-stick models (Å).
enum ChemElement {
  hydrogen('H', 'Hydrogen', Color(0xFFF2F2F2), 0.26),
  carbon('C', 'Carbon', Color(0xFF4A4A4A), 0.36),
  oxygen('O', 'Oxygen', Color(0xFFE53935), 0.36),
  sodium('Na', 'Sodium', Color(0xFF9C5BE0), 0.42),
  chlorine('Cl', 'Chlorine', Color(0xFF2EBD4A), 0.62);

  const ChemElement(this.symbol, this.name, this.color, this.radius);
  final String symbol, name;
  final Color color;
  final double radius;
}

class Atom {
  const Atom(this.element, this.position, {this.charge = ''});
  final ChemElement element;
  final Vec3 position;

  /// '+' or '−' for ions.
  final String charge;
}

class Bond {
  const Bond(this.a, this.b, {this.order = 1});
  final int a, b;
  final int order;
}

/// Atoms and bonds with real geometry (lengths in ångström, angles from VSEPR).
class Molecule {
  const Molecule(this.name, this.formula, this.atoms, this.bonds);
  final String name, formula;
  final List<Atom> atoms;
  final List<Bond> bonds;

  /// Angle a–centre–b in degrees.
  double angle(int a, int centre, int b) =>
      (atoms[a].position - atoms[centre].position).angleTo(atoms[b].position - atoms[centre].position);

  double bondLength(int a, int b) => atoms[a].position.distanceTo(atoms[b].position);

  /// Water: bent, H–O–H 104.5°, O–H 0.96 Å.
  static Molecule water() {
    const half = 104.5 / 2 * math.pi / 180;
    const d = 0.96;
    return Molecule('Water', 'H₂O', [
      const Atom(ChemElement.oxygen, Vec3.zero),
      Atom(ChemElement.hydrogen, Vec3(-d * math.sin(half), -d * math.cos(half), 0)),
      Atom(ChemElement.hydrogen, Vec3(d * math.sin(half), -d * math.cos(half), 0)),
    ], const [Bond(0, 1), Bond(0, 2)]);
  }

  /// Methane: tetrahedral, H–C–H 109.47°, C–H 1.09 Å.
  static Molecule methane() {
    const d = 1.09;
    final polar = math.acos(-1 / 3); // 109.47°
    return Molecule('Methane', 'CH₄', [
      const Atom(ChemElement.carbon, Vec3.zero),
      const Atom(ChemElement.hydrogen, Vec3(0, d, 0)),
      for (var k = 0; k < 3; k++)
        Atom(
          ChemElement.hydrogen,
          Vec3(math.sin(polar) * math.cos(k * 2 * math.pi / 3 + math.pi / 6), math.cos(polar), -math.sin(polar) * math.sin(k * 2 * math.pi / 3 + math.pi / 6)) * d,
        ),
    ], const [Bond(0, 1), Bond(0, 2), Bond(0, 3), Bond(0, 4)]);
  }

  /// Carbon dioxide: linear O=C=O, C=O 1.16 Å.
  static Molecule carbonDioxide() => const Molecule('Carbon dioxide', 'CO₂', [
        Atom(ChemElement.carbon, Vec3.zero),
        Atom(ChemElement.oxygen, Vec3(-1.16, 0, 0)),
        Atom(ChemElement.oxygen, Vec3(1.16, 0, 0)),
      ], [Bond(0, 1, order: 2), Bond(0, 2, order: 2)]);

  /// Sodium chloride: a 3×3×3 block of the rock-salt lattice, ions alternating, Na–Cl 2.82 Å.
  static Molecule sodiumChloride({int n = 3}) {
    const d = 2.82;
    final atoms = <Atom>[];
    final index = <String, int>{};
    final off = (n - 1) / 2;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < n; k++) {
          final na = (i + j + k).isEven;
          index['$i,$j,$k'] = atoms.length;
          atoms.add(Atom(na ? ChemElement.sodium : ChemElement.chlorine, Vec3((i - off) * d, (j - off) * d, (k - off) * d), charge: na ? '+' : '−'));
        }
      }
    }
    final bonds = <Bond>[];
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < n; k++) {
          final a = index['$i,$j,$k']!;
          if (i + 1 < n) bonds.add(Bond(a, index['${i + 1},$j,$k']!));
          if (j + 1 < n) bonds.add(Bond(a, index['$i,${j + 1},$k']!));
          if (k + 1 < n) bonds.add(Bond(a, index['$i,$j,${k + 1}']!));
        }
      }
    }
    return Molecule('Sodium chloride crystal', 'NaCl', atoms, bonds);
  }

  /// A ball-and-stick model. Bonds are split half and half in the two atoms' colours.
  Model3D toModel({
    required String caption,
    List<String> subjects = const ['Chemistry'],
    List<(int, int, int)> showAngles = const [],
    bool labelEveryAtom = true,
    int sphereDetail = 28,
    double bondRadius = 0.09,
    String? bondNote,
    bool ionic = false,
  }) {
    final parts = <ModelPart>[];
    final labels = <Label3D>[];
    final lines = <Line3D>[];
    final centre = atoms.fold(Vec3.zero, (s, a) => s + a.position) / atoms.length.toDouble();
    for (var i = 0; i < atoms.length; i++) {
      final a = atoms[i];
      final e = a.element;
      final ion = a.charge.isNotEmpty;
      final id = 'atom-$i';
      final r = ionic ? (e == ChemElement.sodium ? 0.55 : 0.85) : e.radius;
      parts.add(ModelPart(
        id: id,
        mesh: Primitives.sphere(r, center: a.position, segments: sphereDetail, rings: sphereDetail ~/ 2),
        color: e.color,
        name: ion ? '${e.name} ion (${e.symbol}${a.charge})' : '${e.name} atom (${e.symbol})',
        description: ion
            ? (e == ChemElement.sodium
                ? 'Na+ has lost one electron. Each Na+ is surrounded by 6 Cl− ions.'
                : 'Cl− has gained one electron. Each Cl− is surrounded by 6 Na+ ions.')
            : _atomNote(e),
      ));
      final dir = (a.position - centre).length < 1e-6 ? const Vec3(0, 0, 1) : (a.position - centre).normalized;
      if (labelEveryAtom) labels.add(Label3D('${e.symbol}${a.charge}', a.position + dir * r * 0.7, partId: id));
    }
    for (var k = 0; k < bonds.length; k++) {
      final b = bonds[k];
      final pa = atoms[b.a].position, pb = atoms[b.b].position;
      final mid = pa.lerp(pb, 0.5);
      final axis = (pb - pa).normalized;
      // Offset sticks for double bonds, in the plane facing the default view.
      var side = axis.cross(const Vec3(0, 0, 1));
      if (side.length < 1e-6) side = axis.anyPerpendicular;
      side = side.normalized;
      final offsets = b.order == 2 ? [side * 0.12, side * -0.12] : [Vec3.zero];
      final symA = atoms[b.a].element.symbol, symB = atoms[b.b].element.symbol;
      final bondName = ionic
          ? 'Ionic attraction Na+ ··· Cl−'
          : '$symA${b.order == 2 ? '=' : '–'}$symB ${b.order == 2 ? 'double' : 'covalent'} bond';
      final note = bondNote ?? 'Bond length ${formatAngstrom(bondLength(b.a, b.b))}';
      for (final (j, o) in offsets.indexed) {
        final rad = b.order == 2 ? bondRadius * 0.75 : bondRadius;
        parts.add(ModelPart(
          id: 'bond-$k-$j-a',
          mesh: Primitives.rod(pa + o, mid + o, rad, segments: ionic ? 6 : 12, slices: ionic ? 3 : 2),
          color: ionic ? const Color(0xFF9E9E9E) : atoms[b.a].element.color,
          name: bondName,
          description: note,
        ));
        parts.add(ModelPart(
          id: 'bond-$k-$j-b',
          mesh: Primitives.rod(mid + o, pb + o, rad, segments: ionic ? 6 : 12, slices: ionic ? 3 : 2),
          color: ionic ? const Color(0xFF9E9E9E) : atoms[b.b].element.color,
          name: bondName,
          description: note,
        ));
      }
    }
    for (final (a, c, b) in showAngles) {
      final pc = atoms[c].position;
      final da = (atoms[a].position - pc).normalized, db = (atoms[b].position - pc).normalized;
      final r = atoms[c].element.radius + 0.28;
      final ang = da.angleTo(db);
      final pts = <Vec3>[];
      // Arc from da to db (slerp in the plane of the two bonds).
      final perp = (db - da * da.dot(db));
      final pn = perp.length < 1e-6 ? da.anyPerpendicular : perp.normalized;
      for (var s = 0; s <= 24; s++) {
        final t = ang * math.pi / 180 * s / 24;
        pts.add(pc + (da * math.cos(t) + pn * math.sin(t)) * r);
      }
      lines.add(Line3D(pts, accent: true, width: 2.6));
      final midT = ang * math.pi / 180 / 2;
      labels.add(Label3D('${ang.toStringAsFixed(1)}°', pc + (da * math.cos(midT) + pn * math.sin(midT)) * (r + 0.32), kind: LabelKind.dimension, emphasis: true));
    }
    return Model3D(
      title: '$name ($formula)',
      caption: caption,
      subjects: subjects,
      parts: parts,
      labels: labels,
      lines: lines,
      ambient: 0.34,
      initialYaw: ionic ? -32 : -18,
      initialPitch: ionic ? 24 : 12,
    );
  }

  static String _atomNote(ChemElement e) => switch (e) {
        ChemElement.hydrogen => 'Atomic number 1. Valency 1: forms one bond.',
        ChemElement.carbon => 'Atomic number 6. Valency 4: forms four bonds (tetravalent).',
        ChemElement.oxygen => 'Atomic number 8. Valency 2: forms two bonds; has two lone pairs.',
        ChemElement.sodium => 'Atomic number 11. Loses one electron to form Na+.',
        ChemElement.chlorine => 'Atomic number 17. Gains one electron to form Cl−.',
      };
}

String formatAngstrom(double d) => '${d.toStringAsFixed(2)} Å';

/// The catalogue's chemistry models.
abstract final class ChemistryModels {
  static Model3D water() => Molecule.water().toModel(
        caption: 'A water molecule is bent, not straight: two lone pairs on oxygen push the O–H bonds together to 104.5°. '
            'This shape makes water polar.',
        subjects: const ['Science', 'Chemistry', 'Class 9–10'],
        showAngles: const [(1, 0, 2)],
      );

  static Model3D methane() => Molecule.methane().toModel(
        caption: 'Carbon shares one electron pair with each of four hydrogen atoms. The bonds point to the corners of a '
            'tetrahedron, 109.5° apart.',
        subjects: const ['Science', 'Carbon and its compounds', 'Class 10'],
        showAngles: const [(1, 0, 2)],
      );

  static Model3D carbonDioxide() => Molecule.carbonDioxide().toModel(
        caption: 'Carbon forms a double bond with each oxygen atom (O=C=O). The molecule is linear: the bond angle is 180°.',
        subjects: const ['Science', 'Carbon and its compounds', 'Class 10'],
        showAngles: const [(1, 0, 2)],
      );

  static Model3D sodiumChloride() {
    final m = Molecule.sodiumChloride();
    final model = m.toModel(
      caption: 'Common salt is an ionic crystal: Na+ and Cl− ions alternate in a cubic lattice. Every ion has six neighbours '
          'of the opposite charge. Tap an ion.',
      subjects: const ['Science', 'Metals and non-metals', 'Class 10'],
      labelEveryAtom: false,
      sphereDetail: 16,
      bondRadius: 0.07,
      ionic: true,
      bondNote: 'Ions are held together by electrostatic attraction (ionic bond).',
    );
    // Label one ion of each kind, on the corner nearest the viewer.
    final labelled = [m.atoms.length - 1, m.atoms.length - 2]; // (2,2,2) is Na+, (2,2,1) is Cl−
    return Model3D(
      title: model.title,
      caption: model.caption,
      subjects: model.subjects,
      parts: model.parts,
      labels: [
        for (final i in labelled)
          Label3D(m.atoms[i].element == ChemElement.sodium ? 'Na+ ion' : 'Cl− ion', m.atoms[i].position + const Vec3(0.3, 0.5, 0.3), partId: 'atom-$i'),
      ],
      ambient: model.ambient,
      initialYaw: model.initialYaw,
      initialPitch: model.initialPitch,
    );
  }
}


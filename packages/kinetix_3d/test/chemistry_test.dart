import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

void main() {
  test('water is bent at 104.5° with O–H 0.96 Å', () {
    final w = Molecule.water();
    expect(w.atoms.map((a) => a.element.symbol), ['O', 'H', 'H']);
    expect(w.angle(1, 0, 2), closeTo(104.5, 1e-9));
    expect(w.bondLength(0, 1), closeTo(0.96, 1e-12));
    expect(w.bondLength(0, 2), closeTo(0.96, 1e-12));
  });

  test('methane is tetrahedral: every H–C–H angle is 109.47°', () {
    final m = Molecule.methane();
    for (var i = 1; i <= 4; i++) {
      expect(m.bondLength(0, i), closeTo(1.09, 1e-12));
      for (var j = i + 1; j <= 4; j++) {
        expect(m.angle(i, 0, j), closeTo(109.4712, 1e-3), reason: 'H$i–C–H$j');
      }
    }
  });

  test('carbon dioxide is linear with double bonds', () {
    final c = Molecule.carbonDioxide();
    expect(c.angle(1, 0, 2), closeTo(180, 1e-9));
    expect(c.bonds.every((b) => b.order == 2), isTrue);
  });

  test('NaCl lattice: 27 alternating ions, every neighbour is the opposite ion', () {
    final n = Molecule.sodiumChloride();
    expect(n.atoms, hasLength(27));
    expect(n.bonds, hasLength(54));
    expect(n.atoms.where((a) => a.element == ChemElement.sodium), hasLength(14));
    for (final b in n.bonds) {
      expect(n.atoms[b.a].element, isNot(n.atoms[b.b].element));
      expect(n.bondLength(b.a, b.b), closeTo(2.82, 1e-9));
    }
    // The centre ion has six neighbours.
    final centre = 13;
    expect(n.bonds.where((b) => b.a == centre || b.b == centre), hasLength(6));
  });

  test('molecule models have named, pickable atoms and the angle label', () {
    final m = ChemistryModels.water();
    expect(m.partById('atom-0')!.name, 'Oxygen atom (O)');
    expect(m.labels.map((l) => l.text), contains('104.5°'));
  });
}

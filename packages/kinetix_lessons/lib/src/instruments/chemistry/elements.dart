/// Element data for Z = 1–56: symbol, name, period/group, and the properties the PUC course
/// tabulates. Covalent radii (pm) are Cordero et al. (2008); first ionisation enthalpies in
/// kJ mol⁻¹; Pauling electronegativities (none listed for He, Ne, Ar).
class El {
  const El(this.z, this.sym, this.name, this.mass, this.r, this.ie, this.en);
  final int z;
  final String sym, name;
  final double mass, r, ie;
  final double? en;

  int get period => z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : z <= 54 ? 5 : 6;
  int get group {
    if (z == 1) return 1;
    if (z == 2) return 18;
    final start = const {2: 3, 3: 11, 4: 19, 5: 37, 6: 55}[period]!;
    final k = z - start; // 0-based position in the period
    if (period <= 3) return k < 2 ? k + 1 : k + 11;
    return k + 1;
  }

  String get block {
    final g = group;
    if (z == 2 || g <= 2) return 's';
    if (g >= 13) return 'p';
    return 'd';
  }
}

const elements = <El>[
  El(1, 'H', 'Hydrogen', 1.008, 31, 1312, 2.20),
  El(2, 'He', 'Helium', 4.003, 28, 2372, null),
  El(3, 'Li', 'Lithium', 6.94, 128, 520, 0.98),
  El(4, 'Be', 'Beryllium', 9.012, 96, 899, 1.57),
  El(5, 'B', 'Boron', 10.81, 84, 801, 2.04),
  El(6, 'C', 'Carbon', 12.01, 76, 1086, 2.55),
  El(7, 'N', 'Nitrogen', 14.01, 71, 1402, 3.04),
  El(8, 'O', 'Oxygen', 16.00, 66, 1314, 3.44),
  El(9, 'F', 'Fluorine', 19.00, 57, 1681, 3.98),
  El(10, 'Ne', 'Neon', 20.18, 58, 2081, null),
  El(11, 'Na', 'Sodium', 22.99, 166, 496, 0.93),
  El(12, 'Mg', 'Magnesium', 24.31, 141, 738, 1.31),
  El(13, 'Al', 'Aluminium', 26.98, 121, 578, 1.61),
  El(14, 'Si', 'Silicon', 28.09, 111, 787, 1.90),
  El(15, 'P', 'Phosphorus', 30.97, 107, 1012, 2.19),
  El(16, 'S', 'Sulphur', 32.06, 105, 1000, 2.58),
  El(17, 'Cl', 'Chlorine', 35.45, 102, 1251, 3.16),
  El(18, 'Ar', 'Argon', 39.95, 106, 1521, null),
  El(19, 'K', 'Potassium', 39.10, 203, 419, 0.82),
  El(20, 'Ca', 'Calcium', 40.08, 176, 590, 1.00),
  El(21, 'Sc', 'Scandium', 44.96, 170, 633, 1.36),
  El(22, 'Ti', 'Titanium', 47.87, 160, 659, 1.54),
  El(23, 'V', 'Vanadium', 50.94, 153, 651, 1.63),
  El(24, 'Cr', 'Chromium', 52.00, 139, 653, 1.66),
  El(25, 'Mn', 'Manganese', 54.94, 139, 717, 1.55),
  El(26, 'Fe', 'Iron', 55.85, 132, 762, 1.83),
  El(27, 'Co', 'Cobalt', 58.93, 126, 760, 1.88),
  El(28, 'Ni', 'Nickel', 58.69, 124, 737, 1.91),
  El(29, 'Cu', 'Copper', 63.55, 132, 745, 1.90),
  El(30, 'Zn', 'Zinc', 65.38, 122, 906, 1.65),
  El(31, 'Ga', 'Gallium', 69.72, 122, 579, 1.81),
  El(32, 'Ge', 'Germanium', 72.63, 120, 762, 2.01),
  El(33, 'As', 'Arsenic', 74.92, 119, 947, 2.18),
  El(34, 'Se', 'Selenium', 78.97, 120, 941, 2.55),
  El(35, 'Br', 'Bromine', 79.90, 120, 1140, 2.96),
  El(36, 'Kr', 'Krypton', 83.80, 116, 1351, 3.00),
  El(37, 'Rb', 'Rubidium', 85.47, 220, 403, 0.82),
  El(38, 'Sr', 'Strontium', 87.62, 195, 550, 0.95),
  El(39, 'Y', 'Yttrium', 88.91, 190, 600, 1.22),
  El(40, 'Zr', 'Zirconium', 91.22, 175, 640, 1.33),
  El(41, 'Nb', 'Niobium', 92.91, 164, 652, 1.6),
  El(42, 'Mo', 'Molybdenum', 95.95, 154, 684, 2.16),
  El(43, 'Tc', 'Technetium', 98, 147, 702, 1.9),
  El(44, 'Ru', 'Ruthenium', 101.1, 146, 710, 2.2),
  El(45, 'Rh', 'Rhodium', 102.9, 142, 720, 2.28),
  El(46, 'Pd', 'Palladium', 106.4, 139, 804, 2.20),
  El(47, 'Ag', 'Silver', 107.9, 145, 731, 1.93),
  El(48, 'Cd', 'Cadmium', 112.4, 144, 868, 1.69),
  El(49, 'In', 'Indium', 114.8, 142, 558, 1.78),
  El(50, 'Sn', 'Tin', 118.7, 139, 709, 1.96),
  El(51, 'Sb', 'Antimony', 121.8, 139, 834, 2.05),
  El(52, 'Te', 'Tellurium', 127.6, 138, 869, 2.1),
  El(53, 'I', 'Iodine', 126.9, 139, 1008, 2.66),
  El(54, 'Xe', 'Xenon', 131.3, 140, 1170, 2.6),
  El(55, 'Cs', 'Caesium', 132.9, 244, 376, 0.79),
  El(56, 'Ba', 'Barium', 137.3, 215, 503, 0.89),
];

El el(int z) => elements[(z - 1).clamp(0, elements.length - 1)];

/// Subshells in Aufbau (n + l) order.
const aufbau = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s'];
int capacity(String sub) => const {'s': 2, 'p': 6, 'd': 10, 'f': 14}[sub[1]]!;

/// Ground-state configuration as subshell → electrons, with the observed exceptions
/// (Cr, Cu, Mo, Ag, and the 4d anomalies Nb, Ru, Rh, Pd) when [real] is set.
Map<String, int> configuration(int z, {bool real = true}) {
  final out = <String, int>{};
  var left = z;
  for (final s in aufbau) {
    if (left <= 0) break;
    final k = left < capacity(s) ? left : capacity(s);
    out[s] = k;
    left -= k;
  }
  if (real) {
    void move(String from, String to, int n) {
      out[from] = (out[from] ?? 0) - n;
      out[to] = (out[to] ?? 0) + n;
      if (out[from] == 0) out.remove(from);
    }

    switch (z) {
      case 24 || 29:
        move('4s', '3d', 1);
      case 41 || 42 || 44 || 45 || 47:
        move('5s', '4d', 1);
      case 46:
        move('5s', '4d', 2);
    }
  }
  return out;
}

bool isException(int z) => const {24, 29, 41, 42, 44, 45, 46, 47}.contains(z);

/// Writes a configuration in shell order, with [Ar]-style noble-gas cores when [core] is set.
String configText(int z, {bool core = true}) {
  final cfg = configuration(z);
  const cores = {2: 'He', 10: 'Ne', 18: 'Ar', 36: 'Kr', 54: 'Xe'};
  var coreZ = 0;
  if (core) {
    for (final k in cores.keys) {
      if (k < z) coreZ = k;
    }
  }
  final coreCfg = coreZ == 0 ? <String, int>{} : configuration(coreZ);
  final order = cfg.keys.toList()..sort((a, b) => a[0] != b[0] ? a[0].compareTo(b[0]) : 'spdf'.indexOf(a[1]).compareTo('spdf'.indexOf(b[1])));
  const sup = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
  final parts = <String>[if (coreZ > 0) '[${cores[coreZ]}]'];
  for (final s in order) {
    if (coreCfg[s] == cfg[s]) continue;
    parts.add('$s${'${cfg[s]}'.split('').map((d) => sup[d]).join()}');
  }
  return parts.join(' ');
}

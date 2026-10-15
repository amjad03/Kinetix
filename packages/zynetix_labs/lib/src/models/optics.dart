/// The four cases in CBSE Class 10 "Light – Reflection and Refraction".
enum OpticKind {
  convexLens('Convex lens', isLens: true),
  concaveLens('Concave lens', isLens: true),
  concaveMirror('Concave mirror', isLens: false),
  convexMirror('Convex mirror', isLens: false);

  const OpticKind(this.title, {required this.isLens});
  final String title;
  final bool isLens;

  /// Signed focal length (New Cartesian sign convention, light travelling left to right):
  /// convex lens +, concave lens −, concave mirror −, convex mirror +.
  double signedFocalLength(double magnitude) => switch (this) {
        OpticKind.convexLens || OpticKind.convexMirror => magnitude.abs(),
        OpticKind.concaveLens || OpticKind.concaveMirror => -magnitude.abs(),
      };
}

/// Where the image forms and what it is like.
class OpticsImage {
  const OpticsImage({required this.kind, required this.u, required this.f, required this.v, required this.m});

  final OpticKind kind;

  /// Object distance (negative: the object is on the left), signed focal length, image
  /// distance (null when the image is at infinity) and magnification (null at infinity).
  final double u, f;
  final double? v, m;

  bool get atInfinity => v == null;

  /// Real images form where light actually meets: on the far side of a lens (v > 0) or in
  /// front of a mirror (v < 0).
  bool get isReal => atInfinity ? true : (kind.isLens ? v! > 0 : v! < 0);
  bool get isInverted => atInfinity ? true : m! < 0;

  String get nature => isReal ? 'Real' : 'Virtual';
  String get orientation => isInverted ? 'Inverted' : 'Erect';

  String get size {
    if (atInfinity) return 'Highly magnified';
    final a = m!.abs();
    if ((a - 1).abs() < 0.005) return 'Same size';
    return a > 1 ? 'Magnified' : 'Diminished';
  }

  /// The textbook description of the image position.
  String get position {
    if (atInfinity) return 'At infinity';
    final fa = f.abs(), va = v!.abs();
    bool near(double a, double b) => (a - b).abs() < 0.005 * fa;
    if (kind.isLens) {
      if (!isReal) {
        return kind == OpticKind.concaveLens ? 'Between F and O, same side as the object' : 'On the same side as the object';
      }
      if (near(va, 2 * fa)) return 'At 2F on the other side';
      if (va < 2 * fa) return 'Between F and 2F on the other side';
      return 'Beyond 2F on the other side';
    }
    if (!isReal) return kind == OpticKind.convexMirror ? 'Between P and F, behind the mirror' : 'Behind the mirror';
    if (near(va, 2 * fa)) return 'At C';
    if (near(va, fa)) return 'At F';
    if (va < 2 * fa) return 'Between F and C';
    return 'Beyond C';
  }

  /// Object position in the textbook's words.
  String get objectPosition {
    final fa = f.abs(), ua = u.abs();
    bool near(double a, double b) => (a - b).abs() < 0.005 * fa;
    final twoF = kind.isLens ? '2F' : 'C';
    final pole = kind.isLens ? 'O' : 'P';
    if (near(ua, fa)) return 'At F';
    if (near(ua, 2 * fa)) return 'At $twoF';
    if (ua < fa) return 'Between F and $pole';
    if (ua < 2 * fa) return 'Between F and $twoF';
    return 'Beyond $twoF';
  }
}

/// Lens formula 1/v − 1/u = 1/f, mirror formula 1/v + 1/u = 1/f, with magnification
/// m = v/u (lens) and m = −v/u (mirror). [u] is negative; [focalMagnitude] is |f|.
OpticsImage formImage(OpticKind kind, double u, double focalMagnitude) {
  assert(u < 0, 'objects are placed on the left (u < 0)');
  final f = kind.signedFocalLength(focalMagnitude);
  final inv = kind.isLens ? 1 / f + 1 / u : 1 / f - 1 / u;
  if (inv.abs() < 1e-9) return OpticsImage(kind: kind, u: u, f: f, v: null, m: null);
  final v = 1 / inv;
  final m = kind.isLens ? v / u : -v / u;
  return OpticsImage(kind: kind, u: u, f: f, v: v, m: m);
}

import 'dart:math' as math;
import 'dart:typed_data';

/// An immutable 3D vector. Used for building models and for tests; the renderer works on
/// flat [Float32List]s so it does not allocate per vertex per frame.
class Vec3 {
  const Vec3(this.x, this.y, this.z);

  final double x, y, z;

  static const zero = Vec3(0, 0, 0);
  static const unitX = Vec3(1, 0, 0);
  static const unitY = Vec3(0, 1, 0);
  static const unitZ = Vec3(0, 0, 1);

  Vec3 operator +(Vec3 o) => Vec3(x + o.x, y + o.y, z + o.z);
  Vec3 operator -(Vec3 o) => Vec3(x - o.x, y - o.y, z - o.z);
  Vec3 operator -() => Vec3(-x, -y, -z);
  Vec3 operator *(double s) => Vec3(x * s, y * s, z * s);
  Vec3 operator /(double s) => Vec3(x / s, y / s, z / s);

  double dot(Vec3 o) => x * o.x + y * o.y + z * o.z;
  Vec3 cross(Vec3 o) => Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x);
  double get length => math.sqrt(x * x + y * y + z * z);
  Vec3 get normalized {
    final l = length;
    return l < 1e-12 ? this : this / l;
  }

  double distanceTo(Vec3 o) => (this - o).length;

  /// Angle between two vectors in degrees.
  double angleTo(Vec3 o) => math.acos((dot(o) / (length * o.length)).clamp(-1.0, 1.0)) * 180 / math.pi;

  Vec3 lerp(Vec3 o, double t) => Vec3(x + (o.x - x) * t, y + (o.y - y) * t, z + (o.z - z) * t);

  /// Any unit vector perpendicular to this one.
  Vec3 get anyPerpendicular {
    final a = x.abs() < 0.9 ? unitX : unitY;
    return cross(a).normalized;
  }

  @override
  bool operator ==(Object other) => other is Vec3 && other.x == x && other.y == y && other.z == z;

  @override
  int get hashCode => Object.hash(x, y, z);

  @override
  String toString() => 'Vec3(${x.toStringAsFixed(3)}, ${y.toStringAsFixed(3)}, ${z.toStringAsFixed(3)})';
}

/// A 4×4 affine transform stored column-major (the glTF and OpenGL convention).
class Mat4 {
  Mat4(this.m) : assert(m.length == 16);

  Mat4.identity() : m = Float64List(16) {
    m[0] = m[5] = m[10] = m[15] = 1;
  }

  factory Mat4.fromList(List<num> v) => Mat4(Float64List.fromList([for (final e in v) e.toDouble()]));

  factory Mat4.translation(Vec3 t) => Mat4.identity()
    ..m[12] = t.x
    ..m[13] = t.y
    ..m[14] = t.z;

  factory Mat4.scale(Vec3 s) => Mat4.identity()
    ..m[0] = s.x
    ..m[5] = s.y
    ..m[10] = s.z;

  /// Rotation about a unit [axis] by [radians] (right-handed).
  factory Mat4.rotation(Vec3 axis, double radians) {
    final a = axis.normalized;
    final c = math.cos(radians), s = math.sin(radians), t = 1 - c;
    return Mat4.fromList([
      t * a.x * a.x + c, t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y, 0, //
      t * a.x * a.y - s * a.z, t * a.y * a.y + c, t * a.y * a.z + s * a.x, 0,
      t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c, 0,
      0, 0, 0, 1,
    ]);
  }

  factory Mat4.rotationX(double r) => Mat4.rotation(Vec3.unitX, r);
  factory Mat4.rotationY(double r) => Mat4.rotation(Vec3.unitY, r);
  factory Mat4.rotationZ(double r) => Mat4.rotation(Vec3.unitZ, r);

  /// Unit quaternion (x, y, z, w) as used by glTF.
  factory Mat4.fromQuaternion(double x, double y, double z, double w) {
    final n = math.sqrt(x * x + y * y + z * z + w * w);
    if (n > 0) {
      x /= n;
      y /= n;
      z /= n;
      w /= n;
    }
    return Mat4.fromList([
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, //
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
      0, 0, 0, 1,
    ]);
  }

  /// Translation × rotation × scale, the order glTF uses.
  factory Mat4.trs(Vec3 t, List<double> q, Vec3 s) =>
      Mat4.translation(t) * Mat4.fromQuaternion(q[0], q[1], q[2], q[3]) * Mat4.scale(s);

  final Float64List m;

  Mat4 operator *(Mat4 o) {
    final r = Float64List(16);
    for (var c = 0; c < 4; c++) {
      for (var row = 0; row < 4; row++) {
        var s = 0.0;
        for (var k = 0; k < 4; k++) {
          s += m[k * 4 + row] * o.m[c * 4 + k];
        }
        r[c * 4 + row] = s;
      }
    }
    return Mat4(r);
  }

  Vec3 transformPoint(Vec3 p) => Vec3(
        m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
        m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
        m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
      );

  Vec3 transformDirection(Vec3 d) => Vec3(
        m[0] * d.x + m[4] * d.y + m[8] * d.z,
        m[1] * d.x + m[5] * d.y + m[9] * d.z,
        m[2] * d.x + m[6] * d.y + m[10] * d.z,
      );

  bool get isIdentity {
    for (var i = 0; i < 16; i++) {
      if (m[i] != ((i % 5 == 0) ? 1 : 0)) return false;
    }
    return true;
  }
}

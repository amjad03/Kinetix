import 'dart:math' as math;
import 'dart:ui';

import 'earth_map.dart';
import 'math3d.dart';
import 'model.dart';
import 'primitives.dart';

class _Planet {
  const _Planet(this.name, this.radius, this.orbit, this.periodYears, this.color, this.fact, {this.bands, this.rings = false, this.phase = 0});
  final String name;
  final double radius, orbit, periodYears, phase;
  final Color color;
  final String fact;
  final List<int>? bands;
  final bool rings;
}

const _planets = [
  _Planet('Mercury', 0.4, 3.8, 0.24, Color(0xFFA7A39E), 'Closest to the Sun. A year lasts 88 Earth days.', phase: 0.4),
  _Planet('Venus', 0.6, 5.0, 0.62, Color(0xFFE6C27F), 'The hottest planet: thick clouds of carbon dioxide trap heat.', phase: 2.1),
  _Planet('Earth', 0.64, 6.3, 1.0, Color(0xFF2F74D0), 'Our home. The only planet known to have life and liquid water on its surface.', phase: 4.0),
  _Planet('Mars', 0.5, 7.6, 1.88, Color(0xFFD0603A), 'The red planet: iron oxide (rust) in its soil. Has two small moons.', phase: 5.3),
  _Planet('Jupiter', 1.45, 10.2, 11.86, Color(0xFFD8B48C), 'The largest planet, a gas giant. Its Great Red Spot is a giant storm.',
      bands: [0xFFE3C9A6, 0xFFB98A64, 0xFFE8D5B9, 0xFFC49B74, 0xFFDCC2A0], phase: 1.2),
  _Planet('Saturn', 1.2, 13.8, 29.46, Color(0xFFE2C98E), 'Famous for its bright rings of ice and rock.',
      bands: [0xFFEAD7A6, 0xFFD5B97C, 0xFFE9D4A2], rings: true, phase: 3.1),
  _Planet('Uranus', 0.9, 16.6, 84.0, Color(0xFF8FD3DE), 'An ice giant that spins on its side.', phase: 5.9),
  _Planet('Neptune', 0.88, 18.8, 164.8, Color(0xFF4C70E0), 'The farthest planet, with the fastest winds in the Solar System.', phase: 0.9),
];

/// The catalogue's astronomy models.
abstract final class AstronomyModels {
  /// The Sun and eight planets on their orbits (sizes and distances not to scale).
  static Model3D solarSystem() {
    final parts = <ModelPart>[
      ModelPart(
        id: 'sun',
        mesh: Primitives.sphere(2.2, segments: 32, rings: 16, colorAt: (lat, lon) => _sunColor(lat, lon)),
        color: const Color(0xFFFFB300),
        emissive: true,
        name: 'Sun',
        description: 'A star: a ball of hot gases (mostly hydrogen and helium) that gives light and heat to all the planets.',
      ),
    ];
    final labels = <Label3D>[const Label3D('Sun', Vec3(0, 2.2, 0), partId: 'sun', emphasis: true)];
    final lines = <Line3D>[];
    for (final (i, p) in _planets.indexed) {
      final id = p.name.toLowerCase();
      final speed = 0.55 / math.sqrt(p.periodYears); // faster inner planets, still visible outer ones
      Mat4 motion(double t) {
        final a = p.phase + t * speed;
        return Mat4.translation(Vec3(p.orbit * math.cos(a), 0, -p.orbit * math.sin(a))) * Mat4.rotationY(t * 1.5);
      }

      final mesh = p.name == 'Earth'
          ? Primitives.sphere(p.radius, segments: 28, rings: 14)
          : Primitives.sphere(p.radius, segments: 24, rings: 12, colorAt: p.bands == null ? null : (lat, lon) => p.bands![((lat + 90) / 180 * 9).floor() % p.bands!.length]);
      parts.add(ModelPart(id: id, mesh: mesh, color: p.color, texture: p.name == 'Earth' ? earthTexture() : null, motion: motion, name: p.name, description: '${_ordinal(i + 1)} planet from the Sun. ${p.fact}'));
      if (p.rings) {
        parts.add(ModelPart(
          id: '$id-rings',
          mesh: Primitives.ring(p.radius * 1.35, p.radius * 2.2, segments: 48),
          color: const Color(0xFFA8987A),
          doubleSided: true,
          emissive: true,
          motion: (t) => motion(t) * Mat4.rotationX(0.45),
          name: 'Saturn\'s rings',
          description: 'Rings made of countless pieces of ice and rock, from dust-sized to house-sized.',
        ));
      }
      labels.add(Label3D(p.name, Vec3(0, p.radius, 0), partId: id));
      lines.add(Line3D(
        [for (var k = 0; k < 96; k++) Vec3(p.orbit * math.cos(k / 96 * 2 * math.pi), 0, -p.orbit * math.sin(k / 96 * 2 * math.pi))],
        closed: true,
        overlay: false,
        width: 1.2,
        opacity: 0.35,
      ));
    }
    return Model3D(
      title: 'The Solar System',
      caption: 'Eight planets move around the Sun in nearly circular orbits. Sizes and distances are not to scale. Tap a planet.',
      subjects: const ['Science', 'Geography', 'Class 6–8'],
      parts: parts,
      labels: labels,
      lines: lines,
      glows: const [Glow('sun', 4.6, Color(0x88FFB300))],
      pointLight: Vec3.zero,
      ambient: 0.3,
      initialYaw: -10,
      initialPitch: 34,
      animated: true,
      boundsRadius: 12.0,
      center: Vec3.zero,
    );
  }

  /// The Earth with its axis tilted 23.5°, lit by the Sun from one side (day and night),
  /// spinning west to east.
  static Model3D earth() {
    const r = 3.0;
    const tiltDeg = 23.5;
    final tilt = Mat4.rotationZ(tiltDeg * math.pi / 180); // north pole leans towards the Sun (June)
    final axis = tilt.transformDirection(Vec3.unitY);
    final spin = 2 * math.pi / 24; // one turn in 24 s: "one second per hour"
    final parts = <ModelPart>[
      ModelPart(
        id: 'earth',
        mesh: Primitives.sphere(r, segments: 64, rings: 32),
        color: const Color(0xFF2F74D0),
        texture: earthTexture(),
        motion: (t) => tilt * Mat4.rotationY(t * spin),
        name: 'Earth',
        description: 'Turns once on its axis in 24 hours (west to east), giving day and night.',
      ),
      ModelPart(
        id: 'axis-n',
        mesh: Primitives.rod(axis * r * 0.98, axis * r * 1.5, 0.06, segments: 10),
        color: const Color(0xFFE0E0E0),
        name: 'Axis of rotation',
        description: 'An imaginary line through the poles. It is tilted 23.5° from the perpendicular to the orbit.',
      ),
      ModelPart(
        id: 'axis-s',
        mesh: Primitives.rod(axis * -r * 0.98, axis * -r * 1.5, 0.06, segments: 10),
        color: const Color(0xFFE0E0E0),
        name: 'Axis of rotation',
        description: 'An imaginary line through the poles. It is tilted 23.5° from the perpendicular to the orbit.',
      ),
    ];
    final lines = <Line3D>[];
    // Equator, in arcs so the far half is drawn faint and dashed.
    const arcs = 24;
    for (var k = 0; k < arcs; k++) {
      Vec3 at(double f) => tilt.transformPoint(Vec3(r * 1.004 * math.cos(f * 2 * math.pi), 0, -r * 1.004 * math.sin(f * 2 * math.pi)));
      lines.add(Line3D(
        [for (var s = 0; s <= 3; s++) at((k + s / 3) / arcs)],
        accent: true,
        width: 2,
        normal: tilt.transformDirection(Vec3(math.cos((k + 0.5) / arcs * 2 * math.pi), 0, -math.sin((k + 0.5) / arcs * 2 * math.pi))),
      ));
    }
    // The perpendicular to the orbit and the 23.5° angle.
    lines.add(const Line3D([Vec3(0, r * 1.02, 0), Vec3(0, r * 1.6, 0)], dashed: true, width: 1.8, color: Color(0xFFB0BEC5)));
    final arc = <Vec3>[];
    for (var s = 0; s <= 16; s++) {
      final a = tiltDeg * math.pi / 180 * s / 16;
      arc.add(Vec3(-math.sin(a), math.cos(a), 0) * (r * 1.38));
    }
    lines.add(Line3D(arc, accent: true, width: 2.4));
    // Parallel rays of sunlight from the left.
    for (final y in [-2.0, 0.0, 2.0]) {
      lines.add(Line3D([Vec3(-9.5, y, 0), Vec3(-5.2, y, 0)], color: const Color(0xFFFFC107), width: 2.4, head: true, overlay: false));
    }
    final tiltRad = tiltDeg * math.pi / 180;
    final india = _onSphere(20.6, 79, r);
    return Model3D(
      title: 'The Earth: tilt, day and night',
      caption: 'The Sun lights one half of the Earth (day); the other half is in darkness (night). The axis is tilted 23.5°, '
          'so here, in June, the North Pole leans towards the Sun: long days in India, the Arctic has sunlight all day.',
      subjects: const ['Geography', 'Science', 'Class 6–9'],
      parts: parts,
      lines: lines,
      labels: [
        Label3D('North Pole', axis * r * 1.5, emphasis: true),
        Label3D('South Pole', axis * -r * 1.5),
        Label3D('Equator', tilt.transformPoint(Vec3(r * 0.5, 0, r * 0.866)), normal: tilt.transformDirection(const Vec3(0.5, 0, 0.866))),
        Label3D('23.5°', Vec3(-math.sin(tiltRad / 2), math.cos(tiltRad / 2), 0) * (r * 1.2), kind: LabelKind.dimension, emphasis: true),
        const Label3D('Sunlight', Vec3(-7.4, 2.55, 0), kind: LabelKind.dimension),
        Label3D('Day', const Vec3(-0.78, -0.35, 0.52).normalized * r, normal: const Vec3(-0.78, -0.35, 0.52)),
        Label3D('Night', const Vec3(0.8, -0.3, 0.52).normalized * r, normal: const Vec3(0.8, -0.3, 0.52)),
        Label3D('India', india, partId: 'earth', normal: india, emphasis: true),
      ],
      lightDirection: const Vec3(-1, 0, 0.18),
      lightFixedInWorld: true,
      ambient: 0.07,
      initialYaw: 0,
      initialPitch: 8,
      animated: true,
      boundsRadius: 5.6,
      center: const Vec3(-1.6, 0, 0),
    );
  }

  /// A point at latitude/longitude on the sphere built by [Primitives.sphere].
  static Vec3 _onSphere(double lat, double lon, double r) {
    final phi = (90 - lat) * math.pi / 180;
    final theta = (lon + 180) * math.pi / 180;
    return Vec3(math.sin(phi) * math.cos(theta), math.cos(phi), -math.sin(phi) * math.sin(theta)) * r;
  }

  static int _sunColor(double lat, double lon) {
    // Gentle mottling so the Sun does not look like a flat disc.
    final n = math.sin(lat * 0.21 + lon * 0.13) * math.cos(lon * 0.17 - lat * 0.05);
    return n > 0.35 ? 0xFFFFC94A : (n < -0.4 ? 0xFFFF9E1F : 0xFFFFB531);
  }

  static String _ordinal(int n) => switch (n) {
        1 => '1st',
        2 => '2nd',
        3 => '3rd',
        _ => '${n}th',
      };
}

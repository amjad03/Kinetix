import 'dart:math' as math;
import 'dart:ui';
import 'dart:ui' as ui;

import 'math3d.dart';
import 'mesh.dart';

/// Returns a part's transform at time [t] seconds (for animated models).
typedef PartMotion = Mat4 Function(double t);

/// One coloured, nameable piece of a model (an atom, a planet, the curved surface of a cone).
class ModelPart {
  const ModelPart({
    required this.id,
    required this.mesh,
    required this.color,
    this.name,
    this.description,
    this.emissive = false,
    this.doubleSided = false,
    this.pickable = true,
    this.outline = false,
    this.motion,
    this.texture,
  });

  final String id;
  final Mesh mesh;
  final Color color;

  /// Shown when the part is tapped. Parts without a name are not selectable.
  final String? name;
  final String? description;

  /// Lit from inside (the Sun): drawn at full brightness, no shading.
  final bool emissive;

  /// Thin surfaces (Saturn's rings) are drawn from both sides.
  final bool doubleSided;
  final bool pickable;

  /// Draw textbook-style edges: visible feature edges solid, hidden ones dashed, plus the
  /// silhouette of curved surfaces.
  final bool outline;

  final PartMotion? motion;

  /// An image wrapped with the mesh's texture coordinates (the Earth's map). Lighting
  /// modulates it.
  final ui.Image? texture;
}

enum LabelKind {
  /// A pill with a short leader line from the anchor, pushed away from the model centre.
  callout,

  /// A pill centred on the anchor (dimension values on measurement lines).
  dimension,
}

/// Text anchored to a 3D point, re-projected every frame.
class Label3D {
  const Label3D(this.text, this.anchor, {this.partId, this.kind = LabelKind.callout, this.normal, this.emphasis = false});

  final String text;
  final Vec3 anchor;

  /// When set, the anchor moves with the part and the label highlights with it.
  final String? partId;
  final LabelKind kind;

  /// Outward direction at the anchor. When it faces away from the viewer the label fades.
  final Vec3? normal;
  final bool emphasis;
}

/// A 3D polyline drawn in screen space: before the meshes ([overlay] false, e.g. orbits and
/// floor grids) or on top of them (measurement lines).
class Line3D {
  const Line3D(this.points, {this.color, this.width = 2, this.dashed = false, this.closed = false, this.overlay = true, this.partId, this.normal, this.arrows = false, this.head = false, this.opacity = 1});

  final List<Vec3> points;

  /// Null uses the theme's foreground colour.
  final Color? color;
  final double width;
  final bool dashed;
  final bool closed;
  final bool overlay;
  final String? partId;

  /// Outward direction; when it faces away the line is drawn dashed and faint (it is behind
  /// the solid).
  final Vec3? normal;

  /// Small end ticks, as on dimension lines.
  final bool arrows;

  /// An arrowhead at the last point (sunlight rays).
  final bool head;

  /// 0–1, multiplies the colour's alpha (faint floor grids).
  final double opacity;
}

/// A soft radial glow behind a part (the Sun).
class Glow {
  const Glow(this.partId, this.radius, this.color);
  final String partId;
  final double radius;
  final Color color;
}

/// A complete scene: parts, labels, lines and how it is lit.
class Model3D {
  Model3D({
    required this.title,
    required this.parts,
    this.caption = '',
    this.subjects = const [],
    this.labels = const [],
    this.lines = const [],
    this.glows = const [],
    this.ambient = 0.32,
    this.lightDirection = const Vec3(-0.45, 0.7, 0.55),
    this.lightFixedInWorld = false,
    this.pointLight,
    this.initialYaw = -30,
    this.initialPitch = 20,
    this.animated = false,
    this.boundsRadius,
    this.center,
  });

  final String title;
  final String caption;
  final List<String> subjects;
  final List<ModelPart> parts;
  final List<Label3D> labels;
  final List<Line3D> lines;
  final List<Glow> glows;

  /// Share of light that reaches faces turned away from the light.
  final double ambient;

  /// Direction towards the light. In camera space (a light over the viewer's left shoulder)
  /// unless [lightFixedInWorld], so day and night stay put while the viewer orbits the Earth.
  final Vec3 lightDirection;
  final bool lightFixedInWorld;

  /// A light at a world position (the Sun in the Solar System). Overrides [lightDirection].
  final Vec3? pointLight;

  /// Starting view, in degrees.
  final double initialYaw, initialPitch;

  /// Parts move with time (orbits, spin).
  final bool animated;

  final double? boundsRadius;
  final Vec3? center;

  int get triangleCount => parts.fold(0, (n, p) => n + p.mesh.triangleCount);
  int get vertexCount => parts.fold(0, (n, p) => n + p.mesh.vertexCount);

  ModelPart? partById(String id) {
    for (final p in parts) {
      if (p.id == id) return p;
    }
    return null;
  }

  /// Centre and radius of a sphere around every static vertex, used to fit the camera.
  (Vec3, double) get bounds {
    var minX = double.infinity, minY = double.infinity, minZ = double.infinity;
    var maxX = -double.infinity, maxY = -double.infinity, maxZ = -double.infinity;
    for (final p in parts) {
      final pos = p.mesh.positions;
      for (var i = 0; i < pos.length; i += 3) {
        if (pos[i] < minX) minX = pos[i];
        if (pos[i] > maxX) maxX = pos[i];
        if (pos[i + 1] < minY) minY = pos[i + 1];
        if (pos[i + 1] > maxY) maxY = pos[i + 1];
        if (pos[i + 2] < minZ) minZ = pos[i + 2];
        if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
      }
    }
    if (minX > maxX) return (center ?? Vec3.zero, boundsRadius ?? 1);
    final c = center ?? Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    var r2 = 0.0;
    for (final p in parts) {
      final pos = p.mesh.positions;
      for (var i = 0; i < pos.length; i += 3) {
        final dx = pos[i] - c.x, dy = pos[i + 1] - c.y, dz = pos[i + 2] - c.z;
        final d = dx * dx + dy * dy + dz * dz;
        if (d > r2) r2 = d;
      }
    }
    return (c, boundsRadius ?? (r2 == 0 ? 1 : math.sqrt(r2)));
  }
}


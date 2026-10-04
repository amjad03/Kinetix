import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import 'math3d.dart';
import 'model.dart';

/// An orbit camera around the model's centre. Angles in degrees.
class OrbitCamera {
  OrbitCamera({this.yaw = -30, this.pitch = 20, this.zoom = 1});

  double yaw, pitch, zoom;

  static const double fovDeg = 36;
  static const double minPitch = -85, maxPitch = 85, minZoom = 0.45, maxZoom = 5;

  void rotateBy(double dYaw, double dPitch) {
    yaw = (yaw + dYaw) % 360;
    pitch = (pitch + dPitch).clamp(minPitch, maxPitch);
  }

  void zoomBy(double factor) => zoom = (zoom * factor).clamp(minZoom, maxZoom);
}

/// Colours and text styles for everything the renderer draws that is not a mesh.
class RenderStyle {
  const RenderStyle({
    required this.foreground,
    required this.labelBackground,
    required this.labelForeground,
    required this.accent,
    required this.onAccent,
    required this.textStyle,
    this.labelScale = 1,
  });

  final Color foreground, labelBackground, labelForeground, accent, onAccent;
  final TextStyle textStyle;
  final double labelScale;
}

/// What to draw this frame.
class RenderOptions {
  const RenderOptions({this.labels = true, this.wireframe = false, this.selectedPartId, this.time = 0});
  final bool labels, wireframe;
  final String? selectedPartId;
  final double time;
}

/// A software renderer: transforms, culls back faces, sorts by depth (painter's algorithm),
/// shades with Lambert lighting and draws the whole mesh in one [Canvas.drawVertices] call.
///
/// All per-vertex and per-face buffers are allocated once per model and reused every frame.
class SceneRenderer {
  SceneRenderer(this.model) {
    final (c, r) = model.bounds;
    center = c;
    radius = r;
    var v = 0, t = 0;
    for (final p in model.parts) {
      _vBase.add(v);
      _tBase.add(t);
      v += p.mesh.vertexCount;
      t += p.mesh.triangleCount;
    }
    _vCount = v;
    _tCount = t;
    _cam = Float32List(v * 3);
    _scr = Float32List(v * 2);
    _vLight = Float32List(v);
    _faceDepth = Float32List(t);
    _faceFront = Uint8List(t);
    _facePart = Int32List(t);
    _faceShade = Float32List(t);
    _order = Int32List(t);
    _outPos = Float32List(t * 6);
    _outCol = Int32List(t * 3);
    for (var i = 0; i < model.parts.length; i++) {
      for (var k = 0; k < model.parts[i].mesh.triangleCount; k++) {
        _facePart[_tBase[i] + k] = i;
      }
    }
  }

  final Model3D model;
  late Vec3 center;
  late double radius;

  final _vBase = <int>[], _tBase = <int>[];
  late final int _vCount, _tCount;
  late final Float32List _cam, _scr, _vLight, _faceDepth, _faceShade, _outPos;
  late final Uint8List _faceFront;
  late final Int32List _facePart, _order, _outCol;
  int _visibleCount = 0;
  final _partMatrices = <Mat4>[];

  // Projection of the last frame, for hit testing and label placement.
  double _f = 1, _cx = 0, _cy = 0;
  Mat4 _view = Mat4.identity();

  /// Number of triangles drawn in the last frame (after back-face culling).
  int get lastVisibleTriangles => _visibleCount;
  int get totalTriangles => _tCount;
  int get totalVertices => _vCount;

  final _textCache = <String, TextPainter>{};
  TextStyle? _cachedStyle;

  /// Camera distance that fits a sphere of [fitRadius] in the view at zoom 1.
  static double fitDistance(double fitRadius) => fitRadius / math.sin(OrbitCamera.fovDeg / 2 * math.pi / 180) * 1.12;

  void paint(Canvas canvas, Size size, OrbitCamera camera, RenderStyle style, RenderOptions opts, {double? fitRadius}) {
    if (size.isEmpty) return;
    final dist = fitDistance(fitRadius ?? radius) / camera.zoom;
    _f = (math.min(size.width, size.height) / 2) / math.tan(OrbitCamera.fovDeg / 2 * math.pi / 180);
    _cx = size.width / 2;
    _cy = size.height / 2;
    _view = Mat4.translation(Vec3(0, 0, -dist)) *
        Mat4.rotationX(camera.pitch * math.pi / 180) *
        Mat4.rotationY(-camera.yaw * math.pi / 180) *
        Mat4.translation(-center);

    // Light in camera space.
    Vec3 lightDir;
    if (model.lightFixedInWorld) {
      lightDir = _view.transformDirection(model.lightDirection).normalized;
    } else {
      lightDir = model.lightDirection.normalized;
    }
    final point = model.pointLight == null ? null : _view.transformPoint(model.pointLight!);
    final lx = lightDir.x, ly = lightDir.y, lz = lightDir.z;
    final ambient = model.ambient;
    final near = dist * 0.02;

    // 1. Transform vertices to camera space and project.
    _partMatrices.clear();
    for (var pi = 0; pi < model.parts.length; pi++) {
      final part = model.parts[pi];
      final m = part.motion == null ? _view : _view * part.motion!(opts.time);
      _partMatrices.add(m);
      final e = m.m;
      final pos = part.mesh.positions;
      final nrm = part.mesh.normals;
      var o = _vBase[pi];
      for (var i = 0; i < pos.length; i += 3, o++) {
        final x = pos[i], y = pos[i + 1], z = pos[i + 2];
        final cx = e[0] * x + e[4] * y + e[8] * z + e[12];
        final cy = e[1] * x + e[5] * y + e[9] * z + e[13];
        final cz = e[2] * x + e[6] * y + e[10] * z + e[14];
        _cam[o * 3] = cx;
        _cam[o * 3 + 1] = cy;
        _cam[o * 3 + 2] = cz;
        final w = cz < -near ? -cz : near;
        _scr[o * 2] = _cx + _f * cx / w;
        _scr[o * 2 + 1] = _cy - _f * cy / w;
        if (nrm != null) {
          // Smooth shading: light each vertex.
          var nx = e[0] * nrm[i] + e[4] * nrm[i + 1] + e[8] * nrm[i + 2];
          var ny = e[1] * nrm[i] + e[5] * nrm[i + 1] + e[9] * nrm[i + 2];
          var nz = e[2] * nrm[i] + e[6] * nrm[i + 1] + e[10] * nrm[i + 2];
          final nl = math.sqrt(nx * nx + ny * ny + nz * nz);
          if (nl > 0) {
            nx /= nl;
            ny /= nl;
            nz /= nl;
          }
          _vLight[o] = _shade(nx, ny, nz, cx, cy, cz, lx, ly, lz, point, ambient, part.emissive);
        }
      }
    }

    // 2. Faces: normal, culling, depth, flat shade.
    var n = 0;
    for (var pi = 0; pi < model.parts.length; pi++) {
      final part = model.parts[pi];
      final idx = part.mesh.indices;
      final vb = _vBase[pi];
      final tb = _tBase[pi];
      final flat = part.mesh.normals == null;
      for (var t = 0; t < idx.length ~/ 3; t++) {
        final a = (vb + idx[t * 3]) * 3, b = (vb + idx[t * 3 + 1]) * 3, c = (vb + idx[t * 3 + 2]) * 3;
        final ax = _cam[a], ay = _cam[a + 1], az = _cam[a + 2];
        final ux = _cam[b] - ax, uy = _cam[b + 1] - ay, uz = _cam[b + 2] - az;
        final vx = _cam[c] - ax, vy = _cam[c + 1] - ay, vz = _cam[c + 2] - az;
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        final mx = (ax + _cam[b] + _cam[c]) / 3, my = (ay + _cam[b + 1] + _cam[c + 1]) / 3, mz = (az + _cam[b + 2] + _cam[c + 2]) / 3;
        final facing = -(nx * mx + ny * my + nz * mz);
        final ft = tb + t;
        final front = facing > 0;
        _faceFront[ft] = front ? 1 : 0;
        if (az > -near || _cam[b + 2] > -near || _cam[c + 2] > -near) continue;
        if (!front && !part.doubleSided) continue;
        if (flat || part.doubleSided) {
          final nl = math.sqrt(nx * nx + ny * ny + nz * nz);
          if (nl == 0) continue;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          if (!front) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          _faceShade[ft] = _shade(nx, ny, nz, mx, my, mz, lx, ly, lz, point, ambient, part.emissive);
        }
        _faceDepth[ft] = mz;
        _order[n++] = ft;
      }
    }
    _visibleCount = n;
    final sorted = Int32List.sublistView(_order, 0, n);
    sorted.sort((p, q) => _faceDepth[p].compareTo(_faceDepth[q]));

    // 3. Underlay lines (orbits, floor grid) and glows.
    for (final g in model.glows) {
      _paintGlow(canvas, g, opts);
    }
    for (final l in model.lines) {
      if (!l.overlay) _paintLine(canvas, l, style, opts);
    }

    // 4. The triangle batch.
    final selected = opts.selectedPartId;
    final accent = style.accent;
    final alpha = opts.wireframe ? 0x55 : 0xFF;
    var o = 0;
    for (var k = 0; k < n; k++) {
      final ft = sorted[k];
      final pi = _facePart[ft];
      final part = model.parts[pi];
      final vb = _vBase[pi];
      final t = ft - _tBase[pi];
      final idx = part.mesh.indices;
      final vcols = part.mesh.vertexColors;
      final smooth = part.mesh.normals != null && !part.doubleSided;
      final hl = selected != null && part.id == selected;
      for (var e = 0; e < 3; e++) {
        final local = idx[t * 3 + e];
        final v = vb + local;
        _outPos[o * 2] = _scr[v * 2];
        _outPos[o * 2 + 1] = _scr[v * 2 + 1];
        final base = vcols != null ? vcols[local] : part.color.toARGB32();
        final light = smooth ? _vLight[v] : _faceShade[ft];
        _outCol[o] = _litColor(base, light, hl ? accent : null, alpha);
        o++;
      }
    }
    if (n > 0) {
      final verts = ui.Vertices.raw(
        ui.VertexMode.triangles,
        Float32List.sublistView(_outPos, 0, n * 6),
        colors: Int32List.sublistView(_outCol, 0, n * 3),
      );
      canvas.drawVertices(verts, BlendMode.dst, Paint());
      verts.dispose();
    }

    // 5. Wireframe and textbook outlines.
    if (opts.wireframe) _paintWireframe(canvas, sorted, style);
    _paintOutlines(canvas, style, opts);

    // 6. Measurement lines and labels on top.
    for (final l in model.lines) {
      if (l.overlay) _paintLine(canvas, l, style, opts);
    }
    if (opts.labels) _paintLabels(canvas, size, style, opts);
  }

  double _shade(double nx, double ny, double nz, double px, double py, double pz, double lx, double ly, double lz, Vec3? point, double ambient, bool emissive) {
    if (emissive) return 1;
    if (point != null) {
      lx = point.x - px;
      ly = point.y - py;
      lz = point.z - pz;
      final l = math.sqrt(lx * lx + ly * ly + lz * lz);
      if (l > 0) {
        lx /= l;
        ly /= l;
        lz /= l;
      }
    }
    final diffuse = math.max(0.0, nx * lx + ny * ly + nz * lz);
    // A little light from the viewer so faces in shadow keep their form.
    final vl = math.sqrt(px * px + py * py + pz * pz);
    final fill = vl > 0 ? math.max(0.0, -(nx * px + ny * py + nz * pz) / vl) : 0.0;
    return ambient + (1 - ambient) * diffuse * 0.88 + model.ambient.clamp(0, 0.3) * 0.35 * fill;
  }

  static int _litColor(int argb, double light, Color? tint, int alpha) {
    var r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
    if (tint != null) {
      final t = tint.toARGB32();
      r = (r * 0.45 + ((t >> 16) & 0xFF) * 0.55).round();
      g = (g * 0.45 + ((t >> 8) & 0xFF) * 0.55).round();
      b = (b * 0.45 + (t & 0xFF) * 0.55).round();
    }
    final l = light.clamp(0.0, 1.25);
    r = (r * l).round().clamp(0, 255);
    g = (g * l).round().clamp(0, 255);
    b = (b * l).round().clamp(0, 255);
    return (alpha << 24) | (r << 16) | (g << 8) | b;
  }

  void _paintWireframe(Canvas canvas, Int32List sorted, RenderStyle style) {
    final pts = Float32List(sorted.length * 12);
    var o = 0;
    for (final ft in sorted) {
      final pi = _facePart[ft];
      final idx = model.parts[pi].mesh.indices;
      final t = ft - _tBase[pi];
      final vb = _vBase[pi];
      for (var e = 0; e < 3; e++) {
        final a = vb + idx[t * 3 + e], b = vb + idx[t * 3 + (e + 1) % 3];
        pts[o++] = _scr[a * 2];
        pts[o++] = _scr[a * 2 + 1];
        pts[o++] = _scr[b * 2];
        pts[o++] = _scr[b * 2 + 1];
      }
    }
    canvas.drawRawPoints(
      ui.PointMode.lines,
      pts,
      Paint()
        ..color = style.foreground.withValues(alpha: 0.55)
        ..strokeWidth = 1
        ..isAntiAlias = true,
    );
  }

  void _paintOutlines(Canvas canvas, RenderStyle style, RenderOptions opts) {
    final solid = <double>[];
    final hidden = Path();
    var phase = 0.0;
    for (var pi = 0; pi < model.parts.length; pi++) {
      final part = model.parts[pi];
      if (!part.outline) continue;
      final vb = _vBase[pi], tb = _tBase[pi];
      for (final e in part.mesh.featureEdges) {
        final f1 = _faceFront[tb + e.f1] == 1;
        final f2 = e.f2 >= 0 && _faceFront[tb + e.f2] == 1;
        final a = vb + e.a, b = vb + e.b;
        if (f1 || f2) {
          solid.addAll([_scr[a * 2], _scr[a * 2 + 1], _scr[b * 2], _scr[b * 2 + 1]]);
        } else {
          phase = _dash(hidden, Offset(_scr[a * 2], _scr[a * 2 + 1]), Offset(_scr[b * 2], _scr[b * 2 + 1]), phase);
        }
      }
      if (part.mesh.normals != null) {
        for (final e in part.mesh.allEdges) {
          if (e.f2 < 0) continue;
          if (_faceFront[tb + e.f1] != _faceFront[tb + e.f2]) {
            final a = vb + e.a, b = vb + e.b;
            solid.addAll([_scr[a * 2], _scr[a * 2 + 1], _scr[b * 2], _scr[b * 2 + 1]]);
          }
        }
      }
    }
    if (solid.isEmpty && hidden.getBounds().isEmpty) return;
    final w = 1.6 * style.labelScale;
    canvas.drawPath(
      hidden,
      Paint()
        ..color = style.foreground.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = w * 0.8,
    );
    canvas.drawRawPoints(
      ui.PointMode.lines,
      Float32List.fromList(solid),
      Paint()
        ..color = style.foreground.withValues(alpha: 0.85)
        ..strokeWidth = w
        ..strokeCap = StrokeCap.round
        ..isAntiAlias = true,
    );
  }

  /// Appends a dashed segment to [path], continuing the dash pattern from [phase].
  static double _dash(Path path, Offset a, Offset b, double phase, {double on = 7, double off = 5}) {
    final d = b - a;
    final len = d.distance;
    if (len == 0) return phase;
    final dir = d / len;
    var s = 0.0;
    final period = on + off;
    while (s < len) {
      final inPeriod = (phase + s) % period;
      if (inPeriod < on) {
        final end = math.min(len, s + (on - inPeriod));
        path
          ..moveTo(a.dx + dir.dx * s, a.dy + dir.dy * s)
          ..lineTo(a.dx + dir.dx * end, a.dy + dir.dy * end);
        s = end;
      } else {
        s += period - inPeriod;
      }
    }
    return (phase + len) % period;
  }

  Mat4 _matrixFor(String? partId) {
    if (partId == null) return _view;
    for (var i = 0; i < model.parts.length; i++) {
      if (model.parts[i].id == partId && i < _partMatrices.length) return _partMatrices[i];
    }
    return _view;
  }

  /// Camera-space position of a model point (optionally riding on a moving part).
  Vec3 toCamera(Vec3 p, {String? partId}) => _matrixFor(partId).transformPoint(p);

  Offset project(Vec3 c) {
    final w = c.z < -1e-6 ? -c.z : 1e-6;
    return Offset(_cx + _f * c.x / w, _cy - _f * c.y / w);
  }

  bool _facesAway(Vec3? normal, Vec3 camPoint, String? partId) {
    if (normal == null) return false;
    final n = _matrixFor(partId).transformDirection(normal);
    return n.dot(-camPoint) < 0;
  }

  void _paintLine(Canvas canvas, Line3D l, RenderStyle style, RenderOptions opts) {
    if (l.points.length < 2) return;
    final cams = [for (final p in l.points) toCamera(p, partId: l.partId)];
    final away = _facesAway(l.normal, cams.first.lerp(cams.last, 0.5), l.partId);
    final pts = [for (final c in cams) project(c)];
    final color = (l.color ?? style.foreground).withValues(alpha: (away ? 0.4 : (l.color?.a ?? 1)) * l.opacity);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = l.width * (l.overlay ? style.labelScale : 1)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path();
    if (l.dashed || away) {
      var phase = 0.0;
      for (var i = 0; i < pts.length - 1; i++) {
        phase = _dash(path, pts[i], pts[i + 1], phase);
      }
      if (l.closed) _dash(path, pts.last, pts.first, phase);
    } else {
      path.addPolygon(pts, l.closed);
    }
    canvas.drawPath(path, paint);
    if (l.head) {
      final tip = pts.last, from = pts[pts.length - 2];
      final d = tip - from;
      if (d.distance > 0) {
        final u = d / d.distance, nrm = Offset(-u.dy, u.dx);
        final len = 9.0 * style.labelScale;
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..lineTo(tip.dx - u.dx * len + nrm.dx * len * 0.5, tip.dy - u.dy * len + nrm.dy * len * 0.5)
            ..lineTo(tip.dx - u.dx * len - nrm.dx * len * 0.5, tip.dy - u.dy * len - nrm.dy * len * 0.5)
            ..close(),
          Paint()..color = color,
        );
      }
    }
    if (l.arrows) {
      // Perpendicular end ticks, as on a dimension line.
      final d = pts.last - pts.first;
      if (d.distance > 0) {
        final nrm = Offset(-d.dy, d.dx) / d.distance * 6 * style.labelScale;
        canvas.drawLine(pts.first - nrm, pts.first + nrm, paint);
        canvas.drawLine(pts.last - nrm, pts.last + nrm, paint);
      }
    }
  }

  void _paintGlow(Canvas canvas, Glow g, RenderOptions opts) {
    final c = toCamera(Vec3.zero, partId: g.partId);
    if (c.z >= 0) return;
    final p = project(c);
    final r = _f * g.radius / -c.z;
    canvas.drawCircle(
      p,
      r,
      Paint()
        ..shader = RadialGradient(colors: [g.color, g.color.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: p, radius: r)),
    );
  }

  TextPainter _text(String s, RenderStyle style, {required bool emphasis, bool selected = false}) {
    if (!identical(_cachedStyle, style.textStyle) || _textCache.length > 300) {
      for (final t in _textCache.values) {
        t.dispose();
      }
      _textCache.clear();
      _cachedStyle = style.textStyle;
    }
    final key = '${emphasis ? 1 : 0}${selected ? 1 : 0}|${style.labelScale.toStringAsFixed(2)}|$s';
    return _textCache.putIfAbsent(key, () {
      final base = style.textStyle;
      return TextPainter(
        text: TextSpan(
          text: s,
          style: base.copyWith(
            fontSize: (base.fontSize ?? 14) * style.labelScale,
            fontWeight: emphasis ? FontWeight.w700 : FontWeight.w500,
            color: selected ? style.onAccent : style.labelForeground,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
      )..layout();
    });
  }

  void _paintLabels(Canvas canvas, Size size, RenderStyle style, RenderOptions opts) {
    final centerScr = project(toCamera(center));
    final placed = <Rect>[];
    final s = style.labelScale;
    for (final l in model.labels) {
      final c = toCamera(l.anchor, partId: l.partId);
      if (c.z >= 0) continue;
      final anchor = project(c);
      final away = _facesAway(l.normal, c, l.partId);
      final selected = l.partId != null && l.partId == opts.selectedPartId;
      final tp = _text(l.text, style, emphasis: l.emphasis || selected, selected: selected);
      final pad = EdgeInsets.symmetric(horizontal: 8 * s, vertical: 4 * s);
      final w = tp.width + pad.horizontal, h = tp.height + pad.vertical;
      Rect rect;
      Offset? leaderEnd;
      if (l.kind == LabelKind.dimension) {
        rect = Rect.fromCenter(center: anchor, width: w, height: h);
      } else {
        var dir = anchor - centerScr;
        dir = dir.distance < 4 ? const Offset(0.6, -0.8) : dir / dir.distance;
        var len = 26.0 * s;
        rect = _calloutRect(anchor, dir, len, w, h);
        // Nudge outwards until it no longer overlaps an earlier label.
        for (var tries = 0; tries < 6 && placed.any((r) => r.overlaps(rect)); tries++) {
          len += h * 0.9;
          rect = _calloutRect(anchor, dir, len, w, h);
        }
        leaderEnd = anchor + dir * len;
      }
      // Keep labels inside the view.
      final dx = rect.left < 4 ? 4 - rect.left : (rect.right > size.width - 4 ? size.width - 4 - rect.right : 0.0);
      final dy = rect.top < 4 ? 4 - rect.top : (rect.bottom > size.height - 4 ? size.height - 4 - rect.bottom : 0.0);
      rect = rect.shift(Offset(dx, dy));
      placed.add(rect);
      final opacity = away ? 0.45 : 1.0;
      final bg = selected ? style.accent : style.labelBackground;
      if (leaderEnd != null) {
        final lp = Paint()
          ..color = style.foreground.withValues(alpha: 0.75 * opacity)
          ..strokeWidth = 1.4 * s;
        canvas.drawLine(anchor, _nearestOnRect(rect, anchor), lp);
        canvas.drawCircle(anchor, 3 * s, Paint()..color = style.foreground.withValues(alpha: opacity));
      }
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(h / 2)),
        Paint()..color = bg.withValues(alpha: (selected ? 1.0 : 0.9) * opacity),
      );
      if (opacity < 1) {
        canvas.saveLayer(rect, Paint()..color = Color.fromRGBO(0, 0, 0, opacity));
        tp.paint(canvas, rect.topLeft + Offset(pad.left, pad.top));
        canvas.restore();
      } else {
        tp.paint(canvas, rect.topLeft + Offset(pad.left, pad.top));
      }
    }
  }

  static Rect _calloutRect(Offset anchor, Offset dir, double len, double w, double h) {
    final end = anchor + dir * len;
    // Attach the pill by its nearest side.
    final cx = end.dx + (dir.dx >= 0 ? w / 2 : -w / 2) * (dir.dx.abs() > 0.3 ? 1 : 0);
    final cy = end.dy + (dir.dy >= 0 ? h / 2 : -h / 2) * (dir.dx.abs() <= 0.3 ? 1 : 0.4);
    return Rect.fromCenter(center: Offset(cx, cy), width: w, height: h);
  }

  static Offset _nearestOnRect(Rect r, Offset p) => Offset(p.dx.clamp(r.left, r.right), p.dy.clamp(r.top, r.bottom));

  /// The named part under [p] in the last frame, front-most first.
  String? hitTest(Offset p) {
    final sorted = Int32List.sublistView(_order, 0, _visibleCount);
    for (var k = sorted.length - 1; k >= 0; k--) {
      final ft = sorted[k];
      final pi = _facePart[ft];
      final part = model.parts[pi];
      final idx = part.mesh.indices;
      final t = ft - _tBase[pi];
      final vb = _vBase[pi];
      final a = vb + idx[t * 3], b = vb + idx[t * 3 + 1], c = vb + idx[t * 3 + 2];
      if (_inTriangle(p, a, b, c)) {
        return part.pickable && part.name != null ? part.id : null;
      }
    }
    return null;
  }

  bool _inTriangle(Offset p, int a, int b, int c) {
    double sign(double x1, double y1, double x2, double y2, double x3, double y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    final ax = _scr[a * 2], ay = _scr[a * 2 + 1], bx = _scr[b * 2], by = _scr[b * 2 + 1], cx = _scr[c * 2], cy = _scr[c * 2 + 1];
    final d1 = sign(p.dx, p.dy, ax, ay, bx, by), d2 = sign(p.dx, p.dy, bx, by, cx, cy), d3 = sign(p.dx, p.dy, cx, cy, ax, ay);
    final neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }

  /// Screen position of a part's origin in the last frame (for tests and overlays).
  Offset projectPart(String partId) => project(toCamera(Vec3.zero, partId: partId));

  void dispose() {
    for (final t in _textCache.values) {
      t.dispose();
    }
    _textCache.clear();
  }
}

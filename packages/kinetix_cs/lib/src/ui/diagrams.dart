import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'draw.dart';

/// Flowchart, UML (class and sequence) and ER shapes, and the connectors between them, as
/// ordinary board elements (the board groups each shape so it moves as one).

enum FlowPart { startEnd, process, decision, io, predefined, connector }

enum ErPart { entity, weakEntity, attribute, key, multivalued, derived, relationship, identifying }

enum Connector { arrow, association, inheritance, composition, aggregation, dependency, message, reply, line }

List<BoardElement> _label(String s, Offset c, Color ink, {double size = 20, bool underline = false}) {
  if (s.trim().isEmpty) return const [];
  final t = text(s.trim(), c, color: ink, size: size, center: true);
  return [
    t,
    if (underline) line(Offset(t.position.dx, t.position.dy + t.size.height + 1), Offset(t.position.dx + t.size.width, t.position.dy + t.size.height + 1), color: ink, width: 2),
  ];
}

List<Offset> _rhombus(Rect r) => [r.topCenter, r.centerRight, r.bottomCenter, r.centerLeft];

/// A flowchart part, 220 × 100 (the connector is a small circle).
List<BoardElement> flowPart(FlowPart p, String label, {Color ink = inkColor}) {
  const r = Rect.fromLTWH(0, 0, 220, 100);
  return switch (p) {
    FlowPart.startEnd => [shape(ShapeKind.ellipse, r.topLeft, r.bottomRight, color: ink), ..._label(label, r.center, ink)],
    FlowPart.process => [box(r, color: ink), ..._label(label, r.center, ink)],
    FlowPart.decision => [poly(_rhombus(r), color: ink), ..._label(label, r.center, ink)],
    FlowPart.io => [poly([const Offset(30, 0), const Offset(220, 0), const Offset(190, 100), const Offset(0, 100)], color: ink), ..._label(label, r.center, ink)],
    FlowPart.predefined => [box(r, color: ink), line(const Offset(18, 0), const Offset(18, 100), color: ink), line(const Offset(202, 0), const Offset(202, 100), color: ink), ..._label(label, r.center, ink)],
    FlowPart.connector => [circle(const Offset(30, 30), 30, color: ink), ..._label(label.isEmpty ? 'A' : label, const Offset(30, 30), ink, size: 22)],
  };
}

/// A UML class box from "Name / attributes / -- / methods" lines ([interface] adds «interface»).
List<BoardElement> umlClass(String spec, {Color ink = inkColor, bool interface = false}) {
  final lines = spec.split('\n').map((l) => l.trimRight()).where((l) => l.trim().isNotEmpty).toList();
  final name = lines.isEmpty ? 'Class' : lines.first.trim();
  final rest = lines.skip(1).toList();
  final cut = rest.indexWhere((l) => l.trim() == '--');
  final attrs = cut < 0 ? rest.where((l) => !l.contains('(')).toList() : rest.sublist(0, cut);
  final methods = cut < 0 ? rest.where((l) => l.contains('(')).toList() : rest.sublist(cut + 1);
  const size = 20.0, lineH = 28.0, pad = 12.0;
  final head = [if (interface) '«interface»', name];
  final widest = [...head, ...attrs, ...methods].map((s) => measureBoardText(s, size, bold: true).width).fold(160.0, math.max);
  final w = widest + 2 * pad;
  final out = <BoardElement>[];
  var y = 0.0;
  final headH = head.length * lineH + pad;
  out.add(box(Rect.fromLTWH(0, 0, w, headH), color: ink, fill: const Color(0x14006879)));
  for (final (i, h) in head.indexed) {
    out.add(text(h, Offset(w / 2, pad / 2 + lineH * (i + 0.5)), color: ink, size: i == head.length - 1 ? size : 16, bold: i == head.length - 1, center: true));
  }
  y = headH;
  for (final section in [attrs, methods]) {
    final h = math.max(1, section.length) * lineH + pad;
    out.add(box(Rect.fromLTWH(0, y, w, h), color: ink));
    for (final (i, s) in section.indexed) {
      out.add(text(s.trim(), Offset(pad, y + pad / 2 + i * lineH), color: ink, size: size));
    }
    y += h;
  }
  return out;
}

/// A sequence diagram's participant: a box (or a stick figure for an actor) and its dashed
/// lifeline, [length] long.
List<BoardElement> lifeline(String name, {Color ink = inkColor, bool actor = false, double length = 420}) {
  final out = <BoardElement>[];
  final label = name.trim().isEmpty ? (actor ? 'User' : ':Object') : name.trim();
  if (actor) {
    out.addAll([
      circle(const Offset(80, 14), 14, color: ink),
      line(const Offset(80, 28), const Offset(80, 62), color: ink),
      line(const Offset(58, 40), const Offset(102, 40), color: ink),
      line(const Offset(80, 62), const Offset(62, 88), color: ink),
      line(const Offset(80, 62), const Offset(98, 88), color: ink),
      text(label, const Offset(80, 104), color: ink, size: 20, center: true),
    ]);
  } else {
    final t = measureBoardText(label, 20, bold: true);
    final w = math.max(160.0, t.width + 32);
    out
      ..add(box(Rect.fromLTWH(80 - w / 2, 40, w, 56), color: ink, fill: const Color(0x14006879)))
      ..add(text(label, const Offset(80, 68), color: ink, size: 20, bold: true, center: true));
  }
  out.addAll(dashed(const Offset(80, 118), Offset(80, 118 + length), color: ink, width: 2));
  return out;
}

/// A tall thin activation bar for a sequence diagram.
List<BoardElement> activationBar({Color ink = inkColor}) => [box(const Rect.fromLTWH(0, 0, 18, 120), color: ink, fill: const Color(0xFFFFFFFF))];

/// An ER diagram shape around (0, 0).
List<BoardElement> erPart(ErPart p, String label, {Color ink = inkColor}) {
  const r = Rect.fromLTWH(0, 0, 200, 90);
  const e = Rect.fromLTWH(0, 0, 180, 80);
  return switch (p) {
    ErPart.entity => [box(r, color: ink), ..._label(label, r.center, ink)],
    ErPart.weakEntity => [box(r, color: ink), box(r.deflate(7), color: ink), ..._label(label, r.center, ink)],
    ErPart.attribute => [shape(ShapeKind.ellipse, e.topLeft, e.bottomRight, color: ink), ..._label(label, e.center, ink)],
    ErPart.key => [shape(ShapeKind.ellipse, e.topLeft, e.bottomRight, color: ink), ..._label(label, e.center, ink, underline: true)],
    ErPart.multivalued => [shape(ShapeKind.ellipse, e.topLeft, e.bottomRight, color: ink), shape(ShapeKind.ellipse, e.topLeft + const Offset(7, 7), e.bottomRight - const Offset(7, 7), color: ink), ..._label(label, e.center, ink)],
    ErPart.derived => [
      for (var a = 0; a < 24; a += 2)
        line(_onEllipse(e, a / 24 * 2 * math.pi), _onEllipse(e, (a + 1) / 24 * 2 * math.pi), color: ink),
      ..._label(label, e.center, ink),
    ],
    ErPart.relationship => [poly(_rhombus(r), color: ink), ..._label(label, r.center, ink)],
    ErPart.identifying => [poly(_rhombus(r), color: ink), poly(_rhombus(r.deflate(10)), color: ink), ..._label(label, r.center, ink)],
  };
}

Offset _onEllipse(Rect e, double t) => e.center + Offset(math.cos(t) * e.width / 2, math.sin(t) * e.height / 2);

/// A connector from box [a] to box [b]: straight between the nearest sides, with the head
/// (and dash) of [kind]; [label] (e.g. a cardinality or a message) at its middle.
List<BoardElement> connect(Rect a, Rect b, Connector kind, {Color ink = inkColor, String label = ''}) {
  // Leave from the side facing the other box.
  final d = b.center - a.center;
  final horizontal = d.dx.abs() * a.height > d.dy.abs() * a.width;
  final from = horizontal ? (d.dx > 0 ? a.centerRight : a.centerLeft) : (d.dy > 0 ? a.bottomCenter : a.topCenter);
  final to = horizontal ? (d.dx > 0 ? b.centerLeft : b.centerRight) : (d.dy > 0 ? b.topCenter : b.bottomCenter);
  return connectPoints(from, to, kind, ink: ink, label: label);
}

List<BoardElement> connectPoints(Offset from, Offset to, Connector kind, {Color ink = inkColor, String label = ''}) {
  final out = <BoardElement>[];
  final v = to - from;
  if (v.distance < 1) return out;
  final u = v / v.distance, n = Offset(-u.dy, u.dx);
  // How far back from the tip the line stops, for the head drawn there.
  final headLen = switch (kind) {
    Connector.inheritance => 20.0,
    Connector.composition || Connector.aggregation => 30.0,
    _ => 0.0,
  };
  final lineEnd = to - u * headLen;
  final dashedLine = kind == Connector.dependency || kind == Connector.reply;
  if (dashedLine) {
    out.addAll(dashed(from, lineEnd, color: ink));
  } else {
    out.add(line(from, lineEnd, color: ink));
  }
  switch (kind) {
    case Connector.arrow || Connector.dependency || Connector.message || Connector.reply:
      final open = kind == Connector.dependency || kind == Connector.reply;
      final pts = [to - u * 16 + n * 8, to, to - u * 16 - n * 8];
      out.add(poly(pts, color: ink, fill: open ? null : ink, closed: !open));
    case Connector.inheritance:
      out.add(poly([to, to - u * 20 + n * 12, to - u * 20 - n * 12], color: ink, fill: const Color(0xFFFFFFFF)));
    case Connector.composition || Connector.aggregation:
      out.add(poly([to, to - u * 15 + n * 9, to - u * 30, to - u * 15 - n * 9], color: ink, fill: kind == Connector.composition ? ink : const Color(0xFFFFFFFF)));
    case Connector.association || Connector.line:
      break;
  }
  if (label.trim().isNotEmpty) out.add(text(label.trim(), (from + to) / 2 + n * 16, color: ink, size: 18, center: true));
  return out;
}

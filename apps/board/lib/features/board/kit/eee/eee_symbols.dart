import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The electrical symbols the textbook set (cell, battery, bulb, switches, resistor, ammeter,
/// voltmeter, LED, earth: kit/builders.dart `Circuit`) does not have, drawn to IEC 60617 /
/// IS 12032 as ordinary board elements, 160 wide with leads at (0, 40) and (160, 40) like the
/// others (the transistors and the transformer have their own leads). The circuit tool lists
/// both sets.
enum EeeSymbol {
  inductor,
  ironCoreInductor,
  capacitor,
  variableResistor,
  acSource,
  dcSource,
  currentSource,
  diode,
  zener,
  npn,
  pnp,
  fuse,
  circuitBreaker,
  relay,
  transformer,
  motor,
  generator,
  wattmeter,
  ohmmeter,
  galvanometer,
}

TextElement _text(String t, Offset at, Color c, {double size = 22, bool bold = false}) {
  final s = measureBoardText(t, size, bold: bold);
  return TextElement(id: newElementId(), position: at - Offset(s.width / 2, s.height / 2), text: t, color: c, fontSize: size, size: s, bold: bold);
}

Stroke _shape(ShapeKind kind, Offset a, Offset b, Color c, {double w = 3, Color? fill}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: c, width: w, shape: kind),
  shape: kind,
  fill: fill,
  points: shapePoints(kind, a, b),
);

Stroke _line(Offset a, Offset b, Color c, {double w = 3, ShapeKind kind = ShapeKind.line}) => _shape(kind, a, b, c, w: w);

Stroke _circle(Offset c, double r, Color col, {bool fill = false, double w = 3}) => _shape(ShapeKind.circle, c, c + Offset(r, 0), col, w: w, fill: fill ? col : null);

PolygonElement _poly(List<Offset> pts, Color c, {bool closed = false, double w = 3, Color? fill}) => PolygonElement(id: newElementId(), points: pts, color: c, width: w, closed: closed, fill: fill);

/// Four half-loops from [a] along [dir] (unit), bulging to [side] (unit), [r] each.
List<Offset> _coil(Offset a, Offset dir, Offset side, double r) => [
  for (var k = 0; k < 4; k++)
    for (var j = 0; j <= 12; j++) a + dir * (r * (2 * k + 1) - r * math.cos(math.pi * j / 12)) + side * (r * math.sin(math.pi * j / 12)),
];

/// [s] as board elements around (0, 0) in [ink].
List<BoardElement> eeeSymbol(EeeSymbol s, Color ink) {
  const y = 40.0;
  final out = <BoardElement>[];
  void leads(double l, double r) {
    out.add(_line(const Offset(0, y), Offset(l, y), ink));
    out.add(_line(Offset(r, y), const Offset(160, y), ink));
  }

  void meter(String label) {
    leads(56, 104);
    out.add(_circle(const Offset(80, y), 24, ink));
    out.add(_text(label, const Offset(80, y), ink, size: 24, bold: true));
  }

  void transistor(bool npn) {
    // Base from the left, collector up, emitter down, in a circle.
    out.add(_circle(const Offset(88, y), 32, ink, w: 2.4));
    out.add(_line(const Offset(0, y), const Offset(74, y), ink));
    out.add(_line(const Offset(74, y - 20), const Offset(74, y + 20), ink, w: 4));
    out.add(_line(const Offset(74, y - 9), const Offset(104, y - 28), ink));
    out.add(_line(const Offset(104, y - 28), const Offset(104, y - 56), ink));
    if (npn) {
      out.add(_line(const Offset(74, y + 9), const Offset(104, y + 28), ink, kind: ShapeKind.arrow));
    } else {
      out.add(_line(const Offset(104, y + 28), const Offset(76, y + 10), ink, kind: ShapeKind.arrow));
    }
    out.add(_line(const Offset(104, y + 28), const Offset(104, y + 56), ink));
    out.add(_text(npn ? 'NPN' : 'PNP', const Offset(140, y), ink, size: 15));
    out.add(_text('B', const Offset(30, y - 14), ink, size: 15));
    out.add(_text('C', const Offset(118, y - 50), ink, size: 15));
    out.add(_text('E', const Offset(118, y + 50), ink, size: 15));
  }

  switch (s) {
    case EeeSymbol.inductor:
      leads(40, 120);
      out.add(_poly(_coil(const Offset(40, y), const Offset(1, 0), const Offset(0, -1), 10), ink));
    case EeeSymbol.ironCoreInductor:
      leads(40, 120);
      out.add(_poly(_coil(const Offset(40, y), const Offset(1, 0), const Offset(0, -1), 10), ink));
      out.add(_line(const Offset(40, y - 18), const Offset(120, y - 18), ink, w: 2.4));
      out.add(_line(const Offset(40, y - 24), const Offset(120, y - 24), ink, w: 2.4));
    case EeeSymbol.capacitor:
      leads(74, 86);
      out.add(_line(const Offset(74, y - 24), const Offset(74, y + 24), ink, w: 4));
      out.add(_line(const Offset(86, y - 24), const Offset(86, y + 24), ink, w: 4));
    case EeeSymbol.variableResistor:
      leads(40, 120);
      out.add(_shape(ShapeKind.rectangle, const Offset(40, y - 14), const Offset(120, y + 14), ink));
      out.add(_line(const Offset(48, y + 30), const Offset(114, y - 30), ink, w: 2.4, kind: ShapeKind.arrow));
    case EeeSymbol.acSource:
      leads(56, 104);
      out.add(_circle(const Offset(80, y), 24, ink));
      out.add(_poly([for (var j = 0; j <= 24; j++) Offset(66 + j * 28 / 24, y - 8 * math.sin(j / 24 * 2 * math.pi))], ink, w: 2.4));
    case EeeSymbol.dcSource:
      // An ideal voltage source: the circle with a line through it; + on the left.
      leads(56, 104);
      out.add(_circle(const Offset(80, y), 24, ink));
      out.add(_line(const Offset(56, y), const Offset(104, y), ink, w: 2.4));
      out.add(_text('+', const Offset(48, y - 22), ink, size: 20, bold: true));
      out.add(_text('−', const Offset(112, y - 22), ink, size: 20, bold: true));
    case EeeSymbol.currentSource:
      leads(56, 104);
      out.add(_circle(const Offset(80, y), 24, ink));
      out.add(_line(const Offset(66, y), const Offset(96, y), ink, w: 2.4, kind: ShapeKind.arrow));
    case EeeSymbol.diode || EeeSymbol.zener:
      leads(62, 98);
      out.add(_poly(const [Offset(62, y - 18), Offset(62, y + 18), Offset(94, y)], ink, closed: true));
      out.add(_line(const Offset(96, y - 18), const Offset(96, y + 18), ink));
      if (s == EeeSymbol.zener) {
        out.add(_line(const Offset(96, y - 18), const Offset(88, y - 24), ink));
        out.add(_line(const Offset(96, y + 18), const Offset(104, y + 24), ink));
      }
    case EeeSymbol.npn:
      transistor(true);
    case EeeSymbol.pnp:
      transistor(false);
    case EeeSymbol.fuse:
      leads(40, 120);
      out.add(_shape(ShapeKind.rectangle, const Offset(40, y - 11), const Offset(120, y + 11), ink));
      out.add(_line(const Offset(40, y), const Offset(120, y), ink, w: 2));
    case EeeSymbol.circuitBreaker:
      // A switch with a cross at the fixed contact.
      leads(56, 104);
      out.add(_circle(const Offset(56, y), 4, ink, fill: true));
      out.add(_line(const Offset(56, y), const Offset(100, y - 26), ink));
      out.add(_line(const Offset(98, y - 8), const Offset(110, y + 4), ink, w: 2.4));
      out.add(_line(const Offset(98, y + 4), const Offset(110, y - 8), ink, w: 2.4));
    case EeeSymbol.relay:
      // The coil (a rectangle) with its contact above, linked by a dashed line.
      leads(56, 104);
      out.add(_shape(ShapeKind.rectangle, const Offset(56, y - 16), const Offset(104, y + 16), ink));
      out.add(_line(const Offset(56, y + 16), const Offset(104, y - 16), ink, w: 2));
      out.add(_line(const Offset(30, y - 60), const Offset(60, y - 60), ink));
      out.add(_line(const Offset(60, y - 60), const Offset(98, y - 80), ink));
      out.add(_line(const Offset(100, y - 60), const Offset(130, y - 60), ink));
      for (var k = 0; k < 4; k++) {
        out.add(_line(Offset(80, y - 18 - k * 12.0), Offset(80, y - 24 - k * 12.0), ink, w: 2));
      }
      out.add(_text('K', const Offset(122, y + 26), ink, size: 16, bold: true));
    case EeeSymbol.transformer:
      // Two windings and the iron core between them; primary leads left, secondary right.
      out.add(_poly(_coil(const Offset(60, 0), const Offset(0, 1), const Offset(1, 0), 10), ink));
      out.add(_poly(_coil(const Offset(100, 0), const Offset(0, 1), const Offset(-1, 0), 10), ink));
      out.add(_line(const Offset(76, -4), const Offset(76, 84), ink, w: 2.4));
      out.add(_line(const Offset(84, -4), const Offset(84, 84), ink, w: 2.4));
      out.add(_line(const Offset(0, 0), const Offset(60, 0), ink));
      out.add(_line(const Offset(0, 80), const Offset(60, 80), ink));
      out.add(_line(const Offset(100, 0), const Offset(160, 0), ink));
      out.add(_line(const Offset(100, 80), const Offset(160, 80), ink));
    case EeeSymbol.motor:
      meter('M');
    case EeeSymbol.generator:
      meter('G');
    case EeeSymbol.wattmeter:
      meter('W');
    case EeeSymbol.ohmmeter:
      meter('Ω');
    case EeeSymbol.galvanometer:
      leads(56, 104);
      out.add(_circle(const Offset(80, y), 24, ink));
      out.add(_line(const Offset(66, y + 14), const Offset(94, y - 14), ink, w: 2.4, kind: ShapeKind.arrow));
  }
  return out;
}

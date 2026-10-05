import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// Ready-made teaching drawings made of ordinary board elements, around (0, 0). The board
/// places them in a free spot in view and groups them ([WhiteboardController.insert]), so they
/// move, erase and undo like anything drawn by hand. Ported from the KINETIX prototype.

TextElement _text(String t, Offset at, Color c, {double size = 22, bool bold = false, bool center = false, BoardFont font = BoardFont.inter}) {
  final s = measureBoardText(t, size, bold: bold, font: font);
  return TextElement(
    id: newElementId(),
    position: center ? at - Offset(s.width / 2, s.height / 2) : at,
    text: t,
    color: c,
    fontSize: size,
    size: s,
    bold: bold,
    font: font,
  );
}

Stroke _shape(ShapeKind kind, Offset a, Offset b, Color c, {double w = 3, Color? fill}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: c, width: w, shape: kind),
  shape: kind,
  fill: fill,
  points: shapePoints(kind, a, b),
);

Stroke _line(Offset a, Offset b, Color c, {double w = 3, ShapeKind kind = ShapeKind.line}) => _shape(kind, a, b, c, w: w);

Stroke _circle(Offset c, double r, Color col, {bool fill = false, double w = 3}) =>
    _shape(ShapeKind.circle, c, c + Offset(r, 0), col, w: w, fill: fill ? col : null);

String _fmt(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);

// --- Number line ------------------------------------------------------------------------------

/// A number line from [from] to [to] in steps of [step]; zero in red.
List<BoardElement> numberLine(double from, double to, double step, Color ink) {
  final count = ((to - from) / step).round().clamp(1, 60);
  const unit = 56.0;
  final width = count * unit;
  final out = <BoardElement>[_line(const Offset(-24, 40), Offset(width + 24, 40), ink, kind: ShapeKind.doubleArrow)];
  for (var i = 0; i <= count; i++) {
    final x = i * unit;
    final v = from + i * step;
    out.add(_line(Offset(x, 30), Offset(x, 50), ink, w: 2));
    out.add(_text(_fmt(v), Offset(x, 72), v == 0 ? const Color(0xFFD7263D) : ink, size: 20, center: true, bold: v == 0));
  }
  return out;
}

// --- Timeline ---------------------------------------------------------------------------------

/// Events (when, what) along an arrow, alternating above and below.
List<BoardElement> timeline(List<(String, String)> events, Color ink, Color accent) {
  if (events.isEmpty) return const [];
  const gap = 190.0;
  final width = (events.length - 1) * gap;
  final out = <BoardElement>[_line(const Offset(-30, 120), Offset(width + 40, 120), ink, w: 4, kind: ShapeKind.arrow)];
  for (final (i, (year, what)) in events.indexed) {
    final x = i * gap;
    final up = i.isEven;
    out.add(_circle(Offset(x, 120), 9, accent, fill: true));
    out.add(_line(Offset(x, 120), Offset(x, up ? 70 : 170), accent, w: 2));
    out.add(_text(year, Offset(x, up ? 50 : 190), accent, size: 22, bold: true, center: true));
    final wrapped = wrapWords(what, 18);
    final s = measureBoardText(wrapped, 17);
    out.add(TextElement(id: newElementId(), position: Offset(x - s.width / 2, up ? 50 - 18 - s.height : 206), text: wrapped, color: ink, fontSize: 17, size: s));
  }
  return out;
}

/// [t] broken into lines of at most [max] characters, at spaces.
String wrapWords(String t, int max) {
  final out = <String>[];
  var line = '';
  for (final w in t.split(' ')) {
    if (line.isEmpty) {
      line = w;
    } else if (line.length + w.length + 1 <= max) {
      line = '$line $w';
    } else {
      out.add(line);
      line = w;
    }
  }
  out.add(line);
  return out.join('\n');
}

// --- Circuits ---------------------------------------------------------------------------------

enum Circuit { cell, battery, bulb, switchOpen, switchClosed, resistor, ammeter, voltmeter, led, earth, wire }

/// Standard textbook symbols, 160 wide, with leads at (0, 40) and (160, 40).
List<BoardElement> circuitSymbol(Circuit c, Color ink) {
  const y = 40.0;
  final out = <BoardElement>[];
  void leads(double l, double r) {
    out.add(_line(const Offset(0, y), Offset(l, y), ink));
    out.add(_line(Offset(r, y), const Offset(160, y), ink));
  }

  switch (c) {
    case Circuit.cell:
      leads(72, 88);
      out.add(_line(const Offset(72, y - 26), const Offset(72, y + 26), ink));
      out.add(_line(const Offset(88, y - 13), const Offset(88, y + 13), ink, w: 6));
      out.add(_text('+', const Offset(60, y - 48), ink, size: 18));
    case Circuit.battery:
      leads(56, 104);
      for (final x in [56.0, 80.0]) {
        out.add(_line(Offset(x, y - 26), Offset(x, y + 26), ink));
        out.add(_line(Offset(x + 12, y - 13), Offset(x + 12, y + 13), ink, w: 6));
      }
      out.add(_line(const Offset(92, y), const Offset(104, y), ink));
    case Circuit.bulb:
      leads(60, 100);
      out.add(_circle(const Offset(80, y), 20, ink));
      out.add(_line(const Offset(66, y - 14), const Offset(94, y + 14), ink, w: 2));
      out.add(_line(const Offset(66, y + 14), const Offset(94, y - 14), ink, w: 2));
    case Circuit.switchOpen || Circuit.switchClosed:
      leads(56, 104);
      out.add(_circle(const Offset(56, y), 4, ink, fill: true));
      out.add(_circle(const Offset(104, y), 4, ink, fill: true));
      out.add(c == Circuit.switchOpen ? _line(const Offset(56, y), const Offset(100, y - 26), ink) : _line(const Offset(56, y), const Offset(104, y), ink));
    case Circuit.resistor:
      leads(40, 120);
      out.add(_shape(ShapeKind.rectangle, const Offset(40, y - 14), const Offset(120, y + 14), ink));
    case Circuit.ammeter || Circuit.voltmeter:
      leads(58, 102);
      out.add(_circle(const Offset(80, y), 22, ink));
      out.add(_text(c == Circuit.ammeter ? 'A' : 'V', const Offset(80, y), ink, size: 24, bold: true, center: true));
    case Circuit.led:
      leads(62, 98);
      out.add(PolygonElement(id: newElementId(), points: const [Offset(62, y - 18), Offset(62, y + 18), Offset(92, y)], color: ink, width: 3));
      out.add(_line(const Offset(94, y - 18), const Offset(94, y + 18), ink));
      out.add(_line(const Offset(84, y - 22), const Offset(98, y - 36), ink, w: 2, kind: ShapeKind.arrow));
      out.add(_line(const Offset(92, y - 16), const Offset(106, y - 30), ink, w: 2, kind: ShapeKind.arrow));
    case Circuit.earth:
      out.add(_line(const Offset(80, 0), const Offset(80, y), ink));
      for (final (i, w) in [44.0, 28.0, 12.0].indexed) {
        out.add(_line(Offset(80 - w / 2, y + i * 10), Offset(80 + w / 2, y + i * 10), ink));
      }
    case Circuit.wire:
      out.add(_line(const Offset(0, y), const Offset(160, y), ink));
  }
  return out;
}

// --- Atoms ------------------------------------------------------------------------------------

/// CPK-style colours for common elements.
const atomColors = <String, Color>{
  'H': Color(0xFFB0B7C3),
  'C': Color(0xFF3A3F47),
  'N': Color(0xFF3050F8),
  'O': Color(0xFFE53935),
  'Cl': Color(0xFF1FAF3F),
  'Na': Color(0xFFAB5CF2),
  'S': Color(0xFFE6B800),
  'P': Color(0xFFFF8000),
  'Mg': Color(0xFF22A06B),
  'Ca': Color(0xFF3DDC84),
  'Fe': Color(0xFFE06633),
  'K': Color(0xFF8F40D4),
};

/// A ball-and-stick atom to build molecules with (bond them with lines).
List<BoardElement> atomBall(String symbol) {
  final c = atomColors[symbol] ?? const Color(0xFF7B8794);
  return [
    _circle(const Offset(36, 36), 34, c, fill: true),
    _text(symbol, const Offset(36, 36), c.computeLuminance() > 0.5 ? Colors.black : Colors.white, size: 26, bold: true, center: true),
  ];
}

const elementSymbols = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'];
const elementNames = [
  'Hydrogen', 'Helium', 'Lithium', 'Beryllium', 'Boron', 'Carbon', 'Nitrogen', 'Oxygen', 'Fluorine', 'Neon', //
  'Sodium', 'Magnesium', 'Aluminium', 'Silicon', 'Phosphorus', 'Sulphur', 'Chlorine', 'Argon', 'Potassium', 'Calcium',
];

/// Electron configuration by shells (K, L, M, N) for Z = 1–20.
List<int> shellsOf(int z) {
  final out = <int>[];
  var left = z;
  for (final cap in [2, 8, 8, 2]) {
    if (left <= 0) break;
    final n = math.min(cap, left);
    out.add(n);
    left -= n;
  }
  return out;
}

/// Bohr model: the nucleus with its protons and the electrons on their shells, labelled.
List<BoardElement> bohrAtom(int z, Color ink, Color accent) {
  final symbol = elementSymbols[z - 1];
  final shells = shellsOf(z);
  const c = Offset(180, 180);
  final out = <BoardElement>[
    _circle(c, 30, const Color(0xFFE53935), fill: true),
    _text(symbol, c - const Offset(0, 6), Colors.white, size: 22, bold: true, center: true),
    _text('${z}p', c + const Offset(0, 14), Colors.white, size: 13, center: true),
  ];
  for (final (i, n) in shells.indexed) {
    final r = 58.0 + i * 36;
    out.add(_circle(c, r, ink, w: 1.5));
    for (var k = 0; k < n; k++) {
      final a = -math.pi / 2 + 2 * math.pi * k / n + i * 0.3;
      out.add(_circle(c + Offset(math.cos(a), math.sin(a)) * r, 7, accent, fill: true, w: 2));
    }
  }
  out.add(_text('${elementNames[z - 1]} (Z = $z): ${shells.join(', ')}', Offset(c.dx, c.dy + 58 + shells.length * 36 + 10), ink, size: 20, bold: true, center: true));
  return out;
}

// --- Flowcharts -------------------------------------------------------------------------------

enum FlowShape { startEnd, process, decision, inputOutput, arrow }

/// One flowchart box with its words, 220 × 100.
List<BoardElement> flowShape(FlowShape s, String label, Color ink) {
  const a = Offset.zero, b = Offset(220, 100);
  final shape = switch (s) {
    FlowShape.startEnd => _shape(ShapeKind.ellipse, a, b, ink),
    FlowShape.process => _shape(ShapeKind.rectangle, a, b, ink),
    FlowShape.decision => _shape(ShapeKind.rhombus, a, b, ink),
    FlowShape.inputOutput => _shape(ShapeKind.parallelogram, a, b, ink),
    FlowShape.arrow => _line(const Offset(0, 50), const Offset(220, 50), ink, kind: ShapeKind.arrow),
  };
  return [shape, if (label.trim().isNotEmpty && s != FlowShape.arrow) _text(label.trim(), const Offset(110, 50), ink, size: 20, center: true)];
}

// --- Grammar ----------------------------------------------------------------------------------

const grammarColors = <String, Color>{
  'Noun': Color(0x664F8CFF),
  'Verb': Color(0x66FF5A5F),
  'Adjective': Color(0x663CB44B),
  'Adverb': Color(0x66FFA64D),
  'Pronoun': Color(0x66B06CFF),
  'Preposition': Color(0x66FFD84D),
};

/// The colour key for parts of speech, as highlighter bars with their names.
List<BoardElement> grammarLegend(Color ink) {
  final out = <BoardElement>[];
  var x = 0.0;
  for (final e in grammarColors.entries) {
    final s = measureBoardText(e.key, 20, bold: true);
    out.add(
      Stroke(
        id: newElementId(),
        style: InkStyle(tool: InkTool.highlighter, color: e.value.withValues(alpha: 1), width: 7),
        points: [InkPoint(x, 14), InkPoint(x + s.width + 16, 14)],
      ),
    );
    out.add(TextElement(id: newElementId(), position: Offset(x + 8, 2), text: e.key, color: ink, fontSize: 20, size: s, bold: true));
    x += s.width + 34;
  }
  return out;
}

// --- Cards ------------------------------------------------------------------------------------

/// A big word card for vocabulary.
NoteElement wordCard(String word, Color accent) =>
    NoteElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 320, 160), text: word, color: accent, kind: NoteKind.card);

/// An element's card from the periodic table.
List<BoardElement> elementCard({required int z, required String symbol, required String name, required String mass, required Color color}) {
  const ink = Color(0xFF1B1F24);
  return [
    _shape(ShapeKind.rectangle, Offset.zero, const Offset(200, 220), ink, fill: color),
    _text('$z', const Offset(12, 8), ink, size: 26, bold: true),
    _text(symbol, const Offset(100, 92), ink, size: 72, bold: true, center: true),
    _text(name, const Offset(100, 160), ink, size: 22, center: true),
    _text(mass, const Offset(100, 192), ink, size: 20, center: true),
  ];
}

/// Typed text, wrapped, for inserting from the kit.
TextElement boardText(String text, Color ink, {double size = 26, bool bold = false, BoardFont font = BoardFont.inter}) =>
    _text(wrapWords(text, 48), Offset.zero, ink, size: size, bold: bold, font: font);

/// An equation from the kit.
MathElement boardMath(String tex, Color color, {double fontSize = 40}) =>
    MathElement(id: newElementId(), position: Offset.zero, latex: tex, color: color, fontSize: fontSize, size: estimateMathSize(tex, fontSize));

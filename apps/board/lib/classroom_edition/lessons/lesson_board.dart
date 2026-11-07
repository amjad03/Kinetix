import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../classroom_hooks.dart';

/// "Put on board": a lesson step becomes ordinary board items on the current page, one group
/// the teacher can move, resize, write over or erase: the step's title (text), its picture (a
/// whiteboard scene as editable lines, shapes, text and equations; anything else as a picture),
/// its key formula (an equation) and a note with the key point.

/// The board units per whiteboard grid unit (the scene's 100 × 60 grid is 600 × 360 on the board).
const _unit = 6.2;

/// A whiteboard scene's items as editable board elements, drawn around 0, 0, in [ink] colours.
/// Null when the scene has axes or plots (those go on as a picture).
List<BoardElement>? whiteboardElements(List<Map<String, dynamic>> items, Lang lang, {Color Function(Object?) ink = paperInkColor}) {
  if (items.any((d) => d['kind'] == 'axes' || d['kind'] == 'plot')) return null;
  Offset p(Object? v) => v is List && v.length == 2 ? Offset((v[0] as num).toDouble(), (v[1] as num).toDouble()) * _unit : Offset.zero;
  final out = <BoardElement>[];
  for (final d in items) {
    final color = ink(d['color']);
    final fill = d['fill'] == true ? color.withValues(alpha: 0.25) : null;
    InkStyle style(ShapeKind k) => InkStyle(tool: InkTool.shape, color: color, width: 4, shape: k, nib: d['dashed'] == true ? PenNib.dashed : PenNib.round);
    Stroke shape(ShapeKind k, Offset a, Offset b) => Stroke(id: newElementId(), style: style(k), shape: k, fill: fill, points: shapePoints(k, a, b));
    switch (d['kind']) {
      case 'text':
        final text = L10n.of(d['text']).t(lang);
        if (text.trim().isEmpty) break;
        final size = ((d['size'] as num?) ?? 3).toDouble() * _unit * 1.15;
        out.add(TextElement(id: newElementId(), position: p(d['at']), text: text, color: color, fontSize: size, size: measureBoardText(text, size)));
      case 'math':
        final tex = d['tex'] as String? ?? '';
        if (tex.trim().isEmpty) break;
        final size = ((d['size'] as num?) ?? 3).toDouble() * _unit * 1.15;
        out.add(MathElement(id: newElementId(), position: p(d['at']), latex: tex, color: color, fontSize: size, size: estimateMathSize(tex, size)));
      case 'line':
        out.add(shape(ShapeKind.line, p(d['from']), p(d['to'])));
      case 'arrow':
        out.add(shape(ShapeKind.arrow, p(d['from']), p(d['to'])));
      case 'rect':
        out.add(shape(ShapeKind.rectangle, p(d['from']), p(d['to'])));
      case 'circle':
        final c = p(d['at']);
        out.add(shape(ShapeKind.circle, c, c + Offset(((d['r'] as num?) ?? 5).toDouble() * _unit, 0)));
      case 'path':
        final pts = [for (final q in (d['points'] as List?) ?? const []) p(q)];
        if (pts.length < 2) break;
        out.add(PolygonElement(id: newElementId(), points: pts, color: color, width: 4, closed: d['closed'] == true, fill: d['closed'] == true ? fill : null));
    }
  }
  return out;
}

/// The step's key formula (LaTeX), if it has one.
String? keyFormula(Block b, {List<Map<String, dynamic>>? board}) {
  final f = b.s('formula');
  if (f != null && f.trim().isNotEmpty) return f;
  final hero = b.raw['hero'];
  if (hero is Map && hero['formula'] is String) return hero['formula'] as String;
  if (board != null) {
    for (final d in board.reversed) {
      if (d['kind'] == 'math' && (d['tex'] as String? ?? '').trim().isNotEmpty) return d['tex'] as String;
    }
  }
  return null;
}

/// The key point of the step as it is shown (the point just revealed, a rule, the answer).
String? keyNote(Block b, int revealed, Lang lang) {
  String? pick(List<L10n> xs, int i) => xs.isEmpty ? null : xs[i.clamp(0, xs.length - 1)].t(lang);
  final s = switch (b.type) {
    BlockType.concept => pick(b.list('points'), revealed - 1 - (b.raw['hero'] is Map ? 1 : 0) - b.cards.length) ?? (b.cards.isEmpty ? null : b.cards[(revealed - 1).clamp(0, b.cards.length - 1)].title.t(lang)),
    BlockType.intro => pick(b.list('objectives'), 0),
    BlockType.trick => b.maybe('mnemonic')?.t(lang) ?? b.f('body').t(lang),
    BlockType.example => b.f('answer').t(lang),
    BlockType.recap => pick(b.list('points'), revealed - 1),
    BlockType.simulation || BlockType.model3d => pick(b.list('tryThis'), 0) ?? b.maybe('caption')?.t(lang),
    BlockType.virtualLab => b.maybe('aim')?.t(lang),
    _ => null,
  };
  if (s == null || s.trim().isEmpty) return null;
  final plain = s.replaceAll('*', '').replaceAll(RegExp(r'\$([^$]*)\$'), r'$1').trim();
  return plain.length > 140 ? '${plain.substring(0, 137).trimRight()}…' : plain;
}

/// Puts a step on the current page: [title], then the picture ([vector] items or a [picture]),
/// with the [formula] and [note] beside it. Answers what was placed.
List<BoardElement> putStepOnBoard(ClassroomHost host, {required String title, List<BoardElement>? vector, Uint8List? picture, Size? pictureSize, String? formula, String? note}) {
  final dark = host.wb.background.isDark;
  final ink = dark ? WhiteboardController.chalkWhite : const Color(0xFF13165A);
  final els = <BoardElement>[];
  els.add(TextElement(id: newElementId(), position: Offset.zero, text: title, color: ink, fontSize: 56, bold: true, size: measureBoardText(title, 56, bold: true)));
  const top = 100.0;
  var right = 0.0;
  if (vector != null && vector.isNotEmpty) {
    var r = vector.first.bounds;
    for (final e in vector.skip(1)) {
      r = r.expandToInclude(e.bounds);
    }
    final d = Offset(-r.left, top - r.top);
    for (final e in vector) {
      els.add(e.translated(d));
    }
    right = r.width;
  } else if (picture != null) {
    final s = pictureSize ?? const Size(1200, 800);
    const w = 640.0;
    final h = s.width == 0 ? w : w * s.height / s.width;
    els.add(ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, top, w, h), bytes: picture));
    right = w;
  }
  final x = right == 0 ? 0.0 : right + 60;
  var y = right == 0 ? top : top + 40;
  if (formula != null) {
    const fs = 56.0;
    final size = estimateMathSize(formula, fs);
    els.add(MathElement(id: newElementId(), position: Offset(x, y), latex: formula, color: ink, fontSize: fs, size: size));
    y += size.height + 48;
  }
  if (note != null) {
    final lines = (note.length / 26).ceil().clamp(1, 6);
    els.add(NoteElement(id: newElementId(), rect: Rect.fromLTWH(x, y, 380, math.max(150.0, 60.0 + lines * 38)), text: note, color: const Color(0xFFFFF4CC), fontSize: 30));
  }
  return host.putElements(els);
}

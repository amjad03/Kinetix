import 'package:flutter/material.dart';

/// The one palette for the board's tool icons (the tools drawer, the AI panel's tiles, the
/// side panel): a tool has the colour of its subject wherever it shows. Use these, never a
/// colour of your own, so the same tool is always the same colour.
abstract final class ToolPalette {
  static const geometry = Color(0xFF78D9EC);
  static const maths = Color(0xFF8AB4F8);
  static const science = Color(0xFF81C995);
  static const commerce = Color(0xFFFCAD70);
  static const cs = Color(0xFFC58AF9);
  static const classroom = Color(0xFFF28B82);
  static const primary = Color(0xFFFDD663);
  static const language = Color(0xFFA8DAB5);
  static const ai = Color(0xFFF6AEC7);

  /// Assessment tools (exit ticket, quick quiz, polls) sit with the classroom.
  static const assessment = classroom;

  /// Media, search and reference tools sit with maths blue.
  static const media = maths;

  /// Every colour of the palette (a test checks the tools use only these).
  static const all = <Color>[geometry, maths, science, commerce, cs, classroom, primary, language, ai];
}

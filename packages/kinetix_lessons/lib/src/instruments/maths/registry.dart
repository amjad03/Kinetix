import 'package:flutter/widgets.dart';

/// Maths instruments. Each entry: id → builder taking the lesson preset.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> mathsInstruments = {};

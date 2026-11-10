import 'package:flutter/widgets.dart';

/// Physics instruments. Each entry: id → builder taking the lesson preset.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> physicsInstruments = {};

import 'engine.dart';

/// No viewer where there is no dart:io (the web): the app shows the fallback.
Viewer3dEngine? createEngine() => null;

bool engineAvailable() => false;

import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

const _key = 'install_id';

/// A random id made on first use and kept for the life of the install. It names this phone to the server
/// (which stores only a hash), so a sign-in from a phone the person has not trusted can be noticed.
String installId(SharedPreferences prefs) {
  final have = prefs.getString(_key);
  if (have != null && have.length >= 16) return have;
  final r = Random.secure();
  final id = List.generate(24, (_) => r.nextInt(36).toRadixString(36)).join();
  prefs.setString(_key, id);
  return id;
}

import 'dart:convert';
import 'dart:isolate';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

import '../../core/kiosk/kiosk_pin.dart';

/// The school PIN (and its recovery code) as the Classroom edition keeps them: a salted
/// PBKDF2-HMAC-SHA256 hash, as the kiosk IT PIN (core/kiosk/kiosk_pin.dart), never the PIN.
/// Boards from release 1.0.0 kept a plain SHA-256 hash ([isLegacy]); it still opens and is
/// replaced by a PBKDF2 hash the first time the right PIN is typed.
abstract final class SchoolPin {
  /// PBKDF2 rounds for new hashes (about half a second on a cheap panel, off the UI thread).
  /// Tests lower it.
  static int iterations = 120000;

  /// Below this many rounds the hash is checked on the UI thread (tests, which cannot wait
  /// for an isolate inside a widget test's fake clock).
  static const isolateFrom = 20000;

  /// Wrong PINs allowed before Settings lock.
  static const maxAttempts = 5;

  /// The first lockout; each further lockout doubles it, up to [maxLockout].
  static const firstLockout = Duration(minutes: 1);
  static const maxLockout = Duration(hours: 1);

  /// Recovery codes: 12 characters in three groups, from letters and digits that are not
  /// easily confused (no 0/O, 1/I/L).
  static const _alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /// The hash to keep for [secret] (a PIN, or a recovery code as [normaliseCode] gives it).
  static Future<String> hash(String secret, {int? rounds}) async {
    final n = rounds ?? iterations;
    final salt = _randomBytes(16);
    Uint8List derive() => pbkdf2Sha256(utf8.encode(secret), salt, n, 32);
    final out = n >= isolateFrom ? await Isolate.run(derive) : derive();
    return jsonEncode(KioskPin(algo: KioskPin.pbkdf2Sha256, iterations: n, salt: base64.encode(salt), hash: base64.encode(out)).toJson());
  }

  /// Whether [secret] matches [stored] (a PBKDF2 record, or a release 1.0.0 SHA-256 hash).
  static Future<bool> verify(String secret, String stored) async {
    if (isLegacy(stored)) return _constantEquals(_legacyHash(secret), stored.trim().toLowerCase());
    final Object? j;
    try {
      j = jsonDecode(stored);
    } on FormatException {
      return false;
    }
    final p = KioskPin.fromJson(j);
    if (p == null) return false;
    if (p.iterations >= isolateFrom) return verifyKioskPin(secret, p);
    return verifyKioskPinSync(secret, p);
  }

  /// A release 1.0.0 hash: 64 hex digits of SHA-256 over `zynetix-classroom:PIN`.
  static bool isLegacy(String stored) => RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(stored.trim());

  static String _legacyHash(String pin) => sha256.convert(utf8.encode('zynetix-classroom:$pin')).toString();

  /// The release 1.0.0 hash of [pin] (tests make old boards with it).
  @visibleForTesting
  static String legacyHashOf(String pin) => _legacyHash(pin);

  /// A new recovery code, "K7QF-2MXD-9RTA".
  static String newRecoveryCode([Random? random]) {
    final r = random ?? Random.secure();
    final c = [for (var i = 0; i < 12; i++) _alphabet[r.nextInt(_alphabet.length)]].join();
    return '${c.substring(0, 4)}-${c.substring(4, 8)}-${c.substring(8)}';
  }

  /// A recovery code as typed ("k7qf 2mxd-9rta") made comparable: capitals, no spaces or dashes,
  /// O read as 0 is not in the alphabet so it is left alone.
  static String normaliseCode(String code) => code.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  /// How long the board locks after its [lockouts]-th lockout (1, 2, 4 … minutes, at most an hour).
  static Duration lockoutFor(int lockouts) {
    final m = firstLockout.inMinutes * pow(2, max(0, lockouts - 1)).toInt();
    return Duration(minutes: min(m, maxLockout.inMinutes));
  }

  static bool _constantEquals(String a, String b) {
    if (a.length != b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      d |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return d == 0;
  }

  static Uint8List _randomBytes(int n) {
    final r = Random.secure();
    return Uint8List.fromList([for (var i = 0; i < n; i++) r.nextInt(256)]);
  }
}

/// What typing a PIN (or recovery code) did.
enum PinCheck { ok, wrong, lockedOut }

@immutable
class PinResult {
  const PinResult(this.check, {this.attemptsLeft = 0, this.lockedUntil});

  final PinCheck check;

  /// Wrong PINs left before the board locks (for [PinCheck.wrong]).
  final int attemptsLeft;

  /// When typing is allowed again (for [PinCheck.lockedOut]).
  final DateTime? lockedUntil;

  bool get ok => check == PinCheck.ok;
}

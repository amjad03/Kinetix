import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// The institution's IT PIN as the board receives it (GET /v1/devices/me/config): a salted
/// PBKDF2-HMAC-SHA256 hash, never the PIN (services/api/src/common/kiosk-pin.ts).
class KioskPin {
  const KioskPin({required this.algo, required this.iterations, required this.salt, required this.hash});

  static const pbkdf2Sha256 = 'pbkdf2-sha256';

  final String algo;
  final int iterations;

  /// Base64.
  final String salt;
  final String hash;

  Map<String, dynamic> toJson() => {'algo': algo, 'iterations': iterations, 'salt': salt, 'hash': hash};

  static KioskPin? fromJson(Object? j) {
    if (j is! Map) return null;
    final algo = j['algo'], iterations = j['iterations'], salt = j['salt'], hash = j['hash'];
    if (algo is! String || iterations is! int || salt is! String || hash is! String) return null;
    return KioskPin(algo: algo, iterations: iterations, salt: salt, hash: hash);
  }
}

/// Whether [pin] is the IT PIN, checked off the UI thread (PBKDF2 takes up to a second on a
/// cheap panel). False for anything the board does not understand.
Future<bool> verifyKioskPin(String pin, KioskPin p) => Isolate.run(() => verifyKioskPinSync(pin, p));

bool verifyKioskPinSync(String pin, KioskPin p) {
  // Parameters come from our own API; the bound only stops a bad value from hanging the board.
  if (p.algo != KioskPin.pbkdf2Sha256 || p.iterations < 1 || p.iterations > 1000000) return false;
  try {
    final want = base64.decode(p.hash);
    if (want.isEmpty) return false;
    final got = pbkdf2Sha256(utf8.encode(pin), base64.decode(p.salt), p.iterations, want.length);
    var diff = 0;
    for (var i = 0; i < want.length; i++) {
      diff |= want[i] ^ got[i];
    }
    return diff == 0;
  } on FormatException {
    return false;
  }
}

/// PBKDF2 (RFC 8018) with HMAC-SHA256.
Uint8List pbkdf2Sha256(List<int> password, List<int> salt, int iterations, int length) {
  final hmac = Hmac(sha256, password);
  final out = BytesBuilder();
  for (var block = 1; out.length < length; block++) {
    var u = hmac.convert([...salt, block >> 24 & 0xff, block >> 16 & 0xff, block >> 8 & 0xff, block & 0xff]).bytes;
    final t = Uint8List.fromList(u);
    for (var i = 1; i < iterations; i++) {
      u = hmac.convert(u).bytes;
      for (var k = 0; k < t.length; k++) {
        t[k] ^= u[k];
      }
    }
    out.add(t);
  }
  return Uint8List.sublistView(out.takeBytes(), 0, length);
}

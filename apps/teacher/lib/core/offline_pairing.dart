import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Offline check of a board's signed code (`KXO1.<payload>.<signature>`, see services/api/src/pairing/offline-code.ts).
/// The Teacher App keeps the institution's public key from when it was last online; this needs no network.
const offlinePrefix = 'KXO1';

/// What the signed payload says: the institution, the board, the key, and the window the code is valid for.
class OfflineBoardCode {
  const OfflineBoardCode({required this.tenantId, required this.deviceId, required this.keyId, required this.validFrom, required this.validUntil});

  final String tenantId;
  final String deviceId;
  final String keyId;
  final DateTime validFrom;
  final DateTime validUntil;
}

enum OfflineFailure { malformed, badSignature, wrongInstitution, notYetValid, expired }

sealed class OfflineResult {
  const OfflineResult();
}

class OfflineOk extends OfflineResult {
  const OfflineOk(this.code);
  final OfflineBoardCode code;
}

class OfflineBad extends OfflineResult {
  const OfflineBad(this.reason);
  final OfflineFailure reason;
}

Uint8List _b64(String s) => Uint8List.fromList(base64Url.decode(base64Url.normalize(s)));

/// Checks [token] against [publicKeyRaw] (the 32-byte Ed25519 key, base64url). [skew] forgives a clock a minute out.
OfflineResult verifyOfflineCode({required String token, required String publicKeyRaw, required String tenantId, required DateTime now, Duration skew = const Duration(seconds: 60)}) {
  final parts = token.trim().split('.');
  if (parts.length != 3 || parts[0] != offlinePrefix) return const OfflineBad(OfflineFailure.malformed);
  Map<String, dynamic> payload;
  try {
    final key = _b64(publicKeyRaw);
    final sig = _b64(parts[2]);
    if (key.length != 32 || sig.length != 64) return const OfflineBad(OfflineFailure.malformed);
    if (!ed25519Verify(key, utf8.encode('${parts[0]}.${parts[1]}'), sig)) return const OfflineBad(OfflineFailure.badSignature);
    payload = jsonDecode(utf8.decode(_b64(parts[1]))) as Map<String, dynamic>;
  } catch (_) {
    return const OfflineBad(OfflineFailure.malformed);
  }
  final from = payload['f'];
  final until = payload['u'];
  if (payload['v'] != 1 || from is! int || until is! int || payload['t'] is! String || payload['d'] is! String) return const OfflineBad(OfflineFailure.malformed);
  if (payload['t'] != tenantId) return const OfflineBad(OfflineFailure.wrongInstitution);
  final f = DateTime.fromMillisecondsSinceEpoch(from * 1000, isUtc: true);
  final u = DateTime.fromMillisecondsSinceEpoch(until * 1000, isUtc: true);
  if (now.toUtc().add(skew).isBefore(f)) return const OfflineBad(OfflineFailure.notYetValid);
  if (now.toUtc().subtract(skew).isAfter(u)) return const OfflineBad(OfflineFailure.expired);
  return OfflineOk(OfflineBoardCode(tenantId: payload['t'] as String, deviceId: payload['d'] as String, keyId: payload['k'] as String? ?? '', validFrom: f.toLocal(), validUntil: u.toLocal()));
}

// ---- Ed25519 signature verification (RFC 8032), on BigInt. Verification only: no secret is handled here. ----

final BigInt _p = (BigInt.one << 255) - BigInt.from(19);
final BigInt _l = (BigInt.one << 252) + BigInt.parse('27742317777372353535851937790883648493');
final BigInt _d = (BigInt.from(-121665) * BigInt.from(121666).modInverse(_p)) % _p;
final BigInt _sqrtM1 = BigInt.two.modPow((_p - BigInt.one) ~/ BigInt.from(4), _p);

class _Pt {
  const _Pt(this.x, this.y, this.z, this.t);
  final BigInt x, y, z, t;
}

final _Pt _zero = _Pt(BigInt.zero, BigInt.one, BigInt.one, BigInt.zero);

_Pt _add(_Pt a, _Pt b) {
  final aa = ((a.y - a.x) * (b.y - b.x)) % _p;
  final bb = ((a.y + a.x) * (b.y + b.x)) % _p;
  final cc = (BigInt.two * a.t * b.t * _d) % _p;
  final dd = (BigInt.two * a.z * b.z) % _p;
  final e = bb - aa, f = dd - cc, g = dd + cc, h = bb + aa;
  return _Pt((e * f) % _p, (g * h) % _p, (f * g) % _p, (e * h) % _p);
}

_Pt _mul(_Pt point, BigInt k) {
  var r = _zero;
  var q = point;
  while (k > BigInt.zero) {
    if (k.isOdd) r = _add(r, q);
    q = _add(q, q);
    k >>= 1;
  }
  return r;
}

BigInt _leInt(List<int> bytes) {
  var n = BigInt.zero;
  for (var i = bytes.length - 1; i >= 0; i--) {
    n = (n << 8) | BigInt.from(bytes[i]);
  }
  return n;
}

_Pt? _decode(List<int> s) {
  final sign = (s[31] & 0x80) != 0;
  final y = _leInt([...s.sublist(0, 31), s[31] & 0x7f]);
  if (y >= _p) return null;
  final y2 = (y * y) % _p;
  final u = (y2 - BigInt.one) % _p;
  final v = (_d * y2 + BigInt.one) % _p;
  final x2 = (u * v.modInverse(_p)) % _p;
  var x = x2.modPow((_p + BigInt.from(3)) ~/ BigInt.from(8), _p);
  if ((x * x - x2) % _p != BigInt.zero) x = (x * _sqrtM1) % _p;
  if ((x * x - x2) % _p != BigInt.zero) return null;
  if (x == BigInt.zero && sign) return null;
  if (x.isOdd != sign) x = _p - x;
  return _Pt(x, y, BigInt.one, (x * y) % _p);
}

final _Pt _base = () {
  final y = (BigInt.from(4) * BigInt.from(5).modInverse(_p)) % _p;
  final x2 = (((y * y - BigInt.one) % _p) * ((_d * y * y + BigInt.one) % _p).modInverse(_p)) % _p;
  var x = x2.modPow((_p + BigInt.from(3)) ~/ BigInt.from(8), _p);
  if ((x * x - x2) % _p != BigInt.zero) x = (x * _sqrtM1) % _p;
  if (x.isOdd) x = _p - x;
  return _Pt(x, y, BigInt.one, (x * y) % _p);
}();

/// True when [signature] (64 bytes) is a valid Ed25519 signature of [message] under [publicKey] (32 bytes).
bool ed25519Verify(List<int> publicKey, List<int> message, List<int> signature) {
  if (publicKey.length != 32 || signature.length != 64) return false;
  final a = _decode(publicKey);
  final r = _decode(signature.sublist(0, 32));
  if (a == null || r == null) return false;
  final s = _leInt(signature.sublist(32));
  if (s >= _l) return false;
  final h = _leInt(sha512.convert([...signature.sublist(0, 32), ...publicKey, ...message]).bytes) % _l;
  final left = _mul(_base, s);
  final right = _add(r, _mul(a, h));
  return (left.x * right.z - right.x * left.z) % _p == BigInt.zero && (left.y * right.z - right.y * left.z) % _p == BigInt.zero;
}

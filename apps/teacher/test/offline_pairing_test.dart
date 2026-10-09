// A board's signed offline code is checked on the phone with no network (Ed25519, the institution's public key).
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/offline_pairing.dart';

void main() {
  // Signed by services/api/src/pairing/offline-code.ts's format: window 04:30 to 04:45 UTC on 2026-10-20, tenant "tenant-1", board "device-1".
  const key = 'wUSKObY9fXzKXSYqvfh82s0dHTUrrx0i0MgnNgYqpc0';
  const token =
      'KXO1.eyJ2IjoxLCJ0IjoidGVuYW50LTEiLCJkIjoiZGV2aWNlLTEiLCJrIjoia2V5MTIzNDU2Nzg5IiwibiI6ImFiY2RlZmdoIiwiZiI6MTc5MjQ3MDYwMCwidSI6MTc5MjQ3MTUwMH0.AKKnNhs_DCJ957mX3-I_uzdE1bfO2ehHvwktUJAvBRkDLuCdKkUMbLQb86lzmLkM6Nz55yFpbPpnAUwRYGB-BA';
  final inside = DateTime.utc(2026, 10, 20, 4, 40);

  OfflineResult check(String t, {String tenant = 'tenant-1', DateTime? now, String publicKey = key}) =>
      verifyOfflineCode(token: t, publicKeyRaw: publicKey, tenantId: tenant, now: now ?? inside);

  test('a genuine code inside its window is accepted and says which board', () {
    final r = check(token);
    expect(r, isA<OfflineOk>());
    final code = (r as OfflineOk).code;
    expect(code.deviceId, 'device-1');
    expect(code.tenantId, 'tenant-1');
    expect(code.validUntil.toUtc(), DateTime.utc(2026, 10, 20, 4, 45));
  });

  test('a changed payload or signature is refused', () {
    final parts = token.split('.');
    final forged = '${parts[0]}.${parts[1].substring(0, parts[1].length - 2)}AA.${parts[2]}';
    expect((check(forged) as OfflineBad).reason, anyOf(OfflineFailure.badSignature, OfflineFailure.malformed));
    final flipped = '${parts[0]}.${parts[1]}.${parts[2].substring(0, 10)}${parts[2][10] == 'A' ? 'B' : 'A'}${parts[2].substring(11)}';
    expect((check(flipped) as OfflineBad).reason, OfflineFailure.badSignature);
  });

  test('another institution\'s key does not verify', () {
    expect((check(token, publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo') as OfflineBad).reason, OfflineFailure.badSignature);
  });

  test('wrong institution, too early, too late and junk', () {
    expect((check(token, tenant: 'tenant-2') as OfflineBad).reason, OfflineFailure.wrongInstitution);
    expect((check(token, now: DateTime.utc(2026, 10, 20, 4, 20)) as OfflineBad).reason, OfflineFailure.notYetValid);
    expect((check(token, now: DateTime.utc(2026, 10, 20, 4, 50)) as OfflineBad).reason, OfflineFailure.expired);
    // A minute of clock difference is forgiven at either end.
    expect(check(token, now: DateTime.utc(2026, 10, 20, 4, 29, 30)), isA<OfflineOk>());
    expect(check(token, now: DateTime.utc(2026, 10, 20, 4, 45, 30)), isA<OfflineOk>());
    expect((check('hello') as OfflineBad).reason, OfflineFailure.malformed);
    expect((check('KXO1.a.b') as OfflineBad).reason, OfflineFailure.malformed);
  });
}

// The board keeps a day of signed codes so it can still show one when the cloud cannot be reached.
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/offline_codes.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final t0 = DateTime.utc(2026, 10, 20, 4, 30);
  OfflineCode code(int i, {int minutes = 15}) =>
      OfflineCode(token: 'KXO1.p$i.s$i', validFrom: t0.add(Duration(minutes: i * minutes)), validUntil: t0.add(Duration(minutes: (i + 1) * minutes)));

  test('parses the server batch and picks the window that is open now', () {
    final codes = OfflineCodes.parse({
      'codes': [
        for (var i = 0; i < 4; i++) code(i).toJson(),
      ],
    });
    expect(codes, hasLength(4));
    expect(OfflineCodes.current(codes, t0.add(const Duration(minutes: 20)))?.token, 'KXO1.p1.s1');
    expect(OfflineCodes.current(codes, t0.add(const Duration(minutes: 15)))?.token, 'KXO1.p1.s1', reason: 'a window starts at its first minute');
    expect(OfflineCodes.current(codes, t0.add(const Duration(minutes: 60))), isNull, reason: 'the cache has run out');
    expect(OfflineCodes.current(codes, t0.subtract(const Duration(minutes: 1))), isNull);
  });

  test('asks for a fresh batch when little coverage is left', () {
    final day = [for (var i = 0; i < 96; i++) code(i)];
    expect(OfflineCodes.needsRefresh(const [], t0), isTrue);
    expect(OfflineCodes.needsRefresh(day, t0), isFalse);
    expect(OfflineCodes.needsRefresh(day, t0.add(const Duration(hours: 21))), isTrue, reason: 'under four hours remain');
  });

  test('saves only unexpired codes and loads them back', () async {
    SharedPreferences.setMockInitialValues({});
    expect(await OfflineCodes.load(), isEmpty);
    await OfflineCodes.save([code(0), code(1), code(2)], t0.add(const Duration(minutes: 20)));
    final back = await OfflineCodes.load();
    expect(back.map((c) => c.token), ['KXO1.p1.s1', 'KXO1.p2.s2']);
    expect(back.first.validUntil.toUtc(), t0.add(const Duration(minutes: 30)));
  });

  test('a damaged cache is ignored', () async {
    SharedPreferences.setMockInitialValues({'offline.codes': 'not json'});
    expect(await OfflineCodes.load(), isEmpty);
  });
}

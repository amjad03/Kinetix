import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_teacher/core/api.dart';
import 'package:zynetix_teacher/core/app_state.dart';
import 'package:zynetix_teacher/core/models.dart';
import 'package:zynetix_teacher/core/secure_store.dart';
import 'package:zynetix_teacher/features/attendance/attendance_controller.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

/// The mobile pass: staying signed in (refresh on 401, once), signing out on the server, cached reads offline
/// and attendance queued offline.
void main() {
  group('HttpTeacherApi session', () {
    test('sends the mobile header, refreshes once on 401 and retries with the new token', () async {
      final seen = <String>[];
      final client = MockClient((r) async {
        expect(r.headers['x-zynetix-client'], 'mobile');
        seen.add('${r.method} ${r.url.path} ${r.headers['authorization'] ?? ''}');
        if (r.url.path == '/v1/auth/login') return http.Response(jsonEncode({'accessToken': 'a1', 'refreshToken': 'r1', 'expiresAt': '2026-11-05T08:00:00Z'}), 201);
        if (r.url.path == '/v1/auth/refresh') return http.Response(jsonEncode({'accessToken': 'a2', 'refreshToken': 'r2', 'expiresAt': '2026-11-05T20:00:00Z'}), 200);
        if (r.headers['authorization'] == 'Bearer a1') return http.Response('{"code":"UNAUTHORIZED"}', 401);
        return http.Response('[]', 200);
      });
      final api = HttpTeacherApi(baseUrl: 'http://h', client: client);
      var signedOut = false;
      api.onUnauthorized = () => signedOut = true;
      await api.login(tenant: 't', login: 'x', password: 'y');
      expect(api.refresher.refreshToken, 'r1');
      await api.notifications().catchError((_) => <AppNotification>[]);
      expect(seen, ['POST /v1/auth/login ', 'GET /v1/notifications Bearer a1', 'POST /v1/auth/refresh ', 'GET /v1/notifications Bearer a2']);
      expect(api.token, 'a2');
      expect(api.refresher.refreshToken, 'r2');
      expect(signedOut, isFalse);
    });

    test('signs out when the refresh is refused, without looping', () async {
      var calls = 0;
      final client = MockClient((r) async {
        calls++;
        if (r.url.path == '/v1/auth/refresh') return http.Response('{"code":"REFRESH_REUSED"}', 401);
        return http.Response('{"code":"UNAUTHORIZED"}', 401);
      });
      final api = HttpTeacherApi(baseUrl: 'http://h', client: client)..token = 'a1';
      api.refresher.refreshToken = 'r1';
      var signedOut = 0;
      api.onUnauthorized = () => signedOut++;
      await expectLater(api.me(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
      expect(calls, 2);
      expect(signedOut, 1);
    });

    test('offline: a core screen answers from the cache and the banner turns on', () async {
      var online = true;
      final client = MockClient((r) async {
        if (!online) throw http.ClientException('offline');
        return http.Response(jsonEncode({'items': []}), 200);
      });
      final saved = <String, String>{};
      final cache = _MemoryCache(saved);
      final api = HttpTeacherApi(baseUrl: 'http://h', client: client, cache: cache)..token = 'a';
      await api.notifications();
      await Future<void>.delayed(Duration.zero);
      expect(saved.keys, contains('/v1/notifications?limit=100'));
      online = false;
      expect(await api.notifications(), isEmpty);
      expect(cache.offline.value, isTrue);
      online = true;
      await api.notifications();
      expect(cache.offline.value, isFalse);
    });

    test('attendance made offline is queued and sent once the server answers', () async {
      var online = false;
      final posted = <String>[];
      final client = MockClient((r) async {
        if (!online) throw http.ClientException('offline');
        posted.add('${r.method} ${r.url.path} ${r.body}');
        return http.Response('[]', 200);
      });
      late final HttpTeacherApi api;
      final q = KxWriteQueue(file: () async => null, send: (w) => api.sendQueued(w));
      api = HttpTeacherApi(baseUrl: 'http://h', client: client, writes: q)..token = 'a';
      final c = AttendanceController(api: api, slotId: 's1', sectionId: 'sec1', date: '2026-11-04');
      c.marks['st1'] = AttendanceStatus.absent;
      expect(await c.submit(), isNull);
      expect(c.queued, isTrue);
      expect(q.pending.value.single.path, '/v1/attendance');
      online = true;
      expect(await q.flush(), 1);
      expect(posted.single, contains('"status":"absent"'));
      expect(q.pending.value, isEmpty);
    });
  });

  group('sign-out', () {
    test('ends the session on the server, then forgets the tokens and wipes local files', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final api = FakeTeacherApi();
      final refresher = KxTokenRefresher(MockClient((_) async => http.Response('', 500)))..refreshToken = 'r1';
      var wiped = false;
      final secure = MemorySecureStore();
      final state = AppState(api, prefs, secure: secure, refresher: refresher, wipeLocal: () async => wiped = true);
      await state.signIn(server: 'http://h', tenant: 'demo', login: 'x', password: 'y');
      expect(secure.values['refresh_token'], 'r1');
      await state.signOut();
      expect(api.calls, contains('sign out'));
      expect(secure.values, isNot(contains('refresh_token')));
      expect(secure.values, isNot(contains('token')));
      expect(refresher.refreshToken, isNull);
      expect(wiped, isTrue);
      expect(state.signedIn, isFalse);
    });

    test('a rotated pair is kept in the key store', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final refresher = KxTokenRefresher(MockClient((_) async => http.Response(jsonEncode({'accessToken': 'a9', 'refreshToken': 'r9'}), 200)))..refreshToken = 'r1';
      final secure = MemorySecureStore();
      AppState(FakeTeacherApi(), prefs, secure: secure, refresher: refresher);
      await refresher.refresh('http://h');
      await Future<void>.delayed(Duration.zero);
      expect(secure.values, {'token': 'a9', 'refresh_token': 'r9'});
    });
  });

  testWidgets('Profile opens notification settings', (t) async {
    final api = FakeTeacherApi();
    final s = KxNotificationSettingsScreen(strings: _strings, load: api.notificationPrefs, save: api.setNotificationPrefs);
    await t.pumpWidget(MaterialApp(home: s));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('kind-payslip')));
    await t.tap(find.byKey(const Key('prefs-save')));
    await t.pumpAndSettle();
    expect(api.prefs.pushOff, {'payslip'});
  });
}

const _strings = KxMobileStrings(
  updateRequiredTitle: '',
  updateRequiredBody: '',
  updateAvailable: '',
  update: '',
  later: '',
  offlineBanner: '',
  notificationSettings: 'Notifications',
  notificationSettingsHint: '',
  quietHours: 'Quiet',
  quietHoursHint: '',
  quietFrom: '',
  quietTo: '',
  save: 'Save',
  saved: 'Saved',
  loadFailed: 'x',
  retry: 'r',
  kindLabel: _label,
);

String _label(String k) => k;

class _MemoryCache extends KxReadCache {
  _MemoryCache(this.values) : super(() async => null);
  final Map<String, String> values;
  @override
  Future<void> put(String path, String body) async => values[path] = body;
  @override
  Future<String?> get(String path) async => values[path];
}

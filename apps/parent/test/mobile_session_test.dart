import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_parent/core/api.dart';
import 'package:zynetix_parent/core/app_state.dart';
import 'package:zynetix_parent/core/token_store.dart';
import 'package:zynetix_parent/demo/fake_api.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

/// The mobile pass: staying signed in (refresh on 401, once), signing out on the server, cached reads offline.
void main() {
  test('sends the mobile header, refreshes once on 401 and retries with the new token', () async {
    final seen = <String>[];
    final client = MockClient((r) async {
      expect(r.headers['x-zynetix-client'], 'mobile');
      seen.add('${r.url.path} ${r.headers['authorization'] ?? ''}');
      if (r.url.path == '/v1/auth/refresh') return http.Response(jsonEncode({'accessToken': 'a2', 'refreshToken': 'r2'}), 200);
      if (r.headers['authorization'] == 'Bearer a1') return http.Response('{"code":"UNAUTHORIZED"}', 401);
      return http.Response(jsonEncode({'items': [], 'unread': 0}), 200);
    });
    final api = HttpParentApi(baseUrl: 'http://h', client: client)..token = 'a1';
    api.refresher.refreshToken = 'r1';
    var signedOut = 0;
    api.onUnauthorized = () => signedOut++;
    await api.notifications();
    expect(seen, ['/v1/notifications Bearer a1', '/v1/auth/refresh ', '/v1/notifications Bearer a2']);
    expect(api.token, 'a2');
    expect(signedOut, 0);
  });

  test('a refused refresh signs out once, without looping', () async {
    var calls = 0;
    final api = HttpParentApi(baseUrl: 'http://h', client: MockClient((r) async {
      calls++;
      return http.Response('{"code":"UNAUTHORIZED"}', 401);
    }))..token = 'a1';
    api.refresher.refreshToken = 'r1';
    var signedOut = 0;
    api.onUnauthorized = () => signedOut++;
    await expectLater(api.notifications(), throwsA(isA<ApiException>()));
    expect(calls, 2);
    expect(signedOut, 1);
  });

  test('offline: a core screen answers from the cache and the banner turns on', () async {
    var online = true;
    final client = MockClient((r) async {
      if (!online) throw http.ClientException('offline');
      return http.Response(jsonEncode({'items': [], 'unread': 0}), 200);
    });
    final saved = <String, String>{};
    final cache = _MemoryCache(saved);
    final api = HttpParentApi(baseUrl: 'http://h', client: client, cache: cache)..token = 'a';
    await api.notifications();
    await Future<void>.delayed(Duration.zero);
    expect(saved.keys, contains('/v1/notifications'));
    online = false;
    await api.notifications();
    expect(cache.offline.value, isTrue);
  });

  test('sign-out ends the session on the server, forgets both tokens and wipes local files', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = FakeParentApi();
    final tokens = MemoryTokenStore();
    final refreshTokens = MemoryTokenStore();
    final refresher = KxTokenRefresher(MockClient((_) async => http.Response('', 500)))..refreshToken = 'r1';
    var wiped = false;
    final state = AppState(api, prefs, tokens: tokens, refreshTokens: refreshTokens, refresher: refresher, wipeLocal: () async => wiped = true);
    await refreshTokens.write('r1');
    await state.signOut();
    expect(api.signOutCalls, 1);
    expect(await refreshTokens.read(), isNull);
    expect(await tokens.read(), isNull);
    expect(refresher.refreshToken, isNull);
    expect(wiped, isTrue);
  });
}

class _MemoryCache extends KxReadCache {
  _MemoryCache(this.values) : super(() async => null);
  final Map<String, String> values;
  @override
  Future<void> put(String path, String body) async => values[path] = body;
  @override
  Future<String?> get(String path) async => values[path];
}

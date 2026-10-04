import 'dart:convert';

import 'package:http/http.dart' as http;

import 'package:kinetix_ink/kinetix_ink.dart';

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// KINETIX Cloud API, as seen by a board.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final http.Client _http;

  /// Device token after enrolment.
  String? deviceToken;

  /// Board-session token while a teacher is paired. Takes precedence over [deviceToken].
  String? sessionToken;

  Future<({String deviceToken, String deviceName})> enroll(String code, String platform) async {
    final j = await _send('POST', '/v1/devices/enroll', body: {'code': code, 'platform': platform, 'appVersion': '0.1.0'}, auth: false);
    return (deviceToken: j['deviceToken'] as String, deviceName: (j['device'] as Map)['name'] as String);
  }

  Future<PairingCode> newPairingCode() async =>
      PairingCode.fromJson(await _send('POST', '/v1/devices/me/pairing-codes', useDeviceToken: true));

  Future<void> endSession() async => _send('POST', '/v1/sessions/current/end');

  Future<WhiteboardSummary> saveWhiteboard(String id, {required String title, required SavedBoard board, required bool share}) async {
    final j = await _send('PUT', '/v1/whiteboards/$id', body: {...board.toJson(), 'title': title, 'share': share});
    return WhiteboardSummary.fromJson(j as Map<String, dynamic>);
  }

  Future<List<WhiteboardSummary>> whiteboards() async {
    final list = await _send('GET', '/v1/whiteboards') as List<dynamic>;
    return list.map((e) => WhiteboardSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SavedBoard> whiteboard(String id) async {
    final j = await _send('GET', '/v1/whiteboards/$id') as Map<String, dynamic>;
    return SavedBoard.fromJson(j['content'] as Map<String, dynamic>);
  }

  Future<WhiteboardSummary> shareWhiteboard(String id) async =>
      WhiteboardSummary.fromJson(await _send('POST', '/v1/whiteboards/$id/share') as Map<String, dynamic>);

  Future<List<Student>> roster() async {
    final j = await _send('GET', '/v1/sessions/current') as Map<String, dynamic>;
    return (j['roster'] as List<dynamic>).map((e) => Student.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Sends outbox operations. Returns the opIds the server has (applied or duplicate) and
  /// the ones it rejected; anything else should be retried.
  Future<({Set<String> done, Map<String, String> rejected})> pushOps(List<Map<String, dynamic>> ops) async {
    final j = await _send('POST', '/v1/sync/push', body: {'ops': ops}) as Map<String, dynamic>;
    final done = <String>{};
    final rejected = <String, String>{};
    for (final r in (j['results'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      if (r['status'] == 'rejected') {
        rejected[r['opId'] as String] = r['reason'] as String? ?? 'rejected';
      } else {
        done.add(r['opId'] as String);
      }
    }
    return (done: done, rejected: rejected);
  }

  Future<List<BroadcastMessage>> pendingBroadcasts() async {
    final list = await _send('GET', '/v1/broadcasts/pending') as List<dynamic>;
    return list.map((e) => BroadcastMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markDisplayed(String id) async => _send('POST', '/v1/broadcasts/$id/displayed');
  Future<void> acknowledge(String id) async => _send('POST', '/v1/broadcasts/$id/ack');

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true, bool useDeviceToken = false}) async {
    final token = useDeviceToken ? deviceToken : (sessionToken ?? deviceToken);
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);
    final res = await http.Response.fromStream(await _http.send(req));
    if (res.statusCode >= 400) {
      String message = 'Request failed (${res.statusCode})';
      try {
        final m = (jsonDecode(res.body) as Map)['message'];
        if (m is String) message = m;
      } catch (_) {}
      throw ApiException(res.statusCode, message);
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }
}

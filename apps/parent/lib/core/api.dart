import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);

  /// HTTP status, or 0 when the server could not be reached.
  final int status;
  final String message;

  @override
  String toString() => message;
}

/// Everything the Parent App asks of the KINETIX Cloud API. Tests use a fake.
abstract class ParentApi {
  String get baseUrl;
  set baseUrl(String value);

  /// User access token after sign-in.
  String? get token;
  set token(String? value);

  /// Signs in and stores the token on this client.
  Future<void> login({required String tenant, required String login, required String password});
  Future<Me> me();
  Future<List<Child>> children();

  /// Attendance, homework, class participation and shared boards over the last [days] days.
  Future<ChildSummary> summary(String childId, {int days = 30});

  /// Every period's mark over the last [days] days, newest day first.
  Future<List<ClassMark>> attendance(String childId, {int days = 30});
  Future<Inbox> notifications();
  Future<void> markRead(String notificationId);
  Future<void> markAllRead();
  Future<SharedBoard> whiteboard(String id);

  /// One homework (opened from a notification), with the class it was set for.
  Future<({Homework homework, String sectionId})> homeworkById(String id);
}

class HttpParentApi implements ParentApi {
  HttpParentApi({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  @override
  String baseUrl;
  @override
  String? token;
  final http.Client _http;

  /// Called when the server rejects the token (expired or revoked), so the app can sign out.
  void Function()? onUnauthorized;

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    final j = await _send('POST', '/v1/auth/login', body: {'tenant': tenant, 'login': login, 'password': password}, auth: false);
    token = j['accessToken'] as String;
  }

  @override
  Future<Me> me() async => Me.fromJson(await _send('GET', '/v1/me'));

  @override
  Future<List<Child>> children() async => [
    for (final c in await _send('GET', '/v1/parent/children') as List) Child.fromJson(c as Map<String, dynamic>),
  ];

  @override
  Future<({Homework homework, String sectionId})> homeworkById(String id) async {
    final j = await _send('GET', '/v1/homework/$id') as Map<String, dynamic>;
    return (
      homework: Homework.fromJson({
        ...j,
        'subject': (j['subject'] as Map<String, dynamic>)['name'],
        'teacher': (j['createdBy'] as Map<String, dynamic>)['fullName'],
      }),
      sectionId: (j['section'] as Map<String, dynamic>)['id'] as String,
    );
  }

  @override
  Future<ChildSummary> summary(String childId, {int days = 30}) async =>
      ChildSummary.fromJson(await _send('GET', '/v1/parent/children/$childId/summary?days=$days'));

  @override
  Future<List<ClassMark>> attendance(String childId, {int days = 30}) async => [
    for (final m in await _send('GET', '/v1/parent/children/$childId/attendance?days=$days') as List)
      ClassMark.fromJson(m as Map<String, dynamic>),
  ];

  @override
  Future<Inbox> notifications() async => Inbox.fromJson(await _send('GET', '/v1/notifications'));

  @override
  Future<void> markRead(String notificationId) async => _send('POST', '/v1/notifications/$notificationId/read');

  @override
  Future<void> markAllRead() async => _send('POST', '/v1/notifications/read-all');

  @override
  Future<SharedBoard> whiteboard(String id) async => SharedBoard.fromJson(await _send('GET', '/v1/whiteboards/$id'));

  Future<dynamic> _send(String method, String path, {Object? body, bool auth = true}) async {
    final req = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers['accept'] = 'application/json';
    if (auth && token != null) req.headers['authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to respond. Try again.');
    } catch (_) {
      throw ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address.");
    }

    if (res.statusCode >= 400) {
      if (res.statusCode == 401 && auth) onUnauthorized?.call();
      throw ApiException(res.statusCode, _message(res));
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }

  static String _message(http.Response res) {
    try {
      final m = (jsonDecode(res.body) as Map)['message'];
      if (m is String) return m;
      if (m is Map && m['message'] is String) return m['message'] as String;
      if (m is Map && m['fieldErrors'] is Map) {
        final first = (m['fieldErrors'] as Map).entries.firstOrNull;
        if (first != null) return '${first.key}: ${(first.value as List).first}';
      }
    } catch (_) {}
    return switch (res.statusCode) {
      403 => "You don't have access to this.",
      404 => 'Not found.',
      429 => 'Too many attempts. Wait a minute and try again.',
      _ => 'Something went wrong (${res.statusCode}). Try again.',
    };
  }
}

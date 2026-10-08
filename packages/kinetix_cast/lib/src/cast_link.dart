import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'cast_models.dart';

/// Event names from packages/shared (RealtimeEvents).
abstract final class CastEvents {
  static const request = 'cast.request';
  static const approved = 'cast.approved';
  static const signal = 'cast.signal';
  static const stop = 'cast.stop';
  static const ended = 'cast.ended';
}

/// What the server tells the sender during a cast.
sealed class CastEvent {
  const CastEvent(this.castId);
  final String castId;
}

/// The class teacher approved on the board: start the WebRTC offer.
class CastApprovedEvent extends CastEvent {
  const CastApprovedEvent(super.castId, this.iceServers);
  final List<IceServer> iceServers;
}

/// The board's answer or an ICE candidate.
class CastSignalEvent extends CastEvent {
  const CastSignalEvent(super.castId, this.data);
  final Map<String, dynamic> data;
}

class CastEndedEvent extends CastEvent {
  const CastEndedEvent(super.castId, this.reason);
  final CastEndReason reason;
}

/// The sender's line to KINETIX Cloud: ask to cast, relay WebRTC signalling, stop.
abstract class CastLink {
  Stream<CastEvent> get events;
  Future<CastRequestResult> request(String deviceId);
  void signal(String castId, Map<String, dynamic> data);
  void stop(String castId);
  void close();
}

/// socket.io on the `/realtime` namespace with the person's own token (like the phone remote).
class SocketCastLink implements CastLink {
  SocketCastLink({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  io.Socket? _socket;
  final _events = StreamController<CastEvent>.broadcast();

  @override
  Stream<CastEvent> get events => _events.stream;

  Future<io.Socket> _connected() async {
    final existing = _socket;
    if (existing != null && existing.connected) return existing;
    existing?.dispose();
    final ready = Completer<void>();
    final socket = io.io('$baseUrl/realtime', io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).disableAutoConnect().build());
    socket
      ..on('ready', (_) {
        if (!ready.isCompleted) ready.complete();
      })
      ..on('error', (_) {
        if (!ready.isCompleted) ready.completeError(StateError('Your session has ended. Sign in again.'));
      })
      ..on(CastEvents.approved, (d) {
        if (d is Map) _events.add(CastApprovedEvent(d['castId'] as String, IceServer.list(d['iceServers'])));
      })
      ..on(CastEvents.signal, (d) {
        if (d is Map && d['data'] is Map) _events.add(CastSignalEvent(d['castId'] as String, Map<String, dynamic>.from(d['data'] as Map)));
      })
      ..on(CastEvents.ended, (d) {
        if (d is Map) _events.add(CastEndedEvent(d['castId'] as String, CastEndReason.parse(d['reason'] as String?)));
      })
      ..connect();
    _socket = socket;
    await ready.future.timeout(const Duration(seconds: 10));
    return socket;
  }

  @override
  Future<CastRequestResult> request(String deviceId) async {
    try {
      final socket = await _connected();
      final done = Completer<Object?>();
      socket.emitWithAck(CastEvents.request, {'deviceId': deviceId}, ack: (Object? r) {
        if (!done.isCompleted) done.complete(r);
      });
      return CastRequestResult.fromJson(await done.future.timeout(const Duration(seconds: 10)));
    } catch (e) {
      return CastRequestResult(ok: false, error: e is StateError ? e.message : 'Could not reach KINETIX Cloud');
    }
  }

  @override
  void signal(String castId, Map<String, dynamic> data) => _socket?.emit(CastEvents.signal, {'castId': castId, 'data': data});

  @override
  void stop(String castId) => _socket?.emit(CastEvents.stop, {'castId': castId});

  @override
  void close() {
    _socket?.dispose();
    _socket = null;
    unawaited(_events.close());
  }
}

/// GET /v1/cast/boards: the boards with a class this person may cast to now.
Future<List<CastBoard>> fetchCastBoards({required String baseUrl, required String token, http.Client? client}) async {
  final c = client ?? http.Client();
  final res = await c.get(Uri.parse('$baseUrl/v1/cast/boards'), headers: {'authorization': 'Bearer $token'}).timeout(const Duration(seconds: 10));
  if (res.statusCode != 200) throw StateError('Could not load boards (${res.statusCode})');
  return [for (final j in _decode(res.body)) CastBoard.fromJson(Map<String, dynamic>.from(j as Map))];
}

List<dynamic> _decode(String body) => (body.isEmpty ? const [] : (jsonDecode(body) as List<dynamic>));

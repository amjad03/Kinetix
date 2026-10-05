import 'dart:async';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;

/// What the board shows, as it tells the phone remote (RemoteBoardState in packages/shared).
class RemoteBoardState {
  const RemoteBoardState({this.page = 0, this.pages = 1, this.recording = false, this.timerRunning = false, this.slide, this.slides = 0});

  factory RemoteBoardState.fromJson(Map<String, dynamic> j) {
    final slide = j['slide'] as Map?;
    return RemoteBoardState(
      page: (j['page'] as num?)?.toInt() ?? 0,
      pages: (j['pages'] as num?)?.toInt() ?? 1,
      recording: j['recording'] == true,
      timerRunning: j['timerRunning'] == true,
      slide: (slide?['index'] as num?)?.toInt(),
      slides: (slide?['count'] as num?)?.toInt() ?? 0,
    );
  }

  final int page;
  final int pages;
  final bool recording;
  final bool timerRunning;

  /// The open slide or PDF page (0-based), or null when none is open on the board.
  final int? slide;
  final int slides;
}

/// The phone's link to the board it drives. The server checks every command: only the teacher
/// whose class is open on that board may send them.
abstract class RemoteLink {
  /// Connects to [boardId]; null when attached, otherwise the server's reason (English).
  Future<String?> attach(String boardId);

  /// One command (`{type: 'page.next'}`, `{type: 'timer.start', seconds: 120}`…). False when the
  /// server refused it (the class has ended).
  Future<bool> send(Map<String, Object?> command);

  /// Shows a photo (JPEG) on the board: uploaded to the API, then the board fetches it.
  Future<void> sendPhoto(String boardId, String photoId, Uint8List jpeg);

  Stream<RemoteBoardState> get state;

  void close();
}

/// The real link: its own socket on `/realtime` while the remote is open, and the API for photos.
class SocketRemoteLink implements RemoteLink {
  SocketRemoteLink({required this.baseUrl, required this.token, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final String token;
  final http.Client _http;
  io.Socket? _socket;
  final _state = StreamController<RemoteBoardState>.broadcast();

  @override
  Stream<RemoteBoardState> get state => _state.stream;

  Future<io.Socket> _connected() async {
    final existing = _socket;
    if (existing != null && existing.connected) return existing;
    existing?.dispose();
    final ready = Completer<void>();
    final socket = io.io(
      '$baseUrl/realtime',
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).disableAutoConnect().enableReconnection().build(),
    );
    socket
      ..on('ready', (_) {
        if (!ready.isCompleted) ready.complete();
      })
      ..on('remote.state', (d) {
        if (d is Map) _state.add(RemoteBoardState.fromJson(Map<String, dynamic>.from(d)));
      })
      ..connect();
    _socket = socket;
    await ready.future.timeout(const Duration(seconds: 10));
    return socket;
  }

  Future<Map<String, dynamic>> _ack(String event, Object data) async {
    final socket = await _connected();
    final done = Completer<Map<String, dynamic>>();
    socket.emitWithAck(event, data, ack: (Object? reply) {
      if (!done.isCompleted) done.complete(reply is Map ? Map<String, dynamic>.from(reply) : const {'ok': false});
    });
    return done.future.timeout(const Duration(seconds: 8), onTimeout: () => const {'ok': false, 'error': 'The board did not answer'});
  }

  @override
  Future<String?> attach(String boardId) async {
    try {
      final r = await _ack('remote.attach', {'deviceId': boardId});
      return r['ok'] == true ? null : (r['error'] as String? ?? 'Could not connect');
    } catch (e) {
      return '$e';
    }
  }

  @override
  Future<bool> send(Map<String, Object?> command) async {
    // Pointer moves are many a second: fire and forget.
    if (command['type'] == 'pointer') {
      _socket?.emit('remote.command', command);
      return true;
    }
    try {
      return (await _ack('remote.command', command))['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> sendPhoto(String boardId, String photoId, Uint8List jpeg) async {
    final res = await _http.put(
      Uri.parse('$baseUrl/v1/remote/$boardId/photos/$photoId'),
      headers: {'authorization': 'Bearer $token', 'content-type': 'image/jpeg'},
      body: jpeg,
    );
    if (res.statusCode >= 400) throw Exception('Photo not sent (${res.statusCode})');
  }

  @override
  void close() {
    _socket?.dispose();
    _socket = null;
    unawaited(_state.close());
  }
}

/// The demo's board: answers every command at once and keeps its own page, timer and recording.
class DemoRemoteLink implements RemoteLink {
  final _state = StreamController<RemoteBoardState>.broadcast();
  RemoteBoardState _now = const RemoteBoardState(pages: 3, slide: 0, slides: 12);

  /// Commands received (tests).
  final commands = <Map<String, Object?>>[];
  int photos = 0;

  @override
  Stream<RemoteBoardState> get state => _state.stream;

  void _set(RemoteBoardState s) {
    _now = s;
    scheduleMicrotask(() {
      if (!_state.isClosed) _state.add(s);
    });
  }

  @override
  Future<String?> attach(String boardId) async {
    _set(_now);
    return null;
  }

  @override
  Future<bool> send(Map<String, Object?> c) async {
    commands.add(c);
    final s = _now;
    RemoteBoardState copy({int? page, int? pages, bool? recording, bool? timerRunning, int? slide}) => RemoteBoardState(
      page: page ?? s.page,
      pages: pages ?? s.pages,
      recording: recording ?? s.recording,
      timerRunning: timerRunning ?? s.timerRunning,
      slide: slide ?? s.slide,
      slides: s.slides,
    );
    switch (c['type']) {
      case 'page.next':
        _set(copy(page: s.page + 1, pages: s.page + 1 >= s.pages ? s.pages + 1 : s.pages));
      case 'page.previous':
        _set(copy(page: s.page > 0 ? s.page - 1 : 0));
      case 'slide.next':
        _set(copy(slide: ((s.slide ?? 0) + 1).clamp(0, s.slides - 1)));
      case 'slide.previous':
        _set(copy(slide: ((s.slide ?? 0) - 1).clamp(0, s.slides - 1)));
      case 'timer.start':
        _set(copy(timerRunning: true));
      case 'timer.stop':
        _set(copy(timerRunning: false));
      case 'recording.start':
        _set(copy(recording: true));
      case 'recording.stop':
        _set(copy(recording: false));
    }
    return true;
  }

  @override
  Future<void> sendPhoto(String boardId, String photoId, Uint8List jpeg) async => photos++;

  @override
  void close() => unawaited(_state.close());
}

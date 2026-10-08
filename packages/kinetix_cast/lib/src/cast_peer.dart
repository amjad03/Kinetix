import 'dart:async';

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'cast_models.dart';

/// The sender's WebRTC side, behind an interface so the cast flow can be tested without a device.
abstract class CastPeer {
  /// Asks the person to share their screen (the system's consent dialog). False when they decline.
  Future<bool> capture();

  /// Connects to the board: sends the offer through [onSignal]; [onLive] is called with true when
  /// media flows and false when the connection fails or the system stops the capture.
  Future<void> connect(List<IceServer> servers, {required void Function(Map<String, dynamic>) onSignal, required void Function(bool live) onLive});

  /// The board's answer or an ICE candidate.
  Future<void> handleSignal(Map<String, dynamic> data);

  Future<void> close();
}

typedef CastPeerFactory = CastPeer Function();

/// flutter_webrtc: `getDisplayMedia` (Android MediaProjection, desktop, web) and one peer connection.
class WebRtcCastPeer implements CastPeer {
  MediaStream? _stream;
  RTCPeerConnection? _pc;
  final _pendingIce = <RTCIceCandidate>[];
  var _remoteSet = false;

  static bool get _android => !kIsWeb && Platform.isAndroid;

  /// Android 10+ only lets an app capture the screen while a foreground service of type
  /// mediaProjection runs (declared in the app's manifest); on Android 14 it may start only after
  /// the person has agreed to the capture.
  Future<void> _startService() async {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(channelId: 'kinetix_cast', channelName: 'Screen sharing', channelDescription: 'Shown while your screen is on the classroom board.'),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(eventAction: ForegroundTaskEventAction.nothing()),
    );
    await FlutterForegroundTask.startService(
      serviceId: 7410,
      serviceTypes: [ForegroundServiceTypes.mediaProjection],
      notificationTitle: 'KINETIX',
      notificationText: 'Your screen is being shared to the board',
    );
  }

  @override
  Future<bool> capture() async {
    try {
      if (_android) {
        if (!await Helper.requestCapturePermission()) return false;
        await _startService();
      }
      _stream = await navigator.mediaDevices.getDisplayMedia({'video': {'frameRate': 15}, 'audio': false});
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> connect(List<IceServer> servers, {required void Function(Map<String, dynamic>) onSignal, required void Function(bool live) onLive}) async {
    final stream = _stream;
    if (stream == null) throw StateError('Share the screen first');
    final pc = await createPeerConnection({'iceServers': [for (final s in servers) s.toMap()], 'sdpSemantics': 'unified-plan'});
    _pc = pc;
    for (final track in stream.getTracks()) {
      await pc.addTrack(track, stream);
      // The system's own "stop sharing" (Android's notification, the browser bar) ends the cast.
      track.onEnded = () => onLive(false);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate != null) onSignal({'type': 'candidate', 'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex});
    };
    pc.onConnectionState = (s) {
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateConnected) onLive(true);
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed || s == RTCPeerConnectionState.RTCPeerConnectionStateClosed) onLive(false);
    };
    final offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    onSignal({'type': 'offer', 'sdp': offer.sdp});
  }

  @override
  Future<void> handleSignal(Map<String, dynamic> data) async {
    final pc = _pc;
    if (pc == null) return;
    switch (data['type']) {
      case 'answer':
        await pc.setRemoteDescription(RTCSessionDescription(data['sdp'] as String?, 'answer'));
        _remoteSet = true;
        for (final c in _pendingIce) {
          await pc.addCandidate(c);
        }
        _pendingIce.clear();
      case 'candidate':
        final c = RTCIceCandidate(data['candidate'] as String?, data['sdpMid'] as String?, (data['sdpMLineIndex'] as num?)?.toInt());
        if (_remoteSet) {
          await pc.addCandidate(c);
        } else {
          _pendingIce.add(c);
        }
    }
  }

  @override
  Future<void> close() async {
    for (final t in _stream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _stream?.dispose();
    await _pc?.close();
    _stream = null;
    _pc = null;
    if (_android) {
      try {
        await FlutterForegroundTask.stopService();
      } catch (_) {}
    }
  }
}

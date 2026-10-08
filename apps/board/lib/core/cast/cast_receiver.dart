import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// The board's side of one cast: answers the sender's WebRTC offer and shows the video. Behind an
/// interface so the cast flow is tested without WebRTC.
abstract class CastReceiver {
  /// Gets ready for the sender's offer. [sendSignal] carries the answer and ICE candidates back
  /// (through the API); [onLive] says whether media is flowing.
  Future<void> start(List<Map<String, dynamic>> iceServers, {required void Function(Map<String, dynamic>) sendSignal, required void Function(bool live) onLive});

  /// The sender's offer or an ICE candidate.
  Future<void> handleSignal(Map<String, dynamic> data);

  /// The video, fitted to its box.
  Widget view();

  /// The picture on screen now as a PNG, or null where the platform cannot grab it.
  Future<Uint8List?> snapshot();

  Future<void> close();
}

typedef CastReceiverFactory = CastReceiver Function();

/// flutter_webrtc (Android panels and Windows): one receive-only peer connection.
class WebRtcCastReceiver implements CastReceiver {
  RTCPeerConnection? _pc;
  final _renderer = RTCVideoRenderer();
  MediaStream? _stream;
  final _pendingIce = <RTCIceCandidate>[];
  var _remoteSet = false;
  var _rendererReady = false;

  @override
  Future<void> start(List<Map<String, dynamic>> iceServers, {required void Function(Map<String, dynamic>) sendSignal, required void Function(bool live) onLive}) async {
    await _renderer.initialize();
    _rendererReady = true;
    final pc = await createPeerConnection({'iceServers': iceServers, 'sdpSemantics': 'unified-plan'});
    _pc = pc;
    await pc.addTransceiver(kind: RTCRtpMediaType.RTCRtpMediaTypeVideo, init: RTCRtpTransceiverInit(direction: TransceiverDirection.RecvOnly));
    pc.onTrack = (e) {
      if (e.streams.isNotEmpty) {
        _stream = e.streams.first;
        _renderer.srcObject = _stream;
      }
    };
    pc.onIceCandidate = (c) {
      if (c.candidate != null) sendSignal({'type': 'candidate', 'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex});
    };
    pc.onConnectionState = (s) {
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateConnected) onLive(true);
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed || s == RTCPeerConnectionState.RTCPeerConnectionStateClosed) onLive(false);
    };
    _sendSignal = sendSignal;
  }

  void Function(Map<String, dynamic>)? _sendSignal;

  @override
  Future<void> handleSignal(Map<String, dynamic> data) async {
    final pc = _pc;
    if (pc == null) return;
    switch (data['type']) {
      case 'offer':
        await pc.setRemoteDescription(RTCSessionDescription(data['sdp'] as String?, 'offer'));
        _remoteSet = true;
        for (final c in _pendingIce) {
          await pc.addCandidate(c);
        }
        _pendingIce.clear();
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _sendSignal?.call({'type': 'answer', 'sdp': answer.sdp});
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
  Widget view() => RTCVideoView(_renderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain);

  @override
  Future<Uint8List?> snapshot() async {
    final tracks = _stream?.getVideoTracks();
    if (tracks == null || tracks.isEmpty) return null;
    try {
      final frame = await tracks.first.captureFrame();
      return frame.asUint8List();
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> close() async {
    _renderer.srcObject = null;
    await _pc?.close();
    _pc = null;
    if (_rendererReady) await _renderer.dispose();
    _rendererReady = false;
  }
}
